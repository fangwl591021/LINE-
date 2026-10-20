const PERSONAL_SOURCES = new Set(['self_profile', 'line_generated', 'self_upload', 'claimed_personal', 'video_profile']);
const CONTACT_SOURCES = new Set(['private_import', 'ocr_scan', 'referral_placeholder', 'claimed_contact']);
const STATIC_VERSIONS = new Set(['standard', 'giga', 'square']);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function configOf(card) {
  const raw = card?.custom_config || card?.customConfig || card?.config || {};
  if (raw && typeof raw === 'object') return raw;
  try { return raw ? JSON.parse(raw) : {}; } catch (_) { return {}; }
}

function versionOf(card) {
  const rowId = text(card?.row_id || card?.rowId || card?.id).toUpperCase();
  const config = configOf(card);
  const raw = text(card?.card_version || card?.cardVersion || config.cardVersion || config.card_version || config.layoutStyle || config.layout).toLowerCase();
  const byPrefix = rowId.startsWith('CARD_VIDEO_') ? 'video'
    : rowId.startsWith('CARD_POSTER_') ? 'giga'
      : rowId.startsWith('CARD_SQUARE_') ? 'square'
        : rowId.startsWith('CARD_STD_') ? 'standard' : '';
  const byConfig = config.videoCard === true || config.videoStorageKind === 'dedicated_video_card' || config.cardVariant === 'video_card' || raw === 'video'
    ? 'video'
    : ['giga', 'poster', 'full', 'full_bleed', 'portrait'].includes(raw) ? 'giga'
      : ['square', '1:1'].includes(raw) ? 'square'
        : ['standard', 'std', 'landscape'].includes(raw) ? 'standard' : '';
  return byConfig || byPrefix || 'unknown';
}

function isActive(card) {
  const status = text(card?.status).toLowerCase();
  return card?.active !== false && card?.is_active !== false && Number(card?.is_active) !== 0 &&
    !text(card?.deleted_at || card?.deletedAt) && !text(card?.merged_into_row_id || card?.merged_into || card?.mergedInto) &&
    !text(card?.archived_at || card?.archivedAt) && !['deleted', 'merged', 'inactive', 'archived'].includes(status);
}

function candidateIdentityMatch(card, actorId, canonicalActorId) {
  if (card?.__identity_match === 1 || card?.__identity_match === '1' || card?.identityMatch === true) return true;
  const ids = [
    text(card?.owner_user_id || card?.ownerUserId),
    text(card?.profile_user_id || card?.profileUserId),
    text(card?.line_id || card?.lineId)
  ].filter(Boolean);
  return ids.includes(actorId) || ids.includes(canonicalActorId);
}

function cardSummary(card, actorId, canonicalActorId, networkId) {
  const sourceType = text(card?.source_type || card?.sourceType).toLowerCase();
  const version = versionOf(card);
  const identityMatch = candidateIdentityMatch(card, actorId, canonicalActorId);
  const networkMatch = text(card?.network_id || card?.networkId) === networkId;
  return {
    card,
    sourceType,
    version,
    identityMatch,
    networkMatch,
    active: isActive(card),
    personal: PERSONAL_SOURCES.has(sourceType),
    contact: CONTACT_SOURCES.has(sourceType),
    legacy: !PERSONAL_SOURCES.has(sourceType) && !CONTACT_SOURCES.has(sourceType),
    cardId: text(card?.row_id || card?.rowId || card?.id)
  };
}

