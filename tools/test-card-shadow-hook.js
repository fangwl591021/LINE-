#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { isCardShadowResolverEnabled, runCardShadowHook, resolveWithCardShadow } = require('../src/modules/cards/card-shadow-hook');
const { cardShadowComparisonLog, cardShadowFailureLog } = require('../src/modules/cards/card-shadow-log');

for (const [value, expected] of [['', false], [undefined, false], ['false', false], ['0', false], ['off', false], ['no', false], ['true', true], ['1', true], ['on', true], ['yes', true]]) {
  assert.strictEqual(isCardShadowResolverEnabled({ CARD_SHADOW_RESOLVER_ENABLED: value }), expected, `flag ${value}`);
}

const baseInput = () => ({
  entrySource: 'my_card', requestedVersion: 'standard', mode: 'read', action: 'resolve', networkId: 'network-a',
  actor: { liffUserId: 'U_RAW_ACTOR' }, candidates: [{ row_id: 'CARD_RAW_1', custom_config: { videoUrl: 'https://video.example/raw' } }],
  legacyResult: { cardId: 'CARD_LEGACY_RAW', name: 'Raw Name', phone: '0912345678', email: 'raw@example.com' }
});

const noLog = [];
assert.strictEqual(runCardShadowHook({ ...baseInput(), env: {}, logger: (event) => noLog.push(event) }).executed, false);
assert.strictEqual(noLog.length, 0, 'disabled flag must not log');

const events = [];
const success = runCardShadowHook({
  ...baseInput(), env: { CARD_SHADOW_RESOLVER_ENABLED: 'true', CARD_SHADOW_HASH_SALT: 'fixture-salt' }, logger: (event) => events.push(event),
  shadowRunner: () => ({ ok: true, result: { resolverVersion: 'fixture', candidateCount: 1, eligibleCandidates: ['CARD_RAW_1'], diagnostics: ['MATCH'], legacyComparison: { legacyMaskedCardId: 'CAR***', shadowMaskedCardId: 'CAR***', divergenceCode: 'MATCH' } } })
});
assert.deepStrictEqual(success, { enabled: true, executed: true, ok: true, divergenceCode: 'MATCH', diagnostic: '' });
assert.deepStrictEqual(Object.keys(events[0]).sort(), ['candidateCount', 'diagnostics', 'divergenceCode', 'durationBucket', 'eligibleCount', 'entrySource', 'legacyMaskedCardId', 'mode', 'requestedVersion', 'resolverVersion', 'shadowMaskedCardId', 'timestamp', 'type'].sort());
const serializedLog = JSON.stringify(events[0]);
for (const forbidden of ['U_RAW_ACTOR', 'Raw Name', '0912345678', 'raw@example.com', 'custom_config', 'https://video.example/raw', 'CARD_RAW_1']) assert.ok(!serializedLog.includes(forbidden), `log leaked ${forbidden}`);

const hostileLog = cardShadowComparisonLog({
  shadowResult: { resolverVersion: 'https://bad.example/u/U123', candidateCount: 0, eligibleCandidates: [], legacyComparison: { divergenceCode: 'MATCH' } },
  entrySource: 'raw@example.com /line?uid=U1234567890', requestedVersion: '0912345678', mode: 'request body with spaces'
});
assert.strictEqual(hostileLog.resolverVersion, 'unknown');
assert.strictEqual(hostileLog.entrySource, 'UNKNOWN_ENTRY');
assert.strictEqual(hostileLog.requestedVersion, 'unknown');
assert.strictEqual(hostileLog.mode, 'unknown');
for (const forbidden of ['bad.example', 'raw@example.com', '0912345678', 'U1234567890', 'request body']) assert.ok(!JSON.stringify(hostileLog).includes(forbidden), `sanitized comparison log leaked ${forbidden}`);

const hostileFailure = cardShadowFailureLog({
  resolverVersion: 'resolver raw@example.com', entrySource: 'https://bad.example/?phone=0912345678', requestedVersion: 'U1234567890', errorType: 'TypeError raw@example.com', diagnostic: 'failure with secret text'
});
assert.strictEqual(hostileFailure.resolverVersion, 'unknown');
assert.strictEqual(hostileFailure.entrySource, 'UNKNOWN_ENTRY');
assert.strictEqual(hostileFailure.requestedVersion, 'unknown');
assert.strictEqual(hostileFailure.errorType, 'Error');
assert.strictEqual(hostileFailure.diagnostic, 'SHADOW_HOOK_FAILED');
for (const forbidden of ['bad.example', 'raw@example.com', '0912345678', 'U1234567890', 'secret text']) assert.ok(!JSON.stringify(hostileFailure).includes(forbidden), `sanitized failure log leaked ${forbidden}`);

const normalizedLog = cardShadowComparisonLog({
  shadowResult: { resolverVersion: 'cs-1a-shadow-v1', candidateCount: 0, eligibleCandidates: [], diagnostics: ['MATCH', 'U1234567890'], legacyComparison: { divergenceCode: 'MATCH' } },
  entrySource: 'MY_CARD', requestedVersion: 'poster', mode: 'READ'
});
assert.strictEqual(normalizedLog.entrySource, 'my_card');
assert.strictEqual(normalizedLog.requestedVersion, 'giga');
assert.strictEqual(normalizedLog.mode, 'read');
assert.strictEqual(normalizedLog.resolverVersion, 'cs-1a-shadow-v1');
assert.deepStrictEqual(normalizedLog.diagnostics, ['MATCH']);

