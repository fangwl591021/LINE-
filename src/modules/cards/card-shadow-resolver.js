'use strict';

const { resolveCanonicalCardActor } = require('./canonical-card-identity');
const { classifyCardCandidate } = require('./card-classifier');
const { compareLegacyAndShadowResolution, masked } = require('./card-shadow-compare');

function sourceMatches(value, expression) { return expression.test(String(value || '')); }
function isMyCard(entry) { return sourceMatches(entry, /my.?card|line_oa_my_card|edit_personal/i); }
function isAiFolder(entry) { return sourceMatches(entry, /ai.?card|card_folder|harvest|crm_contact|collected/i); }
function isLineCreate(action, entry) { return sourceMatches(action, /line_generate|create_from_line|line_generated/i) || sourceMatches(entry, /line_create/i); }
function cardId(card) { return String(card.row_id || card.card_id || card.id || ''); }
function maskedEvidence(evidence) {
  return Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, masked(value)]));
}

function resolveCardShadow(input = {}) {
  const actor = resolveCanonicalCardActor({ ...(input.actor || {}), networkId: input.networkId });
  const entrySource = String(input.entrySource || 'unknown');
  const requestedVersion = String(input.requestedVersion || 'standard').toLowerCase();
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const diagnostics = [...actor.diagnostics];
  const examined = candidates.map((candidate) => {
    const classification = classifyCardCandidate(candidate);
    const reasons = [...classification.diagnostics];
    const identities = classification.identityEvidence;
    const ownerIds = [identities.ownerUserId, identities.profileUserId, identities.boundUserId, identities.lineId].filter(Boolean);
    const networkId = String(candidate.network_id || candidate.networkId || '');
    if (input.networkId && networkId && networkId !== String(input.networkId)) reasons.push('TENANT_BOUNDARY');
    if (isMyCard(entrySource) && classification.cardType !== 'personal') reasons.push('MY_CARD_RESOLVED_CONTACT');
    if (isAiFolder(entrySource) && classification.cardType !== 'contact') reasons.push('PERSONAL_EXCLUDED_FROM_AI_FOLDER');
    if (requestedVersion !== 'any' && classification.version !== requestedVersion) reasons.push('VERSION_MISMATCH');
    if (classification.cardType === 'personal' && actor.canonicalActorId && !ownerIds.includes(actor.canonicalActorId)) reasons.push('ACTOR_IDENTITY_MISMATCH');
    if (isAiFolder(entrySource) && identities.scannerUserId !== actor.canonicalActorId) reasons.push('SCANNER_MISMATCH');
    return {
      cardId: masked(cardId(candidate)), rawCardId: cardId(candidate), classification: {
        ...classification,
        identityEvidence: maskedEvidence(classification.identityEvidence)
      },
      exclusionReasons: [...new Set(reasons)],
      permission: { read: reasons.length === 0, edit: reasons.length === 0 && classification.cardType === 'personal' }
    };
  });

  const eligible = examined.filter((candidate) => candidate.exclusionReasons.length === 0);
  const personal = eligible.filter((candidate) => candidate.classification.cardType === 'personal');
  if (isMyCard(entrySource) && examined.some((candidate) => candidate.exclusionReasons.includes('MY_CARD_RESOLVED_CONTACT'))) diagnostics.push('MY_CARD_RESOLVED_CONTACT');
  if (isAiFolder(entrySource) && examined.some((candidate) => candidate.exclusionReasons.includes('PERSONAL_EXCLUDED_FROM_AI_FOLDER'))) diagnostics.push('PERSONAL_EXCLUDED_FROM_AI_FOLDER');
  if (personal.length > 1) diagnostics.push('MULTIPLE_PERSONAL');
  if (isLineCreate(input.action, entrySource) && personal.length > 0) diagnostics.push('EXISTING_PERSONAL_CREATE_ATTEMPT');
  if (eligible.length > 1) diagnostics.push('MULTIPLE_ELIGIBLE_CARDS');
  if (!eligible.length) diagnostics.push('NOT_FOUND');
  for (const code of ['IDENTITY_CONFLICT', 'TENANT_BOUNDARY', 'LEGACY_UNCLASSIFIED', 'VERSION_MISMATCH', 'PREFIX_CONFIG_VERSION_CONFLICT']) {
    if (examined.some((candidate) => candidate.exclusionReasons.includes(code) || candidate.classification.diagnostics.includes(code))) diagnostics.push(code);
  }
  const selected = eligible.length === 1 && !diagnostics.includes('MULTIPLE_PERSONAL') ? eligible[0] : null;
  const result = {
    resolverVersion: 'cs-1a-shadow-v1', actor: { canonicalActorId: masked(actor.canonicalActorId), canonicalSource: actor.canonicalSource, trusted: actor.trusted, networkId: masked(actor.networkId) },
    entrySource, requestedVersion, candidateCount: examined.length,
    candidates: examined.map(({ rawCardId, ...candidate }) => candidate),
    eligibleCandidates: eligible.map((candidate) => candidate.cardId), selectedCardId: selected ? selected.cardId : '',
    permission: selected ? selected.permission : { read: false, edit: false },
    diagnostics: [...new Set(diagnostics)],
    invariantDecision: isLineCreate(input.action, entrySource) && personal.length > 0 ? 'BLOCK_CREATE_AND_ROUTE_TO_EDIT' : 'NO_WRITE_DECISION_THIS_SHADOW_READ'
  };
  result.legacyComparison = compareLegacyAndShadowResolution({ legacyResult: input.legacyResult, shadowResult: { ...result, selectedCardId: selected ? selected.rawCardId : '' } });
  return result;
}

function safeRunShadowResolver(input) {
  try { return { ok: true, result: resolveCardShadow(input) }; }
  catch (error) { return { ok: false, result: null, diagnostic: `SHADOW_RESOLVER_FAILED:${String(error && error.name || 'Error')}` }; }
}

module.exports = { resolveCardShadow, safeRunShadowResolver };
