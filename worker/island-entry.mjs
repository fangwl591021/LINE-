// Joined visitors can explore a safe projection without acquiring private-chat authority.
import { boundedJson, islandVisitorDirectorySql, islandVisitorDirectoryArgs } from './member-chat.mjs';
import { ExchangeZoneModule } from './exchange-zone.mjs';
import { resolveIslandMember, islandInteractionState, IslandAccessError } from './island-interaction-access.mjs';
import { hydrateMemberAvatars } from './member-chat-avatar.mjs';
import { memberIndustryLabel } from './member-chat-industry.mjs';
const BASE = '/v1/island-entry';
const UID = /^U[0-9a-f]{32}$/i;
const text = value => String(value ?? '').trim();
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: HEADERS });
const fail = (code, message, status = 400) => { throw new IslandAccessError(code, message, status); };
const statement = (db, sql, ...args) => db.prepare(sql).bind(...args);
async function rows(db, sql, ...args) {
  const result = await statement(db, sql, ...args).all();
  if (result.success === false || !Array.isArray(result.results)) throw Error('ISLAND_ENTRY_READ_FAILED');
  return result.results;
}
async function lineJson(fetcher, path, token, limit) {
  let response;
  try { response = await fetcher('https://api.line.me' + path, { headers: { Authorization: 'Bearer ' + token }, redirect: 'manual', signal: AbortSignal.timeout(8000) }); }
  catch { fail('AUTH_UNAVAILABLE', 'LINE 驗證暫時無法完成，請稍後重試', 503); }
  if ([401, 403].includes(response.status)) { await response.body?.cancel(); fail('AUTH_EXPIRED', '請重新登入 LINE 後再試', 401); }
  if (!response.ok) { await response.body?.cancel(); fail('AUTH_UNAVAILABLE', 'LINE 驗證暫時無法完成，請稍後重試', 503); }
  try { return await boundedJson(response, limit); }
  catch { fail('AUTH_UNAVAILABLE', 'LINE 驗證資料暫時無法確認，請稍後重試', 503); }
}
async function joinedIdentity(request, fetcher) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 4096) fail('AUTH_REQUIRED', '請先使用 LINE 登入', 401);
  const profile = await lineJson(fetcher, '/v2/profile', token, 8192);
  if (!UID.test(profile.userId || '')) fail('AUTH_INVALID', '無法確認 LINE 身分', 401);
  const friendship = await lineJson(fetcher, '/friendship/v1/status', token, 1024);
  if (typeof friendship.friendFlag !== 'boolean') fail('AUTH_UNAVAILABLE', '暫時無法確認點數通加入狀態，請稍後重試', 503);
  return { uid: profile.userId, joined: friendship.friendFlag };
}
const publicState = (stage, reviewStatus = '') => ({ success: true, stage, canVisit: stage !== 'join', canInteract: stage === 'ready', reviewStatus });
function anchorHandle(after) {
  if (!after) return '';
  try {
    if (!after.startsWith('island-v1:') || after.length > 800) throw Error();
    const value = JSON.parse(decodeURIComponent(atob(after.slice('island-v1:'.length))));
    if (!Array.isArray(value) || value.length !== 2 || value[0] !== 1 || typeof value[1] !== 'string' || !value[1] || value[1].length > 180 || /[/\\\u0000-\u001f\u007f]/.test(value[1])) throw Error();
    return value[1];
  } catch { fail('INVALID_CURSOR', '名單已變更，請重新載入人脈島'); }
}
export async function handleIslandEntry(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== BASE && !url.pathname.startsWith(BASE + '/')) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  try {
    if (request.method !== 'GET') fail('METHOD_NOT_ALLOWED', '參觀入口只提供讀取', 405);
    const path = url.pathname.slice(BASE.length);
    if (!['/status', '/members'].includes(path)) fail('NOT_FOUND', '找不到人脈島入口', 404);
    if ([...url.searchParams.keys()].some(key => path !== '/members' || key !== 'after' || url.searchParams.getAll(key).length !== 1)) fail('INVALID_QUERY', '參觀查詢條件不正確');
    const verified = await joinedIdentity(request, fetcher);
    if (!verified.joined) {
      if (path === '/members') fail('FOLLOW_REQUIRED', '請先加入點數通官方帳號，再進入人脈島參觀', 403);
      return reply(publicState('join'));
    }
    const db = env.ACTMASTER_DB?.withSession ? env.ACTMASTER_DB.withSession('first-primary') : env.ACTMASTER_DB;
    if (!db) throw Error('ISLAND_DB_UNAVAILABLE');
    const actor = await resolveIslandMember(db, verified.uid);
    if (!ExchangeZoneModule.access({}, env, { userId: verified.uid, role: actor?.user.role || 'user' }).access?.allowed) fail('ACCESS_DENIED', '交流專區尚未開放', 403);
    if (path === '/status') {
      const state = await islandInteractionState(db, actor);
      return reply(publicState(state.stage, state.reviewStatus));
    }
    const directoryActor = actor || { memberId: 'island-visitor:' + verified.uid, ids: [verified.uid], uid: verified.uid, user: { line_id: verified.uid } };
    const args = islandVisitorDirectoryArgs(directoryActor), sql = islandVisitorDirectorySql();
    const handle = anchorHandle(text(url.searchParams.get('after')));
    let anchor = '';
    if (handle) {
      const found = await statement(db, `SELECT peer FROM (${sql}) WHERE handle=?7 LIMIT 1`, ...args, handle).first();
      if (!found) fail('INVALID_CURSOR', '名單已變更，請重新載入人脈島');
      anchor = text(found.peer);
    }
    const selected = await rows(db, `SELECT * FROM (${sql}) WHERE peer>?7 ORDER BY peer LIMIT 31`, ...args, anchor);
    const page = selected.slice(0, 30), last = page.at(-1);
    const avatars = await hydrateMemberAvatars(db, env, {}, page, fetcher);
    const items = page.map(row => ({ handle: text(row.handle), name: text(row.name).slice(0, 80), company: text(row.company_name).slice(0, 100), title: text(row.title).slice(0, 80), avatarUrl: avatars.get(text(row.avatar_line_id)) || '', industry: memberIndustryLabel(row) }));
    return reply({ success: true, items, next: selected.length > 30 ? 'island-v1:' + btoa(encodeURIComponent(JSON.stringify([1, last.handle]))) : '' });
  } catch (error) {
    if (error instanceof IslandAccessError) return reply({ success: false, code: error.code, error: error.message }, error.status);
    console.error('island_entry_unavailable');
    return reply({ success: false, code: 'ISLAND_ENTRY_UNAVAILABLE', error: '人脈島資格暫時無法確認，請稍後重試' }, 503);
  }
}
