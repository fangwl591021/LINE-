// Store invitations establish attribution only: no registration, rewards, cards or mother-site calls.
const PATH = '/v1/store-shop/invite/accept';
const UID = /^U[0-9a-f]{32}$/i;
const SHOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_ROLES = ['store', '店長', 'admin', '總管', 'user', '用戶'];
const ID_FIELDS = ['line_id', 'row_id', 'point_line_id', 'legacy_line_id'];
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const text = value => String(value ?? '').trim();
class InviteError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new InviteError(code, message, status); };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });

async function boundedJson(message, maxBytes) {
  if (Number(message.headers.get('Content-Length')) > maxBytes) fail('BODY_TOO_LARGE', '邀請資料過長', 413);
  const reader = message.body?.getReader();
  if (!reader) fail('INVALID_JSON', '邀請資料格式不正確');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); fail('BODY_TOO_LARGE', '邀請資料過長', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch { fail('INVALID_JSON', '邀請資料格式不正確'); }
}

async function authenticatedUid(request, fetcher) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 4096) fail('AUTH_REQUIRED', '請先使用 LINE 登入', 401);
  let response;
  try {
    response = await fetcher('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000)
    });
  } catch { fail('AUTH_UNAVAILABLE', 'LINE 身分驗證暫時無法完成，請稍後重試', 503); }
  if (!response.ok) fail('AUTH_EXPIRED', '登入已失效，請重新登入', 401);
  const profile = await boundedJson(response, 8192);
  if (typeof profile.userId !== 'string' || !UID.test(profile.userId)) fail('AUTH_INVALID', '無法確認 LINE 登入身分', 401);
  return profile.userId;
}

function matchesIds(alias, ids) {
  const placeholders = ids.map(() => '?').join(',');
  return { sql: ID_FIELDS.map(field => `${alias}.${field} IN (${placeholders})`).join(' OR '), args: ID_FIELDS.flatMap(() => ids) };
}
function matchesLinks(ids) {
  const placeholders = ids.map(() => '?').join(',');
  return { sql: `(old_line_id IN (${placeholders}) OR new_line_id IN (${placeholders}))`, args: [...ids, ...ids] };
}
async function rows(db, sql, args) {
  const result = await db.prepare(sql).bind(...args).all();
  if (result.success === false || !Array.isArray(result.results)) throw new Error('D1 read failed');
  return result.results;
}
const identityConflict = () => fail('IDENTITY_CONFLICT', '會員身分對應不唯一，請聯絡管理員確認；此次未變更歸屬', 409);

// Traverse only persisted, active identity links. Never use browser claims or name/phone guesses.
async function resolveIdentity(db, uid) {
  const ids = new Set([uid]); let found = [], links = [];
  for (let pass = 0; pass < 4; pass++) {
    const before = ids.size, match = matchesLinks([...ids]);
    links = await rows(db, `SELECT id,old_line_id,new_line_id FROM user_identity_links WHERE status='active' AND ${match.sql} LIMIT 3`, match.args);
    // Chains or multiple mappings are not sufficient authority for an automatic ownership write.
    if (links.length > 1) identityConflict();
    for (const link of links) {
      if (!UID.test(link.old_line_id) || !UID.test(link.new_line_id) || link.old_line_id === link.new_line_id) identityConflict();
      ids.add(link.old_line_id); ids.add(link.new_line_id);
    }
    const usersMatch = matchesIds('u', [...ids]);
    found = await rows(db, `SELECT u.* FROM users u WHERE ${usersMatch.sql} LIMIT 3`, usersMatch.args);
    if (found.length > 1) identityConflict();
    for (const row of found) for (const field of ID_FIELDS) if (text(row[field])) ids.add(text(row[field]));
    if (ids.size > 8) identityConflict();
    if (ids.size === before) {
      const canonicalId = links[0]?.new_line_id || (UID.test(found[0]?.line_id || '') ? found[0].line_id : uid);
      return { uid, ids: [...ids], row: found[0] || null, links, canonicalId };
    }
  }
  identityConflict();
}

