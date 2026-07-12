'use strict';

const PERSONAL_SOURCES = new Set([
  'self_profile', 'video_profile', 'line_generated', 'self_upload', 'claimed_personal'
]);
const CONTACT_SOURCES = new Set([
  'private_import', 'ocr_scan', 'referral_placeholder', 'claimed_contact'
]);

function text(value) { return value === undefined || value === null ? '' : String(value); }
function configOf(card) { return card.custom_config || card.config || {}; }

function normalizeVersion(value) {
  const raw = text(value).toLowerCase();
  if (['standard', 'std'].includes(raw)) return 'standard';
  if (['giga', 'poster', 'full', 'full_bleed'].includes(raw)) return 'giga';
  if (['square', '1:1'].includes(raw)) return 'square';
  if (raw === 'video') return 'video';
  return '';
}

function resolveCardVersion(card = {}) {
  const id = text(card.row_id || card.card_id || card.id);
  const config = configOf(card);
  const explicitRaw = card.cardVersion || card.card_version || config.cardVersion || config.layoutStyle || config.cardVariant || (config.videoCard ? 'video' : '');
  const explicitVersion = normalizeVersion(explicitRaw);
  const prefixVersion = /^CARD_VIDEO_/i.test(id) ? 'video'
    : /^CARD_SQUARE_/i.test(id) ? 'square'
      : /^CARD_POSTER_/i.test(id) ? 'giga'
        : /^CARD_STD_/i.test(id) ? 'standard' : '';
  const diagnostics = [];
  if (prefixVersion && explicitVersion && prefixVersion !== explicitVersion) {
    diagnostics.push('VERSION_MISMATCH', 'PREFIX_CONFIG_VERSION_CONFLICT');
  }
  return {
    resolvedVersion: explicitVersion || prefixVersion || 'unknown',
    prefixVersion,
    explicitVersion,
    evidence: { idPrefix: Boolean(prefixVersion), explicitConfig: Boolean(explicitVersion) },
    diagnostics
  };
}

function classifyCardCandidate(card = {}) {
  const sourceType = text(card.source_type || card.sourceType || card.source || 'legacy_unknown').toLowerCase();
  const version = resolveCardVersion(card);
  const diagnostics = [...version.diagnostics];
  let cardType = 'legacy_ambiguous';
  let confidence = 'low';
  if (PERSONAL_SOURCES.has(sourceType)) { cardType = 'personal'; confidence = 'high'; }
  else if (CONTACT_SOURCES.has(sourceType)) { cardType = 'contact'; confidence = 'high'; }
  else {
    diagnostics.push('LEGACY_UNCLASSIFIED');
  }
  return {
    cardType,
    sourceType,
    version: version.resolvedVersion,
    versionEvidence: version,
    identityEvidence: {
      ownerUserId: text(card.owner_user_id || card.ownerUserId),
      profileUserId: text(card.profile_user_id || card.profileUserId),
      boundUserId: text(card.bound_user_id || card.boundUserId),
      lineId: text(card.line_id || card.lineId),
      scannerUserId: text(card.scanner_user_id || card.scannerUid || card.scanned_by),
      creatorId: text(card.creator_id || card.created_by)
    },
    confidence,
    diagnostics
  };
}

module.exports = { classifyCardCandidate, resolveCardVersion, normalizeVersion };
