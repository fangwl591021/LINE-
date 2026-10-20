import { resolveMyCardCandidates } from './my-card-runtime-resolver.mjs';

export function isMyCardResolverV2Enabled(env = {}) {
  return ['1', 'true', 'on', 'yes'].includes(String(env.CARD_MY_CARD_RESOLVER_V2_ENABLED || '').trim().toLowerCase());
}

const CANDIDATE_SQL = `
WITH identity_link AS (
  SELECT old_line_id, new_line_id
  FROM user_identity_links
  WHERE (new_line_id = ? OR old_line_id = ?)
    AND status IN ('active', 'replaced')
  ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC, id DESC
  LIMIT 1
), identity_ids AS (
  SELECT ? AS identity_id
  UNION SELECT old_line_id FROM identity_link
  UNION SELECT new_line_id FROM identity_link
  UNION
  SELECT line_id FROM users
  WHERE line_id = ? OR row_id = ? OR legacy_line_id = ? OR point_line_id = ?
), canonical_identity AS (
  SELECT COALESCE(
    (SELECT new_line_id FROM identity_link),
    (SELECT line_id FROM users WHERE line_id = ? OR row_id = ? OR legacy_line_id = ? OR point_line_id = ? LIMIT 1),
    ?
  ) AS canonical_actor_id
)
SELECT c.*,
  (SELECT canonical_actor_id FROM canonical_identity) AS __canonical_actor_id,
  CASE WHEN c.owner_user_id IN (SELECT identity_id FROM identity_ids)
          OR c.profile_user_id IN (SELECT identity_id FROM identity_ids)
          OR c.line_id IN (SELECT identity_id FROM identity_ids)
       THEN 1 ELSE 0 END AS __identity_match
FROM card_contacts c
WHERE c.owner_user_id IN (SELECT identity_id FROM identity_ids)
   OR c.profile_user_id IN (SELECT identity_id FROM identity_ids)
   OR c.line_id IN (SELECT identity_id FROM identity_ids)
   OR c.scanner_user_id IN (SELECT identity_id FROM identity_ids)
LIMIT 40`;

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

export async function resolveMyCardRuntime({ db, actorId, networkId, requestedVersion = 'standard' } = {}) {
  const trustedActorId = text(actorId);
  const trustedNetworkId = text(networkId);
  if (!trustedActorId || !trustedNetworkId || !db || typeof db.prepare !== 'function') {
    return resolveMyCardCandidates({ actorId: trustedActorId, networkId: trustedNetworkId, requestedVersion, candidates: [] });
  }
  const binds = [
    trustedActorId, trustedActorId, trustedActorId,
    trustedActorId, trustedActorId, trustedActorId, trustedActorId,
    trustedActorId, trustedActorId, trustedActorId, trustedActorId,
    trustedActorId
  ];
  const result = await db.prepare(CANDIDATE_SQL).bind(...binds).all();
  const candidates = Array.isArray(result?.results) ? result.results : [];
  const canonicalActorId = text(candidates[0]?.__canonical_actor_id || trustedActorId);
  return resolveMyCardCandidates({ actorId: trustedActorId, canonicalActorId, networkId: trustedNetworkId, requestedVersion, candidates });
}

export async function resolveMyCardRuntimeIfEnabled(input = {}) {
  if (!isMyCardResolverV2Enabled(input.env)) return { enabled: false, resolution: null };
  return { enabled: true, resolution: await resolveMyCardRuntime(input) };
}

export { CANDIDATE_SQL };
