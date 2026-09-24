// Private, text-only member conversations. Never writes inbox, cards or points.
import { ExchangeZoneModule } from './exchange-zone.mjs';
const BASE = '/v1/member-chat';
const UID = /^U[0-9a-f]{32}$/i;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const IDS = ['row_id', 'line_id', 'legacy_line_id', 'point_line_id'];
const PAGE = 30;
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const text = value => String(value ?? '').trim();
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
class ChatError extends Error { constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; } }
const fail = (code, message, status) => { throw new ChatError(code, message, status); };
const statement = (db, sql, ...args) => db.prepare(sql).bind(...args);
async function rows(db, sql, ...args) {
  const result = await statement(db, sql, ...args).all();
  if (result.success === false || !Array.isArray(result.results)) throw Error('CHAT_READ_FAILED');
  return result.results;
}
async function run(db, sql, ...args) {
  const result = await statement(db, sql, ...args).run();
  if (result.success === false) throw Error('CHAT_WRITE_FAILED');
  return result;
}
async function jsonBody(message, limit = 12288) {
  const reader = message.body?.getReader();
  if (!reader) fail('INVALID_BODY', '資料格式不正確');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); fail('BODY_TOO_LARGE', '訊息過長', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder().decode(buffer));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch { fail('INVALID_BODY', '資料格式不正確'); }
}
function keys(value, allowed) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('INVALID_FIELDS', '資料欄位不正確');
}
function cursor(value) {
  if (value == null || value === '') return 0;
  if (!/^\d{1,15}$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail('INVALID_CURSOR', '分頁位置不正確');
  return Number(value);
}
function registered(user) {
  return !!text(user?.row_id) && UID.test(user?.line_id || '') && !!text(user?.phone)
    && !!text(user?.name) && !['未命名', '待補資料'].includes(text(user.name));
}
// Resolve only persisted identity aliases, just as the existing private journal does.
async function identity(db, uid) {
  const ids = new Set([uid]);
  for (let pass = 0; pass < 4; pass++) {
    const count = ids.size, encoded = JSON.stringify([...ids]);
    const links = await rows(db, "SELECT old_line_id,new_line_id FROM user_identity_links WHERE status='active' AND (old_line_id IN (SELECT value FROM json_each(?1)) OR new_line_id IN (SELECT value FROM json_each(?1))) LIMIT 3", encoded);
    if (links.length > 1) fail('IDENTITY_CONFLICT', '會員身分對應不唯一，請聯絡管理員', 409);
    for (const link of links) {
      if (!UID.test(link.old_line_id) || !UID.test(link.new_line_id) || link.old_line_id === link.new_line_id) fail('IDENTITY_CONFLICT', '會員身分對應異常', 409);
      ids.add(link.old_line_id); ids.add(link.new_line_id);
    }
    const members = await rows(db, `SELECT row_id,line_id,legacy_line_id,point_line_id,name,phone,role FROM users WHERE ${IDS.map(key => `${key} IN (SELECT value FROM json_each(?1))`).join(' OR ')} LIMIT 3`, JSON.stringify([...ids]));
    if (members.length !== 1) fail('MEMBER_REQUIRED', '請先完成會員註冊；若已註冊，請聯絡管理員確認帳號', 403);
    for (const key of IDS) if (text(members[0][key])) ids.add(text(members[0][key]));
    if (ids.size > 8) fail('IDENTITY_CONFLICT', '會員身分對應異常', 409);
    if (count === ids.size) {
      if (!registered(members[0])) fail('REGISTRATION_REQUIRED', '請先完成會員姓名與電話資料', 403);
      return { user: members[0], memberId: text(members[0].row_id), ids: [...ids], uid };
    }
  }
  fail('IDENTITY_CONFLICT', '會員身分對應異常', 409);
}
async function authenticate(request, db, env, fetcher) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 4096) fail('AUTH_REQUIRED', '請重新進入 LINE 並登入', 401);
  let response;
  try {
    response = await fetcher('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
  } catch { fail('AUTH_UNAVAILABLE', 'LINE 驗證暫時無法完成，請稍後重試', 503); }
  if ([401, 403].includes(response.status)) fail('AUTH_EXPIRED', '登入已失效，請重新進入 LINE', 401);
  if (!response.ok) fail('AUTH_UNAVAILABLE', 'LINE 驗證暫時無法完成', 503);
  const profile = await jsonBody(response, 8192);
  if (!UID.test(profile.userId || '')) fail('AUTH_INVALID', '無法確認 LINE 身分', 401);
  const actor = await identity(db, profile.userId);
  const access = ExchangeZoneModule.access({}, env, { userId: actor.uid, role: actor.user.role });
  if (!access.access?.allowed) fail('ACCESS_DENIED', '交流專區尚未開放', 403);
  const card = await statement(db, `SELECT row_id FROM card_contacts WHERE source_type='self_profile'
    AND COALESCE(NULLIF(profile_user_id,''),NULLIF(line_id,''),owner_user_id) IN (SELECT value FROM json_each(?)) LIMIT 1`, JSON.stringify(actor.ids)).first();
  if (!card) fail('OWN_CARD_REQUIRED', '請先建立或認領本人的名片，收藏他人名片不適用', 403);
  return actor;
}
const PUBLIC_CARD = `c.source_type='self_profile' AND c.visibility='public' AND c.pool_eligible=1 AND c.ai_review_status='passed'`;
const CARD_JOIN = `COALESCE(NULLIF(c.profile_user_id,''),NULLIF(c.line_id,''),c.owner_user_id) IN (u.row_id,u.line_id,u.legacy_line_id,u.point_line_id)`;
const REGISTERED = `TRIM(COALESCE(u.line_id,''))<>'' AND TRIM(COALESCE(u.phone,''))<>'' AND TRIM(COALESCE(u.name,'')) NOT IN ('','未命名','待補資料')`;
const NO_BLOCK = `NOT EXISTS(SELECT 1 FROM member_chat_blocks b WHERE (b.member_id=?1 AND b.blocked_id=?2) OR (b.member_id=?2 AND b.blocked_id=?1))`;
async function cardTarget(db, handle) {
  if (typeof handle !== 'string' || !handle || handle.length > 180) fail('INVALID_MEMBER', '請重新選擇會員');
  const found = await rows(db, `SELECT u.row_id,u.line_id FROM card_contacts c JOIN users u ON ${CARD_JOIN} WHERE c.row_id=? AND ${PUBLIC_CARD} AND ${REGISTERED} LIMIT 3`, handle);
  if (found.length !== 1) fail('MEMBER_UNAVAILABLE', '對方目前未開放聯絡或名片狀態已變更', 403);
  // Resolve ambiguity/legacy aliases for the recipient too, before creating a conversation.
  return identity(db, found[0].line_id);
}
async function contactState(db, me, peer) {
  const blocked = await statement(db, 'SELECT member_id FROM member_chat_blocks WHERE (member_id=?1 AND blocked_id=?2) OR (member_id=?2 AND blocked_id=?1)', me, peer).all();
  const accepting = await statement(db, 'SELECT accepting FROM member_chat_preferences WHERE member_id=?', peer).first();
  return { blocked: blocked.results.length > 0, blockedByMe: blocked.results.some(row => row.member_id === me), accepting: accepting?.accepting !== 0 };
}
async function thread(db, actor, id) {
  if (!UUID.test(id)) fail('NOT_FOUND', '找不到對話', 404);
  const row = await statement(db, 'SELECT * FROM member_chat_threads WHERE id=?1 AND (member_a=?2 OR member_b=?2)', id, actor.memberId).first();
  if (!row) fail('NOT_FOUND', '找不到對話', 404);
  return { ...row, peer: row.member_a === actor.memberId ? row.member_b : row.member_a };
}
function message(row, me) {
  return { seq: row.seq, body: row.body, mine: row.sender_id === me, clientId: row.sender_id === me ? row.client_id : undefined, createdAt: row.created_at, read: !!row.read_at };
}
async function peerInfo(db, id) {
  // Only minimal account display name, not private contact fields or card contents.
  const row = await statement(db, 'SELECT name FROM users WHERE row_id=?', id).first();
  return { name: text(row?.name).slice(0, 80) || '會員' };
}
async function listMembers(db, actor, params) {
  const q = text(params.get('q')), after = text(params.get('after'));
  if (q.length > 60 || after.length > 180) fail('INVALID_QUERY', '搜尋條件過長');
  const result = await rows(db, `SELECT c.row_id AS handle,c.name,c.company_name,c.title FROM card_contacts c JOIN users u ON ${CARD_JOIN}
    WHERE ${PUBLIC_CARD} AND ${REGISTERED} AND CAST(u.row_id AS TEXT)<>?1 AND CAST(c.row_id AS TEXT)>?2
    AND COALESCE((SELECT accepting FROM member_chat_preferences WHERE member_id=CAST(u.row_id AS TEXT)),1)=1
    AND NOT EXISTS(SELECT 1 FROM member_chat_blocks b WHERE (b.member_id=?1 AND b.blocked_id=CAST(u.row_id AS TEXT)) OR (b.member_id=CAST(u.row_id AS TEXT) AND b.blocked_id=?1))
    AND (instr(lower(COALESCE(c.name,'')),lower(?3))>0 OR instr(lower(COALESCE(c.company_name,'')),lower(?3))>0 OR instr(lower(COALESCE(c.title,'')),lower(?3))>0)
    AND c.row_id=(SELECT c2.row_id FROM card_contacts c2 WHERE c2.source_type='self_profile' AND c2.visibility='public' AND c2.pool_eligible=1 AND c2.ai_review_status='passed'
      AND COALESCE(NULLIF(c2.profile_user_id,''),NULLIF(c2.line_id,''),c2.owner_user_id) IN (u.row_id,u.line_id,u.legacy_line_id,u.point_line_id) ORDER BY c2.updated_at DESC,c2.row_id DESC LIMIT 1)
    ORDER BY CAST(c.row_id AS TEXT) LIMIT 31`, actor.memberId, after, q);
  const items = result.slice(0, PAGE).map(row => ({ handle: text(row.handle), name: text(row.name).slice(0, 80), company: text(row.company_name).slice(0, 100), title: text(row.title).slice(0, 80) }));
  return { items, next: result.length > PAGE ? items.at(-1).handle : '' };
}
async function listThreads(db, actor, params) {
  const before = cursor(params.get('before')) || Number.MAX_SAFE_INTEGER;
  const result = await rows(db, `SELECT t.id,u.name,m.body,m.created_at,m.seq,
    (SELECT count(*) FROM member_chat_messages n WHERE n.thread_id=t.id AND n.sender_id<>?1 AND n.read_at IS NULL) AS unread
    FROM member_chat_threads t JOIN users u ON CAST(u.row_id AS TEXT)=CASE WHEN t.member_a=?1 THEN t.member_b ELSE t.member_a END
    JOIN member_chat_messages m ON m.seq=(SELECT MAX(seq) FROM member_chat_messages WHERE thread_id=t.id)
    WHERE (t.member_a=?1 OR t.member_b=?1) AND m.seq<?2 ORDER BY m.seq DESC LIMIT 31`, actor.memberId, before);
  const items = result.slice(0, PAGE).map(row => ({ id: row.id, name: text(row.name).slice(0, 80), preview: row.body.slice(0, 80), createdAt: row.created_at, unread: row.unread }));
  return { items, next: result.length > PAGE ? String(result[PAGE - 1].seq) : '' };
}
async function openThread(db, actor, body) {
  keys(body, ['cardHandle']);
  const peer = await cardTarget(db, body.cardHandle);
  if (peer.memberId === actor.memberId) fail('SELF_CHAT', '不能傳訊給自己');
  const state = await contactState(db, actor.memberId, peer.memberId);
  const [a, b] = [actor.memberId, peer.memberId].sort();
  const existing = await statement(db, 'SELECT id FROM member_chat_threads WHERE member_a=? AND member_b=?', a, b).first();
  if (state.blocked || (!state.accepting && !existing)) fail('CONTACT_CLOSED', '對方目前未開放聯絡', 403);
  if (!existing) await run(db, `INSERT INTO member_chat_threads(id,member_a,member_b)
    SELECT ?3,?4,?5 WHERE ${NO_BLOCK} AND COALESCE((SELECT accepting FROM member_chat_preferences WHERE member_id=?2),1)=1
    ON CONFLICT(member_a,member_b) DO NOTHING`, actor.memberId, peer.memberId, crypto.randomUUID(), a, b);
  const row = await statement(db, 'SELECT id FROM member_chat_threads WHERE member_a=? AND member_b=?', a, b).first();
  if (!row) fail('CONTACT_CLOSED', '對方目前未開放聯絡', 403);
  return { id: row.id, peer: await peerInfo(db, peer.memberId) };
}
async function send(db, actor, room, body) {
  keys(body, ['body', 'clientId']);
  if (typeof body.body !== 'string' || !body.body.trim() || [...body.body].length > 2000 || !UUID.test(body.clientId || '')) fail('INVALID_MESSAGE', '請輸入 1–2000 字的文字訊息');
  const content = body.body.trim();
  const previous = await statement(db, 'SELECT * FROM member_chat_messages WHERE sender_id=? AND client_id=?', actor.memberId, body.clientId).first();
  if (previous) {
    if (previous.thread_id !== room.id || previous.body !== content) fail('RETRY_CONFLICT', '這次重送的內容不一致，請重新傳送', 409);
    return { item: message(previous, actor.memberId), duplicate: true };
  }
  const peer = await statement(db, 'SELECT row_id,line_id,name,phone FROM users WHERE row_id=?', room.peer).first();
  if (!registered(peer)) fail('CONTACT_CLOSED', '對方目前無法接收訊息', 403);
  // One conditional write enforces block, first-contact preference and rate limits atomically.
  await run(db, `INSERT INTO member_chat_messages(thread_id,sender_id,client_id,body)
    SELECT ?3,?1,?4,?5 WHERE ${NO_BLOCK}
    AND (COALESCE((SELECT accepting FROM member_chat_preferences WHERE member_id=?2),1)=1 OR EXISTS(SELECT 1 FROM member_chat_messages WHERE thread_id=?3))
    AND (SELECT count(*) FROM member_chat_messages WHERE sender_id=?1 AND created_at>=datetime('now','-1 minute'))<20
    AND (SELECT count(*) FROM member_chat_messages WHERE sender_id=?1 AND created_at>=datetime('now','-1 day'))<500
    ON CONFLICT(sender_id,client_id) DO NOTHING`, actor.memberId, room.peer, room.id, body.clientId, content);
  const saved = await statement(db, 'SELECT * FROM member_chat_messages WHERE sender_id=? AND client_id=?', actor.memberId, body.clientId).first();
  if (!saved) fail('SEND_LIMITED', '目前無法傳送：對方可能已關閉聯絡，或傳送太頻繁，請稍後再試', 429);
  if (saved.thread_id !== room.id || saved.body !== content) fail('RETRY_CONFLICT', '這次重送的內容不一致', 409);
  return { item: message(saved, actor.memberId) };
}
export async function handleMemberChat(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== BASE && !url.pathname.startsWith(BASE + '/')) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  try {
    if (!['GET', 'POST'].includes(request.method)) fail('METHOD_NOT_ALLOWED', '不支援的操作', 405);
    const db = env.ACTMASTER_DB.withSession ? env.ACTMASTER_DB.withSession('first-primary') : env.ACTMASTER_DB;
    const actor = await authenticate(request, db, env, fetcher);
    const path = url.pathname.slice(BASE.length), params = url.searchParams;
    const allowedParams = path === '/members' ? ['q', 'after'] : path === '/threads' ? ['before'] : /^\/threads\/.+\/messages$/.test(path) ? ['before', 'after'] : [];
    for (const key of params.keys()) if (!allowedParams.includes(key) || params.getAll(key).length !== 1) fail('INVALID_QUERY', '查詢條件不正確');
    const body = request.method === 'POST' ? await jsonBody(request) : {};
    let data;
    if (path === '/me' && request.method === 'GET') {
      const pref = await statement(db, 'SELECT accepting FROM member_chat_preferences WHERE member_id=?', actor.memberId).first();
      data = { accepting: pref?.accepting !== 0 };
    } else if (path === '/preferences' && request.method === 'POST') {
      keys(body, ['accepting']); if (typeof body.accepting !== 'boolean') fail('INVALID_SETTING', '設定不正確');
      await run(db, 'INSERT INTO member_chat_preferences(member_id,accepting) VALUES(?,?) ON CONFLICT(member_id) DO UPDATE SET accepting=excluded.accepting', actor.memberId, Number(body.accepting));
      data = { accepting: body.accepting };
    } else if (path === '/members' && request.method === 'GET') data = await listMembers(db, actor, params);
    else if (path === '/threads' && request.method === 'GET') data = await listThreads(db, actor, params);
    else if (path === '/threads' && request.method === 'POST') data = await openThread(db, actor, body);
    else {
      const match = path.match(/^\/threads\/([^/]+)\/(messages|read|block|report)$/);
      if (!match) fail('NOT_FOUND', '找不到功能', 404);
      const room = await thread(db, actor, match[1]);
      if (match[2] === 'messages' && request.method === 'GET') {
        const before = cursor(params.get('before')), after = cursor(params.get('after'));
        if (before && after) fail('INVALID_CURSOR', '分頁條件不正確');
        const result = await rows(db, `SELECT * FROM member_chat_messages WHERE thread_id=? AND seq ${after ? '>' : '<'} ? ORDER BY seq ${after ? 'ASC' : 'DESC'} LIMIT 31`, room.id, after || before || Number.MAX_SAFE_INTEGER);
        const page = result.slice(0, PAGE); if (!after) page.reverse();
        const state = await contactState(db, actor.memberId, room.peer);
        const lastRead = await statement(db, 'SELECT MAX(seq) AS seq FROM member_chat_messages WHERE thread_id=? AND sender_id=? AND read_at IS NOT NULL', room.id, actor.memberId).first();
        data = { items: page.map(row => message(row, actor.memberId)), more: result.length > PAGE, peer: await peerInfo(db, room.peer), blocked: state.blocked, blockedByMe: state.blockedByMe, lastRead: lastRead?.seq || 0 };
      } else if (match[2] === 'messages' && request.method === 'POST') data = await send(db, actor, room, body);
      else if (match[2] === 'read' && request.method === 'POST') {
        keys(body, ['through']); const through = cursor(body.through);
        if (!through || !await statement(db, 'SELECT seq FROM member_chat_messages WHERE thread_id=? AND seq=?', room.id, through).first()) fail('INVALID_CURSOR', '已讀位置不正確');
        await run(db, 'UPDATE member_chat_messages SET read_at=CURRENT_TIMESTAMP WHERE thread_id=? AND sender_id<>? AND seq<=? AND read_at IS NULL', room.id, actor.memberId, through);
        data = { through };
      } else if (match[2] === 'block' && request.method === 'POST') {
        keys(body, ['blocked']); if (typeof body.blocked !== 'boolean') fail('INVALID_SETTING', '設定不正確');
        if (body.blocked) await run(db, 'INSERT INTO member_chat_blocks(member_id,blocked_id) VALUES(?,?) ON CONFLICT DO NOTHING', actor.memberId, room.peer);
        else await run(db, 'DELETE FROM member_chat_blocks WHERE member_id=? AND blocked_id=?', actor.memberId, room.peer);
        data = { blockedByMe: body.blocked };
      } else if (match[2] === 'report' && request.method === 'POST') {
        keys(body, ['seq', 'reason']); const seq = cursor(body.seq), reason = text(body.reason);
        if (!reason || reason.length > 300) fail('INVALID_REPORT', '請填寫 1–300 字檢舉原因');
        const target = await statement(db, 'SELECT seq FROM member_chat_messages WHERE seq=? AND thread_id=? AND sender_id<>?', seq, room.id, actor.memberId).first();
        if (!target) fail('NOT_FOUND', '找不到可檢舉的訊息', 404);
        await run(db, 'INSERT INTO member_chat_reports(reporter_id,message_seq,reason) VALUES(?,?,?) ON CONFLICT DO NOTHING', actor.memberId, seq, reason);
        data = { reported: true };
      } else fail('METHOD_NOT_ALLOWED', '不支援的操作', 405);
    }
    return reply({ success: true, ...data });
  } catch (error) {
    if (error instanceof ChatError) return reply({ success: false, code: error.code, error: error.message }, error.status);
    // Do not log tokens, recipient IDs, message bodies or raw SQL errors.
    console.error('member_chat_unavailable');
    return reply({ success: false, code: 'CHAT_UNAVAILABLE', error: '會員私訊暫時無法使用，請稍後重試；若尚未啟用，請聯絡管理員' }, 503);
  }
}
