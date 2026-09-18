// Read-only decoration of an already-authorized collection. Never computes new matches.
const text = value => String(value ?? '').trim();
const normalizeIntent = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const MAX_CARDS = 500;

export function harvestMatchIntentContext(rawIntent = {}) {
  const businessIntent = {
    offer: text(rawIntent?.offer),
    seek: text(rawIntent?.seek),
    collaboration: text(rawIntent?.collaboration)
  };
  const normalized = {
    offer: normalizeIntent(businessIntent.offer),
    seek: normalizeIntent(businessIntent.seek),
    collaboration: normalizeIntent(businessIntent.collaboration)
  };
  // Keep these strings and property order identical to AIModule.matchmaking.
  const query = [
    businessIntent.offer ? '我可以提供：' + businessIntent.offer : '',
    businessIntent.seek ? '我正在尋找：' + businessIntent.seek : '',
    businessIntent.collaboration ? '我希望合作：' + businessIntent.collaboration : ''
  ].filter(Boolean).join('；');
  return {
    hasIntent: Object.values(normalized).some(Boolean),
    intentKey: JSON.stringify(normalized),
    digestInput: { version: 'incremental-v1', query: normalizeIntent(query), ...normalized }
  };
}

function readIntent(card) {
  let config = {};
  try {
    config = typeof card?.custom_config === 'string'
      ? JSON.parse(card.custom_config || '{}')
      : (card?.custom_config || {});
  } catch (error) {}
  return config && typeof config === 'object' ? (config.businessIntent || {}) : {};
}

export function harvestMatchCandidateSnapshot(card, match) {
  const contact = match.matchContactFromCard(card);
  const raw = card?.customConfig || card?.custom_config || card?.['自訂名片設定'] || '{}';
  const intent = readIntent({ custom_config: raw });
  // Candidate intent uses the legacy, non-normalized snapshot representation.
  contact.BusinessIntent = [
    intent.offer ? '可提供:' + String(intent.offer).trim() : '',
    intent.seek ? '正在尋找:' + String(intent.seek).trim() : '',
    intent.collaboration ? '合作方式:' + String(intent.collaboration).trim() : ''
  ].filter(Boolean).join('；');
  return match.matchmakingCandidateSnapshot(contact);
}

function result(status, intentKey = '', values = {}) {
  return { status, score: null, reason: '', source: '', updatedAt: '', intentKey, ...values };
}

async function readRows(db, query, binds) {
  const response = await db.prepare(query).bind(...binds).all();
  if (response?.success === false || !Array.isArray(response?.results)) throw new Error('MATCH_READ_UNAVAILABLE');
  return response.results;
}

