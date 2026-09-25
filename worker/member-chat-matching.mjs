// Directory-only matching. Never reads private contact details or writes collected-card scores.
export const DIRECTORY_MATCH_KEY = 'member-directory-v1';
export const MATCH_BATCH = 20;
const validScore = alias => `typeof(${alias}.score) IN ('integer','real') AND ${alias}.score BETWEEN 0 AND 100 AND ${alias}.result_source IN ('ai','rules')`;
export function directoryScoresSql(directory, cardMemberJoin, withScores = true) {
  if (!withScores) return `WITH directory AS (${directory}), scored AS (SELECT *,NULL AS score,NULL AS source,NULL AS basis FROM directory)`;
  return `WITH directory AS (${directory}), history AS (
    SELECT d.peer,h.score,h.result_source,h.intent_hash,
      ROW_NUMBER() OVER(PARTITION BY d.peer ORDER BY s.updated_at DESC,s.row_id DESC,CASE h.result_source WHEN 'ai' THEN 0 ELSE 1 END,h.updated_at DESC,h.intent_hash) AS rn
    FROM directory d JOIN users u ON u.row_id=d.peer JOIN card_contacts s ON ${cardMemberJoin('s', 'u')}
    JOIN ai_match_pair_cache h ON h.candidate_card_row_id=s.row_id AND h.requester_user_id IN (SELECT value FROM json_each(?5)) AND h.pool_scope='own' AND ${validScore('h')}
    WHERE COALESCE(s.archived_at,'')='' AND COALESCE(s.merged_into_row_id,'')='' AND COALESCE(s.source_type,'')<>'referral_placeholder'
    AND (s.scanner_user_id IN (SELECT value FROM json_each(?5)) OR (COALESCE(s.scanner_user_id,'')='' AND (s.creator_id IN (SELECT value FROM json_each(?5)) OR s.owner_user_id IN (SELECT value FROM json_each(?5)))))
    AND (COALESCE(s.source_type,'')<>'self_profile' OR s.scanner_user_id IN (SELECT value FROM json_each(?5)))
  ), scored AS (
    SELECT d.*,COALESCE(h.score,n.score) AS score,COALESCE(h.result_source,n.result_source) AS source,
      CASE WHEN h.score IS NOT NULL THEN CASE WHEN h.intent_hash='collection-partner-v1' THEN 'profile' ELSE 'previous' END ELSE 'directory' END AS basis
    FROM directory d LEFT JOIN history h ON h.peer=d.peer AND h.rn=1
    LEFT JOIN ai_match_pair_cache n ON n.requester_user_id=?6 AND n.pool_scope='public' AND n.intent_hash='${DIRECTORY_MATCH_KEY}'
      AND n.candidate_card_row_id='member:'||d.peer AND ${validScore('n')}
  )`;
}
export async function registerDirectoryMatching(db, actor) {
  const result = await db.prepare(`INSERT INTO member_chat_match_jobs(member_id,login_uid) VALUES(?,?)
    ON CONFLICT(member_id) DO UPDATE SET login_uid=excluded.login_uid`).bind(actor.memberId, actor.user.line_id).run();
  if (result.success === false) throw Error('match registration unavailable');
  return { registered: true };
}
export async function directoryMatchState(db, memberId) {
  try {
    const row = await db.prepare('SELECT status FROM member_chat_match_jobs WHERE member_id=?').bind(memberId).first();
    return row?.status || '';
  } catch { return ''; }
}
const profile = card => ({ company: String(card?.company_name || '').trim().slice(0, 100), title: String(card?.title || '').trim().slice(0, 80) });
const hasProfile = card => Object.values(profile(card)).some(Boolean);
// A durable per-member lease makes cron/retries/multiple tabs safe without all-to-all matching.
export async function runDirectoryMatchJobs(env, { resolve, candidates, self, score }, now = Date.now()) {
  const db = env.ACTMASTER_DB.withSession ? env.ACTMASTER_DB.withSession('first-primary') : env.ACTMASTER_DB;
  const job = await db.prepare('SELECT member_id,login_uid FROM member_chat_match_jobs WHERE next_run<=?1 AND lease_until<=?1 ORDER BY next_run,member_id LIMIT 1').bind(now).first();
  if (!job) return { processed: 0 };
  const lease = crypto.randomUUID();
  const claim = await db.prepare("UPDATE member_chat_match_jobs SET lease_until=?,lease_key=?,status='processing' WHERE member_id=? AND lease_until<=? AND next_run<=?").bind(now + 120000, lease, job.member_id, now, now).run();
  if (claim.success === false) throw Error('match lease unavailable');
  if (Number(claim.meta?.changes) !== 1) return { processed: 0 };
  let state = 'pending', delay = 60000, processed = 0;
  try {
    const actor = await resolve(db, job.login_uid, job.member_id);
    if (!actor) { state = 'unavailable'; delay = 86400000; }
    else {
      const member = await self(db, actor);
      if (!hasProfile(member)) { state = 'no_profile'; delay = 3600000; }
      else {
        const targets = (await candidates(db, actor, MATCH_BATCH)).filter(hasProfile);
        if (!targets.length) { state = 'complete'; delay = 300000; }
        else {
          const result = await score(env, actor, profile(member), targets.map(profile));
          if (result?.limited) { state = 'limited'; delay = 3600000; }
          else {
            // Recheck eligibility and ownership after AI: an opt-out/block/card change must win.
            const freshActor = await resolve(db, job.login_uid, job.member_id);
            const fresh = freshActor ? await candidates(db, freshActor, MATCH_BATCH) : [];
            for (const [index, target] of targets.entries()) {
              const current = fresh.find(row => row.peer === target.peer && row.handle === target.handle);
              const matches = Array.isArray(result?.scores) ? result.scores.filter(row => row?.index === index) : [];
              const value = matches.length === 1 ? matches[0] : null;
              if (!current || JSON.stringify(profile(current)) !== JSON.stringify(profile(target)) || !value || !Number.isInteger(value.score) || value.score < 0 || value.score > 100 || typeof value.reason !== 'string' || value.reason.trim().length < 8) continue;
              const saved = await db.prepare(`INSERT INTO ai_match_pair_cache(requester_user_id,pool_scope,intent_hash,candidate_card_row_id,candidate_version,score,reason,result_source)
                SELECT ?1,'public','${DIRECTORY_MATCH_KEY}',?2,?3,?4,?5,'ai'
                WHERE EXISTS(SELECT 1 FROM member_chat_match_jobs WHERE member_id=?6 AND lease_key=?7)
                ON CONFLICT(requester_user_id,pool_scope,intent_hash,candidate_card_row_id) DO NOTHING`)
                .bind(actor.user.line_id, 'member:' + target.peer, target.handle, value.score, value.reason.trim().slice(0, 500), actor.memberId, lease).run();
              if (saved.success === false) throw Error('match write unavailable');
              processed += Number(saved.meta?.changes) || 0;
            }
            if (!processed) { state = 'retry'; delay = 300000; }
          }
        }
      }
    }
  } catch { state = 'retry'; delay = 300000; console.error('member_directory_match_retry'); }
  const finish = await db.prepare('UPDATE member_chat_match_jobs SET status=?,next_run=?,lease_until=0,lease_key=\'\',updated_at=CURRENT_TIMESTAMP WHERE member_id=? AND lease_key=?')
    .bind(state, now + delay, job.member_id, lease).run();
  if (finish.success === false) throw Error('match completion unavailable');
  return { processed, status: state };
}
