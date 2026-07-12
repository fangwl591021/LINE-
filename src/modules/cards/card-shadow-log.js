'use strict';

const crypto = require('crypto');

function hashIdentifier(value, salt = '') {
  const raw = String(value || '');
  if (!raw) return '';
  return `h:${crypto.createHash('sha256').update(`${String(salt)}:${raw}`).digest('hex').slice(0, 16)}`;
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
    type: 'card_shadow_resolution', resolverVersion: String(shadowResult.resolverVersion || 'unknown'),
    entrySource: String(entrySource), requestedVersion: String(requestedVersion), mode: String(mode),
    candidateCount: Number(shadowResult.candidateCount || 0), eligibleCount: Array.isArray(shadowResult.eligibleCandidates) ? shadowResult.eligibleCandidates.length : 0,
    legacyMaskedCardId: hashIdentifier(comparison.legacyMaskedCardId, salt), shadowMaskedCardId: hashIdentifier(comparison.shadowMaskedCardId, salt),
    divergenceCode: String(comparison.divergenceCode || 'UNKNOWN'), diagnostics: cleanDiagnostics(shadowResult.diagnostics),
    durationBucket: durationBucket(startedAt), timestamp: new Date().toISOString()
  };
}

function cardShadowFailureLog({ resolverVersion = 'cs-1b-shadow-hook-v1', entrySource = '', requestedVersion = '', errorType = 'Error', diagnostic = 'SHADOW_HOOK_FAILED' } = {}) {
  return {
    type: 'card_shadow_failure', resolverVersion: String(resolverVersion), entrySource: String(entrySource), requestedVersion: String(requestedVersion),
    errorType: String(errorType || 'Error').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64) || 'Error',
    diagnostic: String(diagnostic || 'SHADOW_HOOK_FAILED').replace(/[^A-Z0-9_:-]/g, '').slice(0, 96) || 'SHADOW_HOOK_FAILED', timestamp: new Date().toISOString()
  };
}

module.exports = { hashIdentifier, cardShadowComparisonLog, cardShadowFailureLog };
