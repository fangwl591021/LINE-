const text = (value, maxLength = 220) => String(value ?? '').trim().slice(0, maxLength);

function publicCardOwnerId(row) {
  return text(row?.line_id || row?.owner_user_id || row?.profile_user_id || row?.creator_id, 180);
}

function cardBelongsToActor(row, userId) {
  const actorId = text(userId, 180);
  return [row?.line_id, row?.owner_user_id, row?.profile_user_id, row?.creator_id]
    .map((value) => text(value, 180))
    .filter(Boolean)
    .includes(actorId);
}

async function resolvePublicMatchCard(db, rowId) {
  const cardRowId = text(rowId, 160);
  if (!db || !cardRowId) return null;
  return db.prepare(`
    SELECT row_id, line_id, owner_user_id, profile_user_id, creator_id
    FROM card_contacts
    WHERE row_id = ?1
      AND LOWER(COALESCE(visibility, '')) = 'public'
      AND LOWER(COALESCE(source_type, '')) = 'self_profile'
      AND CAST(COALESCE(pool_eligible, 0) AS INTEGER) = 1
      AND LOWER(COALESCE(ai_review_status, 'passed')) = 'passed'
    LIMIT 1
  `).bind(cardRowId).first();
}

async function targetInterestCount(db, cardRowId) {
  const row = await db.prepare(`
    SELECT COUNT(DISTINCT sender_user_id) AS interest_count
    FROM ai_match_interests
    WHERE target_card_row_id = ?1
  `).bind(cardRowId).first();
  return Math.max(0, Number(row?.interest_count || 0) || 0);
}

export const MatchInterestModule = {
  async toggle(payload, env, actor) {
    const db = env?.ACTMASTER_DB;
    const senderUserId = text(actor?.userId, 180);
    const targetCardRowId = text(payload?.targetCardRowId, 160);
    if (!db) return { success: false, code: 'AI_MATCH_INTEREST_DB_MISSING', error: '關注服務尚未設定' };
    if (!senderUserId) return { success: false, code: 'AI_MATCH_INTEREST_AUTH_REQUIRED', error: '請重新登入後再試' };
    if (!targetCardRowId) return { success: false, code: 'AI_MATCH_INTEREST_TARGET_REQUIRED', error: '缺少配對對象' };

    const target = await resolvePublicMatchCard(db, targetCardRowId);
    if (!target) return { success: false, code: 'AI_MATCH_INTEREST_TARGET_NOT_PUBLIC', error: '此對象目前不在公開配對池' };
    if (cardBelongsToActor(target, senderUserId)) {
      return { success: false, code: 'AI_MATCH_INTEREST_SELF_NOT_ALLOWED', error: '不能關注自己的名片' };
    }
    const targetOwnerUserId = publicCardOwnerId(target);
    if (!targetOwnerUserId) return { success: false, code: 'AI_MATCH_INTEREST_OWNER_MISSING', error: '此對象暫時無法接收關注' };

    const existing = await db.prepare(`
      SELECT interest_id FROM ai_match_interests
      WHERE sender_user_id = ?1 AND target_card_row_id = ?2
      LIMIT 1
    `).bind(senderUserId, targetCardRowId).first();
    if (existing) {
      await db.prepare(`
        DELETE FROM ai_match_interests
        WHERE sender_user_id = ?1 AND target_card_row_id = ?2
      `).bind(senderUserId, targetCardRowId).run();
    } else {
      await db.prepare(`
        INSERT OR IGNORE INTO ai_match_interests
          (sender_user_id, target_card_row_id, target_owner_user_id, source_type)
        VALUES (?1, ?2, ?3, 'ai_match')
      `).bind(senderUserId, targetCardRowId, targetOwnerUserId).run();
    }
    const interestedByMe = !existing;
    const interestCount = await targetInterestCount(db, targetCardRowId);
    return { success: true, targetCardRowId, interestedByMe, interestCount };
  },

  async states(payload, env, actor) {
    const db = env?.ACTMASTER_DB;
    const senderUserId = text(actor?.userId, 180);
    const cardRowIds = [...new Set((Array.isArray(payload?.targetCardRowIds) ? payload.targetCardRowIds : [])
      .map((value) => text(value, 160)).filter(Boolean))].slice(0, 20);
    if (!db || !senderUserId || !cardRowIds.length) return { success: true, states: [] };
    const placeholders = cardRowIds.map(() => '?').join(',');
    const result = await db.prepare(`
      SELECT target_card_row_id FROM ai_match_interests
      WHERE sender_user_id = ? AND target_card_row_id IN (${placeholders})
    `).bind(senderUserId, ...cardRowIds).all();
    const interested = new Set((result?.results || []).map((row) => text(row?.target_card_row_id, 160)).filter(Boolean));
    return {
      success: true,
      states: cardRowIds.map((targetCardRowId) => ({ targetCardRowId, interestedByMe: interested.has(targetCardRowId) }))
    };
  },

  async summary(payload, env, actor) {
    const db = env?.ACTMASTER_DB;
    const userId = text(actor?.userId, 180);
    if (!db || !userId) return { success: false, code: 'AI_MATCH_INTEREST_AUTH_REQUIRED', error: '請重新登入後再試' };
    const ownerBinds = [userId, userId, userId, userId, userId];
    const countRow = await db.prepare(`
      SELECT COUNT(DISTINCT i.sender_user_id) AS interest_count
      FROM ai_match_interests i
      JOIN card_contacts c ON c.row_id = i.target_card_row_id
      WHERE i.target_owner_user_id = ?
         OR c.line_id = ? OR c.owner_user_id = ? OR c.profile_user_id = ? OR c.creator_id = ?
    `).bind(...ownerBinds).first();
    const eligibleCard = await db.prepare(`
      SELECT row_id FROM card_contacts
      WHERE (line_id = ?1 OR owner_user_id = ?1 OR profile_user_id = ?1 OR creator_id = ?1)
        AND LOWER(COALESCE(visibility, '')) = 'public'
        AND LOWER(COALESCE(source_type, '')) = 'self_profile'
        AND CAST(COALESCE(pool_eligible, 0) AS INTEGER) = 1
        AND LOWER(COALESCE(ai_review_status, 'passed')) = 'passed'
      LIMIT 1
    `).bind(userId).first();
    return {
      success: true,
      data: {
        interestCount: Math.max(0, Number(countRow?.interest_count || 0) || 0),
        eligibleForAiInterest: Boolean(eligibleCard)
      }
    };
  }
};