export function resolveMyCardCandidates({ actorId, canonicalActorId = '', networkId, requestedVersion = 'standard', candidates = [] } = {}) {
  const trustedActorId = text(actorId);
  const canonicalId = text(canonicalActorId || actorId);
  const requiredNetworkId = text(networkId);
  const version = text(requestedVersion).toLowerCase() || 'standard';
  if (!trustedActorId || !requiredNetworkId) {
    return { ok: false, status: 'IDENTITY_MISSING', card: null, cardId: '', reason: 'identity_missing', diagnostics: ['IDENTITY_MISSING'], candidateCount: 0 };
  }
  if (!STATIC_VERSIONS.has(version)) {
    return { ok: false, status: 'VERSION_NOT_FOUND', card: null, cardId: '', reason: 'unsupported_static_version', diagnostics: ['VERSION_NOT_FOUND'], candidateCount: 0 };
  }

  const examined = (Array.isArray(candidates) ? candidates : []).map(card => cardSummary(card, trustedActorId, canonicalId, requiredNetworkId));
  const contactScannerMatch = candidate => {
    if (!candidate.contact) return false;
    const scannerId = text(candidate.card?.scanner_user_id || candidate.card?.scannerUserId);
    return scannerId === trustedActorId || scannerId === canonicalId;
  };
  const owned = examined.filter(candidate => candidate.identityMatch || contactScannerMatch(candidate));
  const sameNetwork = owned.filter(candidate => candidate.networkMatch);
  const activePersonal = sameNetwork.filter(candidate => candidate.active && candidate.personal && candidate.identityMatch);
  const activeLegacy = sameNetwork.filter(candidate => candidate.active && candidate.legacy);
  const otherNetworkPersonal = owned.filter(candidate => candidate.active && candidate.personal && !candidate.networkMatch);
  const activeContacts = sameNetwork.filter(candidate => candidate.active && candidate.contact);
  const diagnostics = [];

  if (otherNetworkPersonal.length && !activePersonal.length) diagnostics.push('TENANT_BOUNDARY');
  if (activeContacts.length && !activePersonal.length) diagnostics.push('MY_CARD_RESOLVED_CONTACT');
  if (activeLegacy.length && !activePersonal.length) diagnostics.push('LEGACY_UNCLASSIFIED');

  // Legacy rows have no aggregate ID. Treat distinct active versions as one
  // aggregate, but never choose between duplicate revisions of one version.
  const duplicateVersions = new Set();
  for (const candidate of activePersonal) {
    if (activePersonal.filter(item => item.version === candidate.version).length > 1) duplicateVersions.add(candidate.version);
  }
  if (duplicateVersions.size) diagnostics.push('MULTIPLE_PERSONAL');

  const requested = activePersonal.filter(candidate => candidate.version === version);
  if (!diagnostics.includes('MULTIPLE_PERSONAL') && requested.length === 1) {
    const selected = requested[0];
    return { ok: true, status: 'RESOLVED', card: selected.card, cardId: selected.cardId, reason: 'unique_personal_static_version', diagnostics, candidateCount: examined.length };
  }
  if (!diagnostics.includes('MULTIPLE_PERSONAL') && requested.length > 1) diagnostics.push('MULTIPLE_PERSONAL');
  if (!activePersonal.length && otherNetworkPersonal.length) {
    return { ok: false, status: 'TENANT_BOUNDARY', card: null, cardId: '', reason: 'other_network_only', diagnostics: [...new Set(diagnostics)], candidateCount: examined.length };
  }
  if (!activePersonal.length && activeContacts.length) {
    return { ok: false, status: 'CONTACT_ONLY', card: null, cardId: '', reason: 'contact_only', diagnostics: [...new Set(diagnostics)], candidateCount: examined.length };
  }
  if (!activePersonal.length && activeLegacy.length) {
    return { ok: false, status: 'LEGACY_UNCLASSIFIED', card: null, cardId: '', reason: 'legacy_unclassified', diagnostics: [...new Set(diagnostics)], candidateCount: examined.length };
  }
  if (diagnostics.includes('MULTIPLE_PERSONAL')) {
    return { ok: false, status: 'MULTIPLE_PERSONAL', card: null, cardId: '', reason: 'ambiguous_personal_versions', diagnostics: [...new Set(diagnostics)], candidateCount: examined.length };
  }
  if (activePersonal.length) diagnostics.push('VERSION_NOT_FOUND');
  return { ok: false, status: activePersonal.length ? 'VERSION_NOT_FOUND' : 'NOT_FOUND', card: null, cardId: '', reason: activePersonal.length ? 'requested_static_version_missing' : 'no_personal_card', diagnostics: [...new Set(diagnostics)], candidateCount: examined.length };
}

export { PERSONAL_SOURCES, CONTACT_SOURCES, STATIC_VERSIONS, versionOf };
