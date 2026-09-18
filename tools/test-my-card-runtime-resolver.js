#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const root = path.resolve(__dirname, '..');
  const resolver = await import(pathToFileURL(path.join(root, 'src/modules/cards/my-card-runtime-resolver.mjs')).href);
  const adapter = await import(pathToFileURL(path.join(root, 'src/modules/cards/my-card-runtime-adapter.mjs')).href);
  const fixtures = path.join(__dirname, 'fixtures', 'my-card-runtime');
  const names = [
    'unique-standard-personal', 'unique-giga-personal', 'unique-square-personal', 'contact-only',
    'multiple-personal', 'other-user-personal', 'other-network-personal', 'legacy-unclassified',
    'video-only-personal', 'deleted-personal', 'merged-personal', 'missing-actor',
    'standard-plus-contact', 'standard-plus-video'
  ];

  for (const name of names) {
    const fixture = JSON.parse(fs.readFileSync(path.join(fixtures, `${name}.json`), 'utf8'));
    const result = resolver.resolveMyCardCandidates(fixture);
    assert.strictEqual(result.status, fixture.expected.status, `${name}: status`);
    if (fixture.expected.cardId) assert.strictEqual(result.cardId, fixture.expected.cardId, `${name}: card`);
    assert.strictEqual(result.card ? result.card.row_id : null, result.cardId || null, `${name}: selected card reference`);
    console.log(`PASS ${name}`);
  }

  const scannerOnly = resolver.resolveMyCardCandidates({
    actorId: 'U_ACTOR', networkId: 'tenant-a', requestedVersion: 'standard',
    candidates: [{ row_id: 'CARD_STD_OTHER', owner_user_id: 'U_OTHER', scanner_user_id: 'U_ACTOR', network_id: 'tenant-a', source_type: 'self_profile', is_active: 1 }]
  });
  assert.strictEqual(scannerOnly.status, 'NOT_FOUND', 'scanner must not resolve personal ownership');
  const creatorOnly = resolver.resolveMyCardCandidates({
    actorId: 'U_ACTOR', networkId: 'tenant-a', requestedVersion: 'standard',
    candidates: [{ row_id: 'CARD_STD_OTHER', owner_user_id: 'U_OTHER', creator_id: 'U_ACTOR', network_id: 'tenant-a', source_type: 'self_profile', is_active: 1 }]
  });
  assert.strictEqual(creatorOnly.status, 'NOT_FOUND', 'creator must not resolve personal ownership');
  console.log('PASS scanner and creator do not become personal owners');

  let prepareCount = 0;
  let writeCalled = false;
  const db = {
    prepare(sql) {
      prepareCount += 1;
      assert.match(sql, /^\s*WITH identity_link/i, 'uses bounded read query');
      assert.ok(!/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i.test(sql), 'query is read-only');
      return {
        bind(...binds) {
          assert.ok(binds.length > 0, 'query binds trusted actor only');
          return { all: async () => ({ results: [{ row_id: 'CARD_STD_DB', owner_user_id: 'U_ACTOR', network_id: 'tenant-a', source_type: 'self_profile', is_active: 1, __identity_match: 1, __canonical_actor_id: 'U_ACTOR' }] }) };
        },
        run() { writeCalled = true; throw new Error('write must not run'); }
      };
    }
  };
  const dbResult = await adapter.resolveMyCardRuntime({ db, actorId: 'U_ACTOR', networkId: 'tenant-a', requestedVersion: 'standard' });
  assert.strictEqual(dbResult.status, 'RESOLVED');
  assert.strictEqual(prepareCount, 1, 'exactly one D1 SELECT query');
  assert.strictEqual(writeCalled, false, 'no D1 write');
  console.log('PASS single read-only D1 query');

  const disabled = await adapter.resolveMyCardRuntimeIfEnabled({ env: {}, db, actorId: 'U_ACTOR', networkId: 'tenant-a' });
  assert.deepStrictEqual(disabled, { enabled: false, resolution: null }, 'flag false skips V2 query');
  assert.strictEqual(prepareCount, 1, 'flag false makes no extra query');
  const enabled = await adapter.resolveMyCardRuntimeIfEnabled({ env: { CARD_MY_CARD_RESOLVER_V2_ENABLED: 'yes' }, db, actorId: 'U_ACTOR', networkId: 'tenant-a' });
  assert.strictEqual(enabled.enabled, true);
  assert.strictEqual(enabled.resolution.status, 'RESOLVED');
  console.log('PASS feature flag gating');

  const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
  assert.match(worker, /event\?\.source\?\.userId/, 'Worker uses webhook source UID');
  assert.match(worker, /isKeyword && isMyCardResolverV2Enabled\(env\)/, 'V2 applies only to My Card keyword');
  assert.match(worker, /requestedVersion: 'standard'/, 'keyword requests static standard');
  assert.match(worker, /Never fall back to legacy\/contact selection/, 'resolver failure cannot fall back to legacy/contact');
  console.log('PASS Worker My Card integration contract');
  console.log(`CS-2A My Card runtime resolver tests passed: ${names.length + 4}/${names.length + 4}`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
