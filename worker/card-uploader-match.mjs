const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const integer = (value, fallback = 0) => Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
const id = () => `CUM_${crypto.randomUUID().replace(/-/g, '')}`;

async function first(env, sql, binds = []) {
  return await env.ACTMASTER_DB.prepare(sql).bind(...binds).first();
}

async function all(env, sql, binds = []) {
  const result = await env.ACTMASTER_DB.prepare(sql).bind(...binds).all();
  return Array.isArray(result?.results) ? result.results : [];
}

export function cardUploaderId(card = {}) {
  return text(card.owner_user_id || card.creator_id || card.line_id || card.profile_user_id, 160);
}

export function cardHasBusinessIntent(card = {}) {
  let config = {};
  try {
    config = typeof card.custom_config === 'string' ? JSON.parse(card.custom_config || '{}') : (card.custom_config || {});
  } catch (error) {}
  const intent = config && typeof config === 'object' ? (config.businessIntent || {}) : {};
  return ['offer', 'seek', 'collaboration'].some(key => text(intent[key], 1000));
}

function readyForMatch(card = {}) {
  return ['completed', 'insufficient'].includes(text(card.fate_analysis_status, 40).toLowerCase());
}

function safeError(error) {
  const code = text(error?.message, 80).toUpperCase();
  if (/^[A-Z0-9_]+$/.test(code)) return code;
  return 'AI_MATCH_TEMPORARY_FAILURE';
}

export const CardUploaderMatchModule = {
  async enqueueCard(cardRowId, env) {
    const rowId = text(cardRowId, 160);
    if (!rowId || !env?.ACTMASTER_DB) return { skipped: 'CARD_ID_MISSING' };
    const card = await first(env, `SELECT * FROM card_contacts WHERE row_id=? LIMIT 1`, [rowId]);
    if (!card || text(card.archived_at) || text(card.source_type).toLowerCase() === 'referral_placeholder') {
      return { skipped: 'CARD_NOT_ELIGIBLE' };
    }
    const ownerUserId = cardUploaderId(card);
    if (!ownerUserId) return { skipped: 'CARD_OWNER_MISSING' };
    const status = readyForMatch(card) ? 'pending' : 'waiting_tags';
    await env.ACTMASTER_DB.prepare(`INSERT INTO card_uploader_match_jobs (job_id,card_row_id,network_id,owner_user_id,status,attempts,available_at,lease_until,error_code,updated_at,completed_at) VALUES (?,?,?,?,?,0,CURRENT_TIMESTAMP,'','',CURRENT_TIMESTAMP,'') ON CONFLICT(card_row_id) DO UPDATE SET network_id=excluded.network_id,owner_user_id=excluded.owner_user_id,status=excluded.status,attempts=0,available_at=CURRENT_TIMESTAMP,lease_until='',error_code='',updated_at=CURRENT_TIMESTAMP,completed_at=''`).bind(id(), rowId, text(card.network_id, 160) || 'admin', ownerUserId, status).run();

    if (text(card.source_type).toLowerCase() === 'self_profile' && cardHasBusinessIntent(card)) {
      await env.ACTMASTER_DB.prepare(`UPDATE card_uploader_match_jobs SET status=CASE WHEN card_row_id IN (SELECT row_id FROM card_contacts WHERE fate_analysis_status IN ('completed','insufficient')) THEN 'pending' ELSE 'waiting_tags' END,attempts=0,available_at=CURRENT_TIMESTAMP,lease_until='',error_code='',updated_at=CURRENT_TIMESTAMP WHERE owner_user_id=? AND status='waiting_intent'`).bind(ownerUserId).run();
    }
    return { queued: status === 'pending', waitingForTags: status === 'waiting_tags', cardRowId: rowId };
  },

  async process(env, runMatch) {
    if (!env?.ACTMASTER_DB || typeof runMatch !== 'function') return { skipped: 'MATCH_RUNNER_MISSING' };
    await env.ACTMASTER_DB.prepare(`UPDATE card_uploader_match_jobs SET status='pending',available_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE status='waiting_tags' AND card_row_id IN (SELECT row_id FROM card_contacts WHERE fate_analysis_status IN ('completed','insufficient'))`).run();
    await env.ACTMASTER_DB.prepare(`UPDATE card_uploader_match_jobs SET status='pending',lease_until='',available_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE status='leased' AND lease_until<>'' AND lease_until<CURRENT_TIMESTAMP AND attempts<3`).run();
    await env.ACTMASTER_DB.prepare(`UPDATE card_uploader_match_jobs SET status='failed',error_code='RETRY_LIMIT_REACHED',updated_at=CURRENT_TIMESTAMP WHERE status='leased' AND lease_until<>'' AND lease_until<CURRENT_TIMESTAMP AND attempts>=3`).run();
    const candidates = await all(env, `SELECT job_id FROM card_uploader_match_jobs WHERE status='pending' AND attempts<3 AND available_at<=CURRENT_TIMESTAMP ORDER BY available_at,created_at LIMIT 5`);
    let completed = 0;
    let waitingIntent = 0;
    for (const candidate of candidates) {
      const claim = await env.ACTMASTER_DB.prepare(`UPDATE card_uploader_match_jobs SET status='leased',attempts=attempts+1,lease_until=datetime('now','+2 minutes'),updated_at=CURRENT_TIMESTAMP WHERE job_id=? AND status='pending'`).bind(candidate.job_id).run();
      if (integer(claim?.meta?.changes) !== 1) continue;
      const job = await first(env, `SELECT * FROM card_uploader_match_jobs WHERE job_id=?`, [candidate.job_id]);
      const card = await first(env, `SELECT * FROM card_contacts WHERE row_id=? LIMIT 1`, [job.card_row_id]);
      if (!card || text(card.archived_at)) {
        await env.ACTMASTER_DB.prepare(`UPDATE card_uploader_match_jobs SET status='cancelled',lease_until='',error_code='CARD_NOT_ELIGIBLE',updated_at=CURRENT_TIMESTAMP WHERE job_id=?`).bind(job.job_id).run();
        continue;
      }
      try {
        const result = await runMatch({ cardRowId: job.card_row_id, ownerUserId: job.owner_user_id }, env);
        if (result?.waitingForIntent) {
          waitingIntent += 1;
          await env.ACTMASTER_DB.prepare(`UPDATE card_uploader_match_jobs SET status='waiting_intent',lease_until='',error_code='',updated_at=CURRENT_TIMESTAMP WHERE job_id=?`).bind(job.job_id).run();
          continue;
        }
        if (!result?.success || result?.retry) throw new Error(result?.error || 'AI_MATCH_TEMPORARY_FAILURE');
        await env.ACTMASTER_DB.prepare(`UPDATE card_uploader_match_jobs SET status='completed',lease_until='',error_code='',updated_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP WHERE job_id=?`).bind(job.job_id).run();
        completed += 1;
      } catch (error) {
        const code = safeError(error);
        const failed = integer(job.attempts) >= 3;
        const delay = integer(job.attempts) <= 1 ? '+15 minutes' : '+60 minutes';
        await env.ACTMASTER_DB.prepare(`UPDATE card_uploader_match_jobs SET status=?,lease_until='',available_at=datetime('now',?),error_code=?,updated_at=CURRENT_TIMESTAMP WHERE job_id=?`).bind(failed ? 'failed' : 'pending', delay, code, job.job_id).run();
      }
    }
    return { claimed: candidates.length, completed, waitingIntent };
  }
};