export async function enrichCardHarvestMatches(cards, { env, actor, actorId, identityIds = [], match } = {}) {
  const source = Array.isArray(cards) ? cards : [];
  if (!source.length) return source;
  const decorate = (status, intentKey = '') => source.map(card => ({ ...card, aiMatch: result(status, intentKey) }));
  // actor is an out-of-band dispatcher argument, never a field accepted from JSON payload.
  const userId = text(actor?.userId);
  if (!userId || !text(actor?.token) || actor?.source === 'd1_identity_fallback' || userId !== text(actorId)) {
    return decorate('needs_login');
  }
  let intentKey = '';
  try {
    const db = env?.ACTMASTER_DB;
    if (!db || !match) return decorate('unavailable');
    const ids = [...new Set([userId, ...identityIds].map(text).filter(Boolean))];
    const encodedIds = JSON.stringify(ids);
    // Prefer a real bound owner. A collector's creator_id cannot claim another person's intent.
    // Conflicting bound identities are also excluded instead of guessing ownership.
    const selfCard = await db.prepare(`
      SELECT custom_config FROM card_contacts
      WHERE LOWER(COALESCE(source_type,''))='self_profile'
        AND TRIM(COALESCE(archived_at,''))=''
        AND COALESCE(NULLIF(TRIM(line_id),''),NULLIF(TRIM(profile_user_id),''),
                     NULLIF(TRIM(owner_user_id),''),NULLIF(TRIM(creator_id),''),'')
            IN (SELECT value FROM json_each(?1))
        AND (TRIM(COALESCE(line_id,''))='' OR TRIM(line_id) IN (SELECT value FROM json_each(?1)))
        AND (TRIM(COALESCE(profile_user_id,''))='' OR TRIM(profile_user_id) IN (SELECT value FROM json_each(?1)))
        AND (TRIM(COALESCE(owner_user_id,''))='' OR TRIM(owner_user_id) IN (SELECT value FROM json_each(?1)))
      ORDER BY CASE WHEN TRIM(line_id)=?2 THEN 0 WHEN TRIM(profile_user_id)=?2 THEN 1
                    WHEN TRIM(owner_user_id)=?2 THEN 2 ELSE 3 END,
               COALESCE(updated_at,created_at) DESC,row_id DESC
      LIMIT 1
    `).bind(encodedIds, userId).first();
    const intent = harvestMatchIntentContext(readIntent(selfCard));
    intentKey = intent.intentKey;
    if (!intent.hasIntent) return decorate('needs_intent', intentKey);

    const eligibleCards = source.slice(0, MAX_CARDS).filter(card => text(card?.rowId)
      && !text(card?.archivedAt || card?.archived_at)
      && text(card?.sourceType || card?.source_type).toLowerCase() !== 'referral_placeholder');
    if (!eligibleCards.length) return decorate('unavailable', intentKey);
    const cardIds = JSON.stringify([...new Set(eligibleCards.map(card => text(card.rowId)))]);
    const intentHash = await match.matchmakingDigest(intent.digestInput);
    // Three bounded SELECTs total, irrespective of collection size; never fetch other intents/users.
    const cacheRows = await readRows(db, `
      SELECT candidate_card_row_id,candidate_version,score,reason,result_source,updated_at
      FROM ai_match_pair_cache
      WHERE requester_user_id=? AND pool_scope='own' AND intent_hash=?
        AND candidate_card_row_id IN (SELECT value FROM json_each(?))
      LIMIT 500
    `, [userId, intentHash, cardIds]);
    const jobRows = await readRows(db, `
      SELECT card_row_id,status FROM card_uploader_match_jobs
      WHERE owner_user_id=? AND card_row_id IN (SELECT value FROM json_each(?))
      LIMIT 500
    `, [userId, cardIds]).catch(() => []);
    const cacheByCard = new Map(cacheRows.map(row => [text(row.candidate_card_row_id), row]));
    const jobsByCard = new Map(jobRows.map(row => [text(row.card_row_id), text(row.status)]));
    const matches = new Map();
    await Promise.all(eligibleCards.map(async card => {
      const rowId = text(card.rowId);
      const cached = cacheByCard.get(rowId);
      if (!cached) {
        const pending = ['pending', 'leased', 'waiting_tags', 'waiting_intent'].includes(jobsByCard.get(rowId));
        matches.set(rowId, result(pending ? 'pending' : 'unavailable', intentKey));
        return;
      }
      const version = await match.matchmakingDigest(harvestMatchCandidateSnapshot(card, match));
      if (text(cached.candidate_version) !== version) {
        matches.set(rowId, result('stale', intentKey));
        return;
      }
      const score = typeof cached.score === 'number' ? cached.score : NaN;
      const sourceType = text(cached.result_source);
      if (!Number.isFinite(score) || score < 0 || score > 100 || !['ai', 'rules'].includes(sourceType)) {
        matches.set(rowId, result('unavailable', intentKey));
        return;
      }
      matches.set(rowId, result('completed', intentKey, {
        score, reason: text(cached.reason).slice(0, 1000), source: sourceType,
        updatedAt: text(cached.updated_at)
      }));
    }));
    return source.map(card => ({ ...card, aiMatch: matches.get(text(card?.rowId)) || result('unavailable', intentKey) }));
  } catch (error) {
    // Missing migrations or unavailable auxiliary data must never hide the collection.
    return decorate('unavailable', intentKey);
  }
}