// Recheck the identity graph inside the write statement, closing lookup/write races.
function identityGuard(identity) {
  const usersMatch = matchesIds('u', identity.ids), linksMatch = matchesLinks(identity.ids);
  let sql = `(SELECT count(*) FROM users u WHERE ${usersMatch.sql})=? AND (SELECT count(*) FROM user_identity_links WHERE status='active' AND ${linksMatch.sql})=?`;
  const args = [...usersMatch.args, identity.row ? 1 : 0, ...linksMatch.args, identity.links.length];
  if (identity.row) {
    sql += ` AND EXISTS(SELECT 1 FROM users u WHERE ${ID_FIELDS.map(field => `COALESCE(u.${field},'')=?`).join(' AND ')})`;
    args.push(...ID_FIELDS.map(field => identity.row[field] ?? ''));
  }
  for (const link of identity.links) {
    sql += " AND EXISTS(SELECT 1 FROM user_identity_links WHERE id=? AND old_line_id=? AND new_line_id=? AND status='active')";
    args.push(link.id, link.old_line_id, link.new_line_id);
  }
  return { sql, args };
}

async function verifiedShop(db, shopId, referrerId) {
  const shop = await db.prepare('SELECT id,owner_uid,status FROM store_shop_stores WHERE id=?').bind(shopId).first();
  if (!shop || shop.status !== 'active' || !UID.test(shop.owner_uid || '')) fail('SHOP_UNAVAILABLE', '店家商城尚未公開或已下架', 404);
  const owner = await resolveIdentity(db, shop.owner_uid);
  // Same owner eligibility as the public catalog; an alias alone cannot make a hidden store public.
  if (!owner.row || owner.row.line_id !== shop.owner_uid || !PUBLIC_ROLES.includes(text(owner.row.role).toLowerCase())) fail('SHOP_UNAVAILABLE', '店家商城尚未公開或已下架', 404);
  if (!owner.ids.includes(referrerId)) fail('REFERRER_MISMATCH', '邀請人與此店家不符，請重新取得店家的邀請連結', 400);
  const role = text(owner.row.role).toLowerCase();
  const networkId = ['admin', '總管'].includes(role) ? 'admin' : ['store', '店長'].includes(role) ? shop.owner_uid : text(owner.row.network_id) || text(owner.row.referrer_id) || 'admin';
  return { shop, owner, referrerId: shop.owner_uid, networkId };
}
function ownershipGuard(verified) {
  const identity = identityGuard(verified.owner), row = verified.owner.row;
  return {
    sql: `EXISTS(SELECT 1 FROM store_shop_stores s JOIN users o ON o.line_id=s.owner_uid WHERE s.id=? AND s.owner_uid=? AND s.status='active' AND COALESCE(o.role,'')=? AND COALESCE(o.network_id,'')=? AND COALESCE(o.referrer_id,'')=?) AND (${identity.sql})`,
    args: [verified.shop.id, verified.shop.owner_uid, row.role ?? '', row.network_id ?? '', row.referrer_id ?? '', ...identity.args]
  };
}
function protectedBinding(row, profileMapper) {
  if (!row) return false;
  if (text(row.referrer_id) || !['', 'admin'].includes(text(row.network_id)) || !['', 'user', '用戶'].includes(text(row.role).toLowerCase())) return true;
  const info = profileMapper(row);
  if (!info || typeof info.role !== 'string') throw new Error('Profile role unavailable');
  // Canonical security rules may recognize a protected administrator despite a legacy raw user role.
  return !['', 'user', '用戶'].includes(text(info.role).toLowerCase());
}
function resultFor(shopId, actorUserId, identity, status, profileMapper) {
  const row = identity.row;
  const info = row ? profileMapper(row) : null;
  if (row && !info) throw new Error('Profile mapping failed');
  if (info && (!text(row.name) || !text(row.phone))) { info.needsProfileCompletion = true; info.profileStatus = 'incomplete'; }
  return { success: true, shopId, actorUserId, binding: { status, referrerId: info?.referrerId ?? '', networkId: info?.networkId ?? 'admin' }, isRegistered: !!row, info };
}