const uidTokenLog = cardShadowComparisonLog({
  shadowResult: { resolverVersion: 'U1234567890', candidateCount: 0, eligibleCandidates: [], legacyComparison: { divergenceCode: 'U1234567890' } },
  entrySource: 'not_an_entry', requestedVersion: 'raw@example.com', mode: '0912345678'
});
assert.strictEqual(uidTokenLog.entrySource, 'UNKNOWN_ENTRY');
assert.strictEqual(uidTokenLog.resolverVersion, 'unknown');
assert.strictEqual(uidTokenLog.requestedVersion, 'unknown');
assert.strictEqual(uidTokenLog.mode, 'unknown');
assert.strictEqual(uidTokenLog.divergenceCode, 'UNKNOWN');
assert.ok(!JSON.stringify(uidTokenLog).includes('U1234567890'), 'UID-like token must not enter comparison log');

const uidTokenFailure = cardShadowFailureLog({ errorType: 'U1234567890', diagnostic: 'U1234567890' });
assert.strictEqual(uidTokenFailure.errorType, 'Error');
assert.strictEqual(uidTokenFailure.diagnostic, 'SHADOW_HOOK_FAILED');
const originalCandidates = baseInput().candidates;
const originalActor = { liffUserId: 'U_RAW_ACTOR' };
const originalLegacy = { status: 200, message: 'legacy remains' };
runCardShadowHook({ ...baseInput(), candidates: originalCandidates, actor: originalActor, legacyResult: originalLegacy, env: { CARD_SHADOW_RESOLVER_ENABLED: 'on' }, shadowRunner: (input) => { input.candidates[0].row_id = 'MUTATED'; input.actor.liffUserId = 'MUTATED'; input.legacyResult.message = 'MUTATED'; return { ok: false, diagnostic: 'BAD' }; } });
assert.strictEqual(originalCandidates[0].row_id, 'CARD_RAW_1', 'shadow runner must not mutate candidate input');
assert.strictEqual(originalActor.liffUserId, 'U_RAW_ACTOR', 'shadow runner must not mutate actor input');
assert.strictEqual(originalLegacy.message, 'legacy remains', 'shadow runner must not mutate legacy input');

for (const failure of [() => { throw new Error('secret message'); }, () => ({ ok: false, diagnostic: 'RAW_MESSAGE_NOT_ALLOWED' })]) {
  const outcome = runCardShadowHook({ ...baseInput(), env: { CARD_SHADOW_RESOLVER_ENABLED: '1' }, logger: () => { throw new Error('logger throws'); }, shadowRunner: failure });
  assert.strictEqual(outcome.enabled, true);
  assert.strictEqual(outcome.ok, false);
}

const failureEvents = [];
runCardShadowHook({ ...baseInput(), env: { CARD_SHADOW_RESOLVER_ENABLED: 'yes' }, logger: (event) => failureEvents.push(event), shadowRunner: () => { throw new Error('raw secret message and stack'); } });
const serializedFailure = JSON.stringify(failureEvents[0]);
assert.ok(!serializedFailure.includes('raw secret message') && !serializedFailure.includes('stack'), 'failure log must not expose message or stack');
async function testFlagOffDoesNotInvokeCallbacks() {
  for (const value of [undefined, 'false', 'off', 'no', '0']) {
    let factoryCalls = 0;
    let runnerCalls = 0;
    let loggerCalls = 0;
    const legacy = {};
    const returned = await resolveWithCardShadow({
      legacyResolver: () => legacy,
      env: { CARD_SHADOW_RESOLVER_ENABLED: value },
      shadowInputFactory: () => { factoryCalls += 1; return { ...baseInput(), shadowRunner: () => { runnerCalls += 1; return { ok: true, result: {} }; } }; },
      logger: () => { loggerCalls += 1; }
    });
    assert.strictEqual(returned, legacy);
    assert.strictEqual(factoryCalls, 0, 'flag disabled factory');
    assert.strictEqual(runnerCalls, 0, 'flag disabled runner');
    assert.strictEqual(loggerCalls, 0, 'flag disabled logger');
  }
}
async function testLegacyReference() {
  const legacy = { status: 200, body: { preserved: true } };
  for (const options of [
    { env: {} },
    { env: { CARD_SHADOW_RESOLVER_ENABLED: 'true' }, shadowInputFactory: () => { throw new Error('factory'); } },
    { env: { CARD_SHADOW_RESOLVER_ENABLED: 'true' }, shadowInputFactory: () => ({ ...baseInput(), shadowRunner: () => { throw new Error('shadow'); } }), logger: () => { throw new Error('logger'); } },
    { env: { CARD_SHADOW_RESOLVER_ENABLED: 'true' }, shadowInputFactory: () => ({ ...baseInput(), candidates: 'malformed' }) }
  ]) {
    const returned = await resolveWithCardShadow({ legacyResolver: () => legacy, ...options });
    assert.strictEqual(returned, legacy, 'legacy object reference must be returned unchanged');
  }
}

Promise.all([testFlagOffDoesNotInvokeCallbacks(), testLegacyReference()]).then(() => console.log('Card shadow hook tests passed')).catch((error) => { console.error(error.stack); process.exit(1); });
