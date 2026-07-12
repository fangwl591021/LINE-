'use strict';

const { safeRunShadowResolver } = require('./card-shadow-resolver');
const { cardShadowComparisonLog, cardShadowFailureLog } = require('./card-shadow-log');

function isCardShadowResolverEnabled(env = {}) {
  return ['1', 'true', 'on', 'yes'].includes(String(env.CARD_SHADOW_RESOLVER_ENABLED || '').trim().toLowerCase());
}

function cloneForShadow(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneForShadow);
  const copy = {};
  for (const key of Object.keys(value)) copy[key] = cloneForShadow(value[key]);
  return copy;
}

function emit(logger, event) { if (typeof logger === 'function') logger(event); }

function runCardShadowHook({ env = {}, entrySource, requestedVersion, mode, action, networkId, actor, candidates, legacyResult, logger, shadowRunner = safeRunShadowResolver } = {}) {
  if (!isCardShadowResolverEnabled(env)) return { enabled: false, executed: false, ok: null, divergenceCode: '', diagnostic: '' };
  const startedAt = Date.now();
  try {
    const shadow = shadowRunner(cloneForShadow({ entrySource, requestedVersion, mode, action, networkId, actor, candidates, legacyResult }));
    if (!shadow || !shadow.ok) {
      const diagnostic = String(shadow && shadow.diagnostic || 'SHADOW_RESOLVER_FAILED').replace(/[^A-Z0-9_:-]/g, '').slice(0, 96) || 'SHADOW_RESOLVER_FAILED';
      emit(logger, cardShadowFailureLog({ entrySource, requestedVersion, diagnostic, errorType: 'ShadowResolver' }));
      return { enabled: true, executed: true, ok: false, divergenceCode: '', diagnostic };
    }
    const divergenceCode = String(shadow.result && shadow.result.legacyComparison && shadow.result.legacyComparison.divergenceCode || 'UNKNOWN');
    emit(logger, cardShadowComparisonLog({ shadowResult: shadow.result, entrySource, requestedVersion, mode, startedAt, salt: env.CARD_SHADOW_HASH_SALT || '' }));
    return { enabled: true, executed: true, ok: true, divergenceCode, diagnostic: '' };
  } catch (error) {
    try { emit(logger, cardShadowFailureLog({ entrySource, requestedVersion, errorType: error && error.name, diagnostic: 'SHADOW_HOOK_FAILED' })); } catch (_) {}
    return { enabled: true, executed: true, ok: false, divergenceCode: '', diagnostic: 'SHADOW_HOOK_FAILED' };
  }
}

async function resolveWithCardShadow({ legacyResolver, legacyArgs = [], shadowInputFactory, env = {}, logger } = {}) {
  const legacyResult = await legacyResolver(...legacyArgs);
  if (!isCardShadowResolverEnabled(env)) return legacyResult;
  try {
    const shadowInput = shadowInputFactory({ legacyResult });
    runCardShadowHook({ ...shadowInput, env, legacyResult, logger });
  } catch (_) {}
  return legacyResult;
}

module.exports = { isCardShadowResolverEnabled, runCardShadowHook, resolveWithCardShadow };
