// Read-only qualification for new social writes. Never promotes a card or changes membership.
const UID = /^U[0-9a-f]{32}$/i;
const text = value => String(value ?? '').trim();
export class IslandAccessError extends Error {
  constructor(code, message, status = 403) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new IslandAccessError(code, message, status); };
const statement = (db, sql, ...args) => db.prepare(sql).bind(...args);
async function rows(db, sql, ...args) {
  const result = await statement(db, sql, ...args).all();
  if (result.success === false || !Array.isArray(result.results)) throw Error('ISLAND_ACCESS_READ_FAILED');
  return result.results;
}

export async function resolveIslandMember(db, uid) {
  if (!UID.test(uid)) fail('REGISTRATION_REQUIRED', '請先完成 LINE 會員註冊');
  const ids = new Set([uid]);
  for (let pass = 0; pass < 4; pass++) {
    const count = ids.size;
    const links = await rows(db, "SELECT old_line_id,new_line_id FROM user_identity_links WHERE status='active' AND (old_line_id IN (SELECT value FROM json_each(?1)) OR new_line_id IN (SELECT value FROM json_each(?1))) LIMIT 3", JSON.stringify([...ids]));
    if (links.length > 1) fail('IDENTITY_CONFLICT', '會員身分對應不唯一，請聯絡管理員', 409);
    for (const link of links) {
      if (!UID.test(link.old_line_id) || !UID.test(link.new_line_id) || link.old_line_id === link.new_line_id) fail('IDENTITY_CONFLICT', '會員身分對應異常', 409);
      ids.add(link.old_line_id); ids.add(link.new_line_id);
    }
    if (count !== ids.size) continue;
    const members = await rows(db, 'SELECT row_id,line_id,name,role FROM users WHERE line_id IN (SELECT value FROM json_each(?)) LIMIT 3', JSON.stringify([...ids]));
    if (!members.length) return null;
    let member = members[0];
    if (members.length > 1) {
      const link = links[0], canonical = members.filter(row => row.line_id === link?.new_line_id);
      if (!link || members.length > 2 || canonical.length !== 1 || members.some(row => ![link.old_line_id, link.new_line_id].includes(row.line_id))) fail('IDENTITY_CONFLICT', '會員身分對應不唯一，請聯絡管理員', 409);
      member = canonical[0];
    }
    if (!text(member.row_id) || !UID.test(member.line_id || '')) fail('REGISTRATION_REQUIRED', '請先完成 LINE 會員註冊');
    return { user: member, memberId: text(member.row_id), ids: [...new Set([...ids, ...members.map(row => text(row.row_id)).filter(Boolean)])], uid };
  }
  fail('IDENTITY_CONFLICT', '會員身分對應異常', 409);
}

export function approvedIslandCardSql(idsParameter) {
  const owner = alias => `COALESCE(NULLIF(${alias}.profile_user_id,''),NULLIF(${alias}.line_id,''),${alias}.owner_user_id)`;
  const valid = alias => `${alias}.source_type='self_profile' AND COALESCE(${alias}.archived_at,'')='' AND COALESCE(${alias}.merged_into_row_id,'')='' AND ${owner(alias)} IN (SELECT value FROM json_each(${idsParameter}))`;
  return `EXISTS(SELECT 1 FROM card_contacts island_approved WHERE ${valid('island_approved')}
    AND island_approved.ai_review_status='passed'
    AND island_approved.row_id=(SELECT island_latest.row_id FROM card_contacts island_latest WHERE ${valid('island_latest')} ORDER BY island_latest.updated_at DESC,island_latest.row_id DESC LIMIT 1))`;
}

export async function islandInteractionState(db, actor) {
  if (!actor?.user || !text(actor.memberId) || !Array.isArray(actor.ids)) return { stage: 'register', reviewStatus: '' };
  const card = await statement(db, `SELECT c.row_id,c.ai_review_status FROM card_contacts c
    WHERE c.source_type='self_profile' AND COALESCE(c.archived_at,'')='' AND COALESCE(c.merged_into_row_id,'')=''
    AND COALESCE(NULLIF(c.profile_user_id,''),NULLIF(c.line_id,''),c.owner_user_id) IN (SELECT value FROM json_each(?))
    ORDER BY c.updated_at DESC,c.row_id DESC LIMIT 1`, JSON.stringify(actor.ids)).first();
  if (!card) return { stage: 'card', reviewStatus: '' };
  const reviewStatus = card.ai_review_status === 'passed' ? 'passed' : card.ai_review_status === 'failed' ? 'failed' : 'pending';
  return { stage: reviewStatus === 'passed' ? 'ready' : 'review', reviewStatus };
}

export async function requireIslandInteraction(db, actor) {
  const state = await islandInteractionState(db, actor);
  if (state.stage === 'register') fail('REGISTRATION_REQUIRED', '請先完成會員註冊，再建立本人的名片');
  if (state.stage === 'card') fail('OWN_CARD_REQUIRED', '請先上傳或建立本人的名片，收藏他人名片不適用');
  if (state.stage !== 'ready') fail('REVIEW_REQUIRED', state.reviewStatus === 'failed' ? '請修改本人名片並重新送 AI 審核，通過後即可交流' : '本人名片尚未通過 AI 審核；通過後即可開始交流');
  return state;
}

export async function exchangeInteractionError(db, uid) {
  try { await requireIslandInteraction(db, await resolveIslandMember(db, text(uid))); return null; }
  catch (error) {
    if (error instanceof IslandAccessError) return { success: false, code: error.code, error: error.message };
    return { success: false, code: 'INTERACTION_ACCESS_UNAVAILABLE', error: '交流資格暫時無法確認，請稍後重試' };
  }
}
