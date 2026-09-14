// Administrator directory: bounded reads only, with no catalog/points/order mutations.
const PATH = '/v1/store-shop/admin/stores';
const UID = /^U[0-9a-f]{32}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_FIELDS = ['line_id', 'row_id', 'legacy_line_id', 'point_line_id'];
const AUTH_COLUMNS = 'u.row_id,u.line_id,u.legacy_line_id,u.point_line_id,u.role,u.name,u.phone';
const PAGE_SIZE = 20;
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
class DirectoryError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status = 400) => { throw new DirectoryError(code, message, status); };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
const identityConflict = () => fail('IDENTITY_CONFLICT', '會員身分對應不唯一，請聯絡管理員確認', 409);

async function profileJson(response) {
  if (Number(response.headers.get('Content-Length')) > 8192) throw new Error('Profile too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Profile missing');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new Error('Profile too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const profile = JSON.parse(new TextDecoder().decode(bytes));
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Profile invalid');
  return profile;
}

async function authenticatedUid(request, fetcher) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 4096) fail('AUTH_REQUIRED', '請先使用 LINE 登入', 401);
  let response, profile;
  try {
    response = await fetcher('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000), redirect: 'error'
    });
  } catch { fail('AUTH_UNAVAILABLE', 'LINE 身分驗證暫時無法完成，請稍後重試', 503); }
  if (response.status === 401 || response.status === 403) fail('AUTH_EXPIRED', '登入已失效，請重新登入', 401);
  if (!response.ok) fail('AUTH_UNAVAILABLE', 'LINE 身分驗證暫時無法完成，請稍後重試', 503);
  try { profile = await profileJson(response); }
  catch { fail('AUTH_UNAVAILABLE', 'LINE 身分驗證暫時無法完成，請稍後重試', 503); }
  if (typeof profile.userId !== 'string' || !UID.test(profile.userId)) fail('AUTH_INVALID', '無法確認 LINE 登入身分', 401);
  return profile.userId;
}

async function rows(db, sql, args = []) {
  const result = await db.prepare(sql).bind(...args).all();
  if (result.success === false || !Array.isArray(result.results)) throw new Error('Directory read unavailable');
  return result.results;
}

// Only database aliases and a single active old/new link can identify the actor.
// Detect conflicting rows/links before asking the canonical role mapper for authority.
async function adminActor(db, uid, profileMapper) {
  const ids = new Set([uid]);
  for (let pass = 0; pass < 4; pass++) {
    const before = ids.size, values = [...ids], placeholders = values.map(() => '?').join(',');
    const links = await rows(db, `SELECT old_line_id,new_line_id FROM user_identity_links WHERE status='active' AND (old_line_id IN (${placeholders}) OR new_line_id IN (${placeholders})) LIMIT 3`, [...values, ...values]);
    if (links.length > 1) identityConflict();
    for (const link of links) {
      if (typeof link.old_line_id !== 'string' || typeof link.new_line_id !== 'string' || !UID.test(link.old_line_id) || !UID.test(link.new_line_id) || link.old_line_id === link.new_line_id) identityConflict();
      ids.add(link.old_line_id); ids.add(link.new_line_id);
    }
    const candidates = [...ids], markers = candidates.map(() => '?').join(',');
    const found = await rows(db, `SELECT ${AUTH_COLUMNS} FROM users u WHERE ${ID_FIELDS.map(field => `u.${field} IN (${markers})`).join(' OR ')} LIMIT 3`, ID_FIELDS.flatMap(() => candidates));
    if (found.length > 1) identityConflict();
    for (const row of found) for (const field of ID_FIELDS) if (typeof row[field] === 'string' && row[field]) ids.add(row[field]);
    if (ids.size > 8) identityConflict();
    if (ids.size === before) {
      if (!found[0] || profileMapper(found[0])?.role !== 'admin') fail('ADMIN_REQUIRED', '店家列表僅限管理員查詢', 403);
      return;
    }
  }
  identityConflict();
}

