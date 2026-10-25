// Administrative display config only. No point writes, mother forwarding or LINE sends.
import { authorizeStoreAdmin } from './store-admin.mjs';
import { CheckinDashboardError, defaultCheckinDashboardConfig, normalizeCheckinDashboardConfig, buildCheckinDashboardMessage } from './checkin-chat-dashboard-render.mjs';
const ROOT = '/v1/checkin-chat-dashboard', KEY = 'member_checkin';
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ACTOR = ['row_id', 'line_id', 'legacy_line_id', 'point_line_id', 'role', 'name', 'phone'];
const IDS = ['line_id', 'row_id', 'legacy_line_id', 'point_line_id'];
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const reply = (data, status = 200) => Response.json(data, { status, headers: HEADERS });
const fail = (code, message, status = 400) => { throw new CheckinDashboardError(code, message, status); };
const revision = value => Number.isSafeInteger(value) && value >= 0 && value < 1e9;
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => fields.includes(key)) && fields.every(key => Object.hasOwn(value, key));
async function json(request) {
  const max = 65536;
  if (Number(request.headers.get('Content-Length')) > max) fail('BODY_TOO_LARGE', '卡片內容過大', 413);
  const reader = request.body?.getReader(); if (!reader) fail('INVALID_REQUEST', '卡片內容格式不正確');
  const chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); fail('BODY_TOO_LARGE', '卡片內容過大', 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { const value = JSON.parse(new TextDecoder().decode(bytes)); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
  catch { fail('INVALID_REQUEST', '卡片內容格式不正確'); }
}
function config(value) {
  const normalized = normalizeCheckinDashboardConfig(value);
  // Check against a long, valid LIFF id and the largest authoritative integer balance.
  // A later balance read cannot make an already-published template exceed the Flex cap.
  buildCheckinDashboardMessage({ POINT_LIFF_ID: '1-' + 'a'.repeat(98) }, '00000000-0000-0000-0000-000000000000', Number.MAX_SAFE_INTEGER, Date.parse('9999-01-01T00:00:00Z'), normalized);
  return normalized;
}
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
function template(row) {
  if (!row || !revision(row.draft_revision) || !revision(row.published_revision)) fail('TEMPLATE_UNAVAILABLE', '卡片設定尚未準備完成', 503);
  return { key: KEY, draftRevision: row.draft_revision, publishedRevision: row.published_revision, draftConfig: config(JSON.parse(row.draft_json)), publishedConfig: config(JSON.parse(row.published_json)), updatedAt: date(row.updated_at), publishedAt: date(row.published_at) };
}
async function current(db) { return db.prepare('SELECT * FROM checkin_chat_dashboard_templates WHERE template_key=?').bind(KEY).first(); }
export async function readPublishedCheckinDashboard(db) {
  try {
    const row = await db.prepare('SELECT published_revision,published_json FROM checkin_chat_dashboard_templates WHERE template_key=?').bind(KEY).first();
    if (!row || !revision(row.published_revision)) throw Error('Missing template');
    return { revision: row.published_revision, config: config(JSON.parse(row.published_json)) };
  } catch { return { revision: 0, config: defaultCheckinDashboardConfig() }; }
}
export async function readCheckinDashboardSnapshots(db, cardIds) {
  const output = new Map();
  if (!Array.isArray(cardIds) || cardIds.length > 80 || cardIds.some(id => typeof id !== 'string' || !UUID.test(id))) return output;
  const ids = [...new Set(cardIds)]; if (!ids.length) return output;
  try {
    const result = await db.prepare(`SELECT s.card_id,s.template_revision,s.config_json,s.message_json,s.created_at,c.created_at AS card_created_at
      FROM checkin_chat_dashboard_snapshots s JOIN checkin_mall_cards c ON c.id=s.card_id
      WHERE s.card_id IN (SELECT value FROM json_each(?)) LIMIT 80`).bind(JSON.stringify(ids)).all();
    if (result.success === false || !Array.isArray(result.results)) return output;
    for (const row of result.results) {
      try {
        if (!ids.includes(row.card_id) || !revision(row.template_revision) || !Number.isSafeInteger(row.created_at) || row.created_at < 0 || row.created_at !== row.card_created_at || !Number.isFinite(new Date(row.created_at).getTime()) || typeof row.config_json !== 'string' || row.config_json.length > 65536 || typeof row.message_json !== 'string' || row.message_json.length > 65536) continue;
        const normalized = config(JSON.parse(row.config_json)), message = JSON.parse(row.message_json);
        if (!message || message.type !== 'flex' || message.altText !== normalized.altText || message.contents?.type !== 'carousel' || !Array.isArray(message.contents.contents) || message.contents.contents.length !== normalized.pages.length || new TextEncoder().encode(JSON.stringify(message.contents)).length > 50000) continue;
        output.set(row.card_id, { templateRevision: row.template_revision, config: normalized, message, createdAt: row.created_at });
      } catch { /* Bad historical data cannot break the existing read-only transcript. */ }
    }
  } catch { /* Older deployments without this additive table retain their old preview. */ }
  return output;
}
export async function readCheckinDashboardSnapshot(db, cardId) { return (await readCheckinDashboardSnapshots(db, [cardId])).get(cardId) || null; }
async function hash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
async function authorityGate(db, uid, actor) {
  const actorIds = IDS.map(field => actor[field]).filter(value => typeof value === 'string' && value);
  const initial = [...new Set([uid, ...actorIds])], initialMarks = initial.map(() => '?').join(',');
  const links = await db.prepare(`SELECT old_line_id,new_line_id FROM user_identity_links WHERE status='active' AND (old_line_id IN (${initialMarks}) OR new_line_id IN (${initialMarks})) ORDER BY old_line_id,new_line_id LIMIT 3`).bind(...initial, ...initial).all();
  if (links.success === false || !Array.isArray(links.results)) throw Error('Authority unavailable');
  if (links.results.length > 1 || links.results.some(link => !/^U[0-9a-f]{32}$/i.test(link.old_line_id || '') || !/^U[0-9a-f]{32}$/i.test(link.new_line_id || '') || link.old_line_id === link.new_line_id) || !actorIds.includes(uid) && !links.results.some(link => link.old_line_id === uid && actorIds.includes(link.new_line_id) || link.new_line_id === uid && actorIds.includes(link.old_line_id))) fail('REVISION_CONFLICT', '管理身分已更新；請重新登入後再確認', 409);
  const ids = [...new Set([...initial, ...links.results.flatMap(link => [link.old_line_id, link.new_line_id])])], marks = ids.map(() => '?').join(',');
  const linkSql = `SELECT COALESCE(group_concat(pair,'|'),'') AS stamp FROM (SELECT old_line_id||'>'||new_line_id AS pair FROM user_identity_links WHERE status='active' AND (old_line_id IN (${marks}) OR new_line_id IN (${marks})) ORDER BY old_line_id,new_line_id)`;
  const stamp = links.results.map(link => link.old_line_id + '>' + link.new_line_id).join('|');
  return { sql: `EXISTS(SELECT 1 FROM users a WHERE ${ACTOR.map(field => 'a.' + field + ' IS ?').join(' AND ')})
    AND (SELECT count(*) FROM users a WHERE ${IDS.map(field => `a.${field} IN (${marks})`).join(' OR ')})=1
    AND (${linkSql.replace(' AS stamp', '')})=?`, args: [...ACTOR.map(field => actor[field] ?? null), ...IDS.flatMap(() => ids), ...ids, ...ids, stamp] };
}
function replay(row, key, digest, action, uid) {
  if (row?.last_request_key !== key) return false;
  if (row.last_request_hash !== digest || row.last_request_action !== action || row.last_request_actor !== uid) fail('REQUEST_CONFLICT', '送出編號已使用，請保留內容並重新載入版本', 409);
  return true;
}
export async function handleCheckinChatDashboard(request, env, profileMapper, fetcher = fetch, now = Date.now()) {
  const url = new URL(request.url);
  if (url.pathname !== ROOT && !url.pathname.startsWith(ROOT + '/')) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  try {
    const action = url.pathname.slice(ROOT.length + 1);
    if (url.search) fail('INVALID_QUERY', '卡片設定不接受網址參數');
    if ((!action && request.method !== 'GET') || (action && !['draft', 'publish', 'preview'].includes(action))) fail('NOT_FOUND', '查無此卡片設定功能', 404);
    if (action && request.method !== 'POST') fail('METHOD_NOT_ALLOWED', '請使用正確的儲存方式', 405);
    const { uid, db, actor } = await authorizeStoreAdmin(request, env, profileMapper, fetcher);
    if (!action) return reply({ success: true, template: template(await current(db)) });
    const input = await json(request);
    if (action === 'preview') {
      if (!exact(input, ['config'])) fail('INVALID_REQUEST', '預覽內容格式不正確');
      const normalized = config(input.config), message = buildCheckinDashboardMessage(env, '00000000-0000-0000-0000-000000000000', 12867, now, normalized);
      // These values are examples, never a wallet read or a successful check-in claim.
      message.contents.contents[0].body.contents[0].contents.unshift({ type: 'text', text: '示範預覽・金額非實際餘額', size: 'xs', color: '#61786f', wrap: true });
      if (new TextEncoder().encode(JSON.stringify(message.contents)).length > 50000) fail('FLEX_TOO_LARGE', '預覽內容超過 50 KB，請減少文字或圖片網址');
      return reply({ success: true, message });
    }
    const fields = action === 'draft' ? ['expectedDraftRevision', 'config', 'requestKey'] : ['expectedDraftRevision', 'expectedPublishedRevision', 'requestKey'];
    if (!exact(input, fields) || !revision(input.expectedDraftRevision) || typeof input.requestKey !== 'string' || !UUID.test(input.requestKey) || action === 'publish' && !revision(input.expectedPublishedRevision)) fail('INVALID_REQUEST', '請重新載入版本後再儲存');
    const normalized = action === 'draft' ? config(input.config) : null;
    const digest = await hash(JSON.stringify({ action, expectedDraftRevision: input.expectedDraftRevision, ...(action === 'draft' ? { config: normalized } : { expectedPublishedRevision: input.expectedPublishedRevision }) }));
    let row = await current(db); template(row);
    if (replay(row, input.requestKey, digest, action, uid)) return reply({ success: true, template: template(row), replayed: true });
    const gate = await authorityGate(db, uid, actor), at = new Date(now).toISOString();
    const common = [at, uid, input.requestKey, digest, action, uid, KEY, input.expectedDraftRevision];
    const statement = action === 'draft'
      ? db.prepare(`UPDATE checkin_chat_dashboard_templates SET draft_json=?,draft_revision=draft_revision+1,updated_at=?,updated_by=?,last_request_key=?,last_request_hash=?,last_request_action=?,last_request_actor=? WHERE template_key=? AND draft_revision=? AND last_request_key IS NOT ? AND ${gate.sql}`).bind(JSON.stringify(normalized), ...common, input.requestKey, ...gate.args)
      : db.prepare(`UPDATE checkin_chat_dashboard_templates SET published_json=draft_json,published_revision=published_revision+1,published_at=?,published_by=?,last_request_key=?,last_request_hash=?,last_request_action=?,last_request_actor=? WHERE template_key=? AND draft_revision=? AND published_revision=? AND last_request_key IS NOT ? AND ${gate.sql}`).bind(...common, input.expectedPublishedRevision, input.requestKey, ...gate.args);
    const result = await statement.run(); if (result.success === false || !Number.isSafeInteger(result.meta?.changes)) throw Error('Save unavailable');
    row = await current(db);
    if (Number(result.meta.changes) !== 1 && !replay(row, input.requestKey, digest, action, uid)) fail('REVISION_CONFLICT', '內容或管理權限已更新；請保留本地編輯，重新載入版本後再確認', 409);
    return reply({ success: true, template: template(row), replayed: Number(result.meta.changes) !== 1 });
  } catch (error) {
    const status = error.status || 503;
    return reply({ success: false, code: error.code || 'DASHBOARD_UNAVAILABLE', error: status >= 500 ? '卡片設定暫時無法使用；尚未確認儲存成功' : error.message }, status);
  }
}