export async function handleStoreInviteBinding(request, env, profileMapper, fetcher = fetch) {
  if (new URL(request.url).pathname !== PATH) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST') return reply({ success: false, code: 'METHOD_NOT_ALLOWED', error: '不支援此邀請操作' }, 405);
  try {
    const data = await boundedJson(request, 2048);
    if (Object.keys(data).some(key => !['shopId', 'referrerId'].includes(key)) || typeof data.shopId !== 'string' || typeof data.referrerId !== 'string' || !SHOP_ID.test(data.shopId) || !UID.test(data.referrerId)) fail('INVALID_INVITE', '店家邀請資料不正確');
    const actorUserId = await authenticatedUid(request, fetcher);
    if (!env.ACTMASTER_DB || typeof profileMapper !== 'function') throw new Error('Binding unavailable');
    const db = env.ACTMASTER_DB.withSession ? env.ACTMASTER_DB.withSession('first-primary') : env.ACTMASTER_DB;
    const verified = await verifiedShop(db, data.shopId, data.referrerId);
    const actor = await resolveIdentity(db, actorUserId);
    if (actor.ids.some(id => verified.owner.ids.includes(id))) return reply(resultFor(data.shopId, actorUserId, actor, 'self', profileMapper));
    if (protectedBinding(actor.row, profileMapper)) return reply(resultFor(data.shopId, actorUserId, actor, 'existing', profileMapper));
    const ownership = ownershipGuard(verified), identity = identityGuard(actor);
    let statement;
    if (actor.row) {
      statement = db.prepare(`UPDATE users SET referrer_id=?,network_id=? WHERE row_id=? AND TRIM(COALESCE(referrer_id,''))='' AND TRIM(COALESCE(network_id,'')) IN ('','admin') AND lower(TRIM(COALESCE(role,''))) IN ('','user','用戶') AND COALESCE(name,'')=? AND COALESCE(phone,'')=? AND (${ownership.sql}) AND (${identity.sql})`)
        .bind(verified.referrerId, verified.networkId, actor.row.row_id, actor.row.name ?? '', actor.row.phone ?? '', ...ownership.args, ...identity.args);
    } else {
      const link = actor.links[0];
      statement = db.prepare(`INSERT INTO users(row_id,line_id,role,referrer_id,network_id,legacy_line_id,point_line_id,identity_source) SELECT ?,?,'user',?,?,?,?,? WHERE (${ownership.sql}) AND (${identity.sql}) ON CONFLICT(line_id) DO NOTHING`)
        .bind(actor.canonicalId, actor.canonicalId, verified.referrerId, verified.networkId, link?.old_line_id || '', link?.new_line_id || '', 'store_invite_login', ...ownership.args, ...identity.args);
    }
    const write = await statement.run();
    if (write.success === false) throw new Error('D1 write failed');
    const current = await resolveIdentity(db, actorUserId);
    if (!current.row || !protectedBinding(current.row, profileMapper)) fail('INVITE_CHANGED', '店家或會員資料已變更，請重新開啟邀請連結再試', 409);
    const changed = Number(write.meta?.changes || 0) > 0;
    if (changed && env.ACTMASTER_KV?.delete) {
      // Cache failures cannot roll back an already committed binding; response uses authoritative D1 data.
      await Promise.all([...new Set([...actor.ids, ...current.ids])].map(async id => { try { await env.ACTMASTER_KV.delete(`U_PROFILE_${id}`); } catch { /* committed D1 is authoritative */ } }));
    }
    return reply(resultFor(data.shopId, actorUserId, current, changed ? 'bound' : 'existing', profileMapper));
  } catch (error) {
    if (error instanceof InviteError) return reply({ success: false, code: error.code, error: error.message }, error.status);
    return reply({ success: false, code: 'INVITE_UNAVAILABLE', error: '暫時無法確認邀請歸屬，請稍後重試' }, 503);
  }
}