function filters(params) {
  for (const key of params.keys()) if (!['q', 'status', 'after'].includes(key) || params.getAll(key).length !== 1) fail('INVALID_QUERY', '店家查詢條件不正確');
  const rawQuery = params.get('q') || '', status = params.get('status') || '', after = params.get('after') || '';
  if (rawQuery.length > 80 || !['', 'active', 'draft'].includes(status) || (after && !UUID.test(after))) fail('INVALID_QUERY', '店家查詢條件不正確');
  return { q: rawQuery.trim(), status, after };
}

const OWNER_JOIN = 'LEFT JOIN users o ON o.line_id=s.owner_uid';
const FILTER = "(?='' OR s.status=?) AND (?='' OR instr(lower(s.name),lower(?))>0 OR instr(lower(s.category),lower(?))>0 OR instr(lower(s.address),lower(?))>0 OR instr(lower(s.phone),lower(?))>0 OR instr(lower(COALESCE(o.name,'')),lower(?))>0)";
const filterArgs = ({ status, q }) => [status, status, q, q, q, q, q, q];

async function directory(db, filter) {
  const fields = `s.id,substr(s.name,1,80) AS name,substr(s.category,1,40) AS category,s.status,substr(s.address,1,200) AS address,substr(s.phone,1,40) AS phone,s.owner_uid,substr(COALESCE(o.name,''),1,120) AS owner_name,substr(COALESCE(o.role,''),1,24) AS owner_role,
    (SELECT count(*) FROM store_shop_products p WHERE p.shop_id=s.id AND p.status!='archived') AS product_count,
    (SELECT count(*) FROM store_shop_products p WHERE p.shop_id=s.id AND p.status='active') AS active_product_count,
    (SELECT count(*) FROM store_shop_products p WHERE p.shop_id=s.id AND p.status='active' AND p.purchase_mode='online') AS online_product_count,
    (s.status='active' AND lower(COALESCE(o.role,'')) IN ('store','店長','admin','總管','user','用戶')) AS public_visible`;
  // A read-only batch keeps the displayed totals and current page on the same snapshot.
  const results = await db.batch([
    db.prepare("SELECT count(*) AS total,COALESCE(sum(status='active'),0) AS active,COALESCE(sum(status='draft'),0) AS draft FROM store_shop_stores"),
    db.prepare(`SELECT count(*) AS total FROM store_shop_stores s ${OWNER_JOIN} WHERE ${FILTER}`).bind(...filterArgs(filter)),
    db.prepare(`SELECT ${fields} FROM store_shop_stores s ${OWNER_JOIN} WHERE ${FILTER} AND s.id>? ORDER BY s.id LIMIT 21`).bind(...filterArgs(filter), filter.after)
  ]);
  if (results.length !== 3 || results.some(result => result.success === false || !Array.isArray(result.results))) throw new Error('Directory read unavailable');
  const summary = results[0].results[0], total = results[1].results[0]?.total, page = results[2].results;
  if (!summary || !Number.isSafeInteger(total)) throw new Error('Directory totals unavailable');
  return { success: true, shops: page.slice(0, PAGE_SIZE).map(shop => ({ ...shop, public_visible: !!shop.public_visible })), next: page.length > PAGE_SIZE ? page[PAGE_SIZE - 1].id : '', summary, filtered_total: total };
}

export async function handleStoreAdmin(request, env, profileMapper, fetcher = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== PATH) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'GET') return reply({ success: false, code: 'METHOD_NOT_ALLOWED', error: '店家列表僅提供唯讀查詢' }, 405);
  try {
    const filter = filters(url.searchParams), uid = await authenticatedUid(request, fetcher);
    if (!env.ACTMASTER_DB || typeof profileMapper !== 'function') throw new Error('Directory unavailable');
    const db = env.ACTMASTER_DB.withSession ? env.ACTMASTER_DB.withSession('first-primary') : env.ACTMASTER_DB;
    await adminActor(db, uid, profileMapper);
    return reply(await directory(db, filter));
  } catch (error) {
    if (error instanceof DirectoryError) return reply({ success: false, code: error.code, error: error.message }, error.status);
    return reply({ success: false, code: 'DIRECTORY_UNAVAILABLE', error: '店家列表暫時無法讀取，請稍後重試' }, 503);
  }
}
