'use strict';

const crypto = require('crypto');

function hashIdentifier(value, salt = '') {
  const raw = String(value || '');
  if (!raw) return '';
  return `h:${crypto.createHash('sha256').update(`${String(salt)}:${raw}`).digest('hex').slice(0, 16)}`;
}

function safeToken(value, fallback = 'UNKNOWN', maxLength = 64) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_:-]+$/.test(token) && token.length <= maxLength ? token : fallback;
}

function safeRequestedVersion(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['standard', 'giga', 'square', 'video', 'any', 'unknown'].includes(normalized) ? normalized : 'unknown';
}

function safeMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['read', 'shadow', 'probe', 'unknown'].includes(normalized) ? normalized : 'unknown';
}

function cleanDiagnostics(value) {
  return Array.isArray(value) ? value.filter((item) => /^[A-Z0-9_:-]{1,96}$/.test(String(item))) : [];
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
    type: 'card_shadow_resolution', resolverVersion: safeToken(shadowResult.resolverVersion, 'unknown', 64),
    entrySource: safeToken(entrySource, 'UNKNOWN_ENTRY', 64), requestedVersion: safeRequestedVersion(requestedVersion), mode: safeMode(mode),
    candidateCount: Number(shadowResult.candidateCount || 0), eligibleCount: Array.isArray(shadowResult.eligibleCandidates) ? shadowResult.eligibleCandidates.length : 0,
    legacyMaskedCardId: hashIdentifier(comparison.legacyMaskedCardId, salt), shadowMaskedCardId: hashIdentifier(comparison.shadowMaskedCardId, salt),
    divergenceCode: safeToken(comparison.divergenceCode, 'UNKNOWN', 96), diagnostics: cleanDiagnostics(shadowResult.diagnostics),
    durationBucket: durationBucket(startedAt), timestamp: new Date().toISOString()
  };
}

function cardShadowFailureLog({ resolverVersion = 'cs-1b-shadow-hook-v1', entrySource = '', requestedVersion = '', errorType = 'Error', diagnostic = 'SHADOW_HOOK_FAILED' } = {}) {
  return {
    type: 'card_shadow_failure', resolverVersion: safeToken(resolverVersion, 'unknown', 64), entrySource: safeToken(entrySource, 'UNKNOWN_ENTRY', 64), requestedVersion: safeRequestedVersion(requestedVersion),
    errorType: safeToken(errorType, 'Error', 64), diagnostic: safeToken(diagnostic, 'SHADOW_HOOK_FAILED', 96), timestamp: new Date().toISOString()
  };
}

module.exports = { hashIdentifier, safeToken, safeRequestedVersion, safeMode, cardShadowComparisonLog, cardShadowFailureLog };