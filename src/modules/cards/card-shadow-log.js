'use strict';

const crypto = require('crypto');

const ENTRY_SOURCES = new Set(['my_card', 'ai_card_folder', 'public_card_read', 'crm_card_read', 'unknown_entry']);
const REQUESTED_VERSION_ALIASES = new Map([
  ['standard', 'standard'], ['giga', 'giga'], ['poster', 'giga'], ['square', 'square'], ['video', 'video'], ['any', 'any'], ['unknown', 'unknown']
]);
const MODES = new Set(['read', 'shadow', 'probe', 'unknown']);
const RESOLVER_VERSIONS = new Set(['cs-1a-shadow-v1', 'cs-1b-shadow-hook-v1']);
const ERROR_TYPES = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ShadowResolver', 'UnknownError']);
const DIAGNOSTICS = new Set([
  'MATCH', 'UNKNOWN', 'SHADOW_HOOK_FAILED', 'SHADOW_RESOLVER_FAILED',
  'IDENTITY_CONFLICT', 'TENANT_BOUNDARY', 'MULTIPLE_PERSONAL', 'MULTIPLE_ELIGIBLE_CARDS',
  'MY_CARD_RESOLVED_CONTACT', 'PERSONAL_EXCLUDED_FROM_AI_FOLDER', 'EXISTING_PERSONAL_CREATE_ATTEMPT',
  'ACTOR_IDENTITY_MISMATCH', 'LEGACY_UNCLASSIFIED', 'VERSION_MISMATCH', 'PREFIX_CONFIG_VERSION_CONFLICT',
  'LEGACY_SELECTED_CONTACT_FOR_MY_CARD', 'LEGACY_SELECTED_PERSONAL_FOR_AI_FOLDER',
  'LEGACY_SELECTED_DIFFERENT_CARD', 'LEGACY_SELECTED_WITH_IDENTITY_CONFLICT',
  'SHADOW_AMBIGUOUS_LEGACY_SELECTED_ONE', 'LEGACY_NOT_FOUND_SHADOW_FOUND', 'LEGACY_FOUND_SHADOW_NOT_FOUND'
]);

function hashIdentifier(value, salt = '') {
  const raw = String(value || '');
  if (!raw) return '';
  return `h:${crypto.createHash('sha256').update(`${String(salt)}:${raw}`).digest('hex').slice(0, 16)}`;
}

function safeEntrySource(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ENTRY_SOURCES.has(normalized) ? normalized : 'UNKNOWN_ENTRY';
}

function safeRequestedVersion(value) {
  return REQUESTED_VERSION_ALIASES.get(String(value || '').trim().toLowerCase()) || 'unknown';
}

function safeMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return MODES.has(normalized) ? normalized : 'unknown';
}

function safeResolverVersion(value) {
  const normalized = String(value || '').trim();
  return RESOLVER_VERSIONS.has(normalized) ? normalized : 'unknown';
}

function safeErrorType(value) {
  const normalized = String(value || '').trim();
  return ERROR_TYPES.has(normalized) ? normalized : 'Error';
}

function safeDiagnostic(value, fallback = 'UNKNOWN') {
  const normalized = String(value || '').trim();
  return DIAGNOSTICS.has(normalized) ? normalized : fallback;
}

function cleanDiagnostics(value) {
  return Array.isArray(value) ? value.map((item) => safeDiagnostic(item, '')).filter(Boolean) : [];
}

function durationBucket(startedAt) {
  const elapsed = Math.max(0, Date.now() - Number(startedAt || Date.now()));
  if (elapsed < 10) return 'lt_10ms';
  if (elapsed < 50) return 'lt_50ms';
  if (elapsed < 250) return 'lt_250ms';
  return 'gte_250ms';
}

function cardShadowComparisonLog({ shadowResult = {}, entrySource = '', requestedVersion = '', mode = '', startedAt, salt = '' } = {}) {
  const comparison = shadowResult.legacyComparison || {};
  return {
    type: 'card_shadow_resolution', resolverVersion: safeResolverVersion(shadowResult.resolverVersion),
    entrySource: safeEntrySource(entrySource), requestedVersion: safeRequestedVersion(requestedVersion), mode: safeMode(mode),
    candidateCount: Number(shadowResult.candidateCount || 0), eligibleCount: Array.isArray(shadowResult.eligibleCandidates) ? shadowResult.eligibleCandidates.length : 0,
    legacyMaskedCardId: hashIdentifier(comparison.legacyMaskedCardId, salt), shadowMaskedCardId: hashIdentifier(comparison.shadowMaskedCardId, salt),
    divergenceCode: safeDiagnostic(comparison.divergenceCode), diagnostics: cleanDiagnostics(shadowResult.diagnostics),
    durationBucket: durationBucket(startedAt), timestamp: new Date().toISOString()
  };
}

function cardShadowFailureLog({ resolverVersion = 'cs-1b-shadow-hook-v1', entrySource = '', requestedVersion = '', errorType = 'Error', diagnostic = 'SHADOW_HOOK_FAILED' } = {}) {
  return {
    type: 'card_shadow_failure', resolverVersion: safeResolverVersion(resolverVersion), entrySource: safeEntrySource(entrySource), requestedVersion: safeRequestedVersion(requestedVersion),
    errorType: safeErrorType(errorType), diagnostic: safeDiagnostic(diagnostic, 'SHADOW_HOOK_FAILED'), timestamp: new Date().toISOString()
  };
}

module.exports = {
  hashIdentifier, safeEntrySource, safeRequestedVersion, safeMode, safeResolverVersion, safeErrorType, safeDiagnostic,
  cardShadowComparisonLog, cardShadowFailureLog
};
