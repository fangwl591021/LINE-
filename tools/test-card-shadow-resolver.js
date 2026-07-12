#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { resolveCardShadow, safeRunShadowResolver } = require('../src/modules/cards/card-shadow-resolver');

const fixtures = path.join(__dirname, 'fixtures', 'card-shadow');
const load = (name) => JSON.parse(fs.readFileSync(path.join(fixtures, name), 'utf8'));
const has = (result, code) => result.diagnostics.includes(code);
const cases = [
  ['unique-personal-match.json', (r) => r.selectedCardId && r.legacyComparison.divergenceCode === 'MATCH'],
  ['multiple-personal.json', (r) => has(r, 'MULTIPLE_PERSONAL') && !r.selectedCardId && r.legacyComparison.divergenceCode === 'SHADOW_AMBIGUOUS_LEGACY_SELECTED_ONE'],
  ['my-card-contact-only.json', (r) => has(r, 'MY_CARD_RESOLVED_CONTACT') && !r.selectedCardId && r.legacyComparison.divergenceCode === 'LEGACY_SELECTED_CONTACT_FOR_MY_CARD'],
  ['ai-folder-personal-only.json', (r) => has(r, 'PERSONAL_EXCLUDED_FROM_AI_FOLDER') && !r.selectedCardId && r.legacyComparison.divergenceCode === 'LEGACY_SELECTED_PERSONAL_FOR_AI_FOLDER'],
  ['identity-conflict.json', (r) => has(r, 'IDENTITY_CONFLICT')],
  ['tenant-boundary-conflict.json', (r) => has(r, 'TENANT_BOUNDARY')],
  ['legacy-unclassified.json', (r) => r.candidates[0].classification.diagnostics.includes('LEGACY_UNCLASSIFIED')],
  ['version-prefix-config-conflict.json', (r) => r.candidates[0].classification.diagnostics.includes('PREFIX_CONFIG_VERSION_CONFLICT')],
  ['video-request-standard-only.json', (r) => !r.selectedCardId && r.candidates[0].exclusionReasons.includes('VERSION_MISMATCH')],
  ['line-create-existing-personal.json', (r) => has(r, 'EXISTING_PERSONAL_CREATE_ATTEMPT') && r.invariantDecision === 'BLOCK_CREATE_AND_ROUTE_TO_EDIT'],
  ['line-create-existing-video-personal.json', (r) => has(r, 'EXISTING_PERSONAL_CREATE_ATTEMPT') && !r.selectedCardId && r.personalExistenceCandidates.length === 1 && r.invariantDecision === 'BLOCK_CREATE_AND_ROUTE_TO_EDIT'],
  ['line-create-existing-giga-personal.json', (r) => has(r, 'EXISTING_PERSONAL_CREATE_ATTEMPT') && !r.selectedCardId && r.personalExistenceCandidates.length === 1 && r.invariantDecision === 'BLOCK_CREATE_AND_ROUTE_TO_EDIT'],
  ['line-create-existing-square-personal.json', (r) => has(r, 'EXISTING_PERSONAL_CREATE_ATTEMPT') && !r.selectedCardId && r.personalExistenceCandidates.length === 1 && r.invariantDecision === 'BLOCK_CREATE_AND_ROUTE_TO_EDIT'],
  ['line-create-other-users-personal.json', (r) => !has(r, 'EXISTING_PERSONAL_CREATE_ATTEMPT') && has(r, 'ACTOR_IDENTITY_MISMATCH') && r.personalExistenceCandidates.length === 0],
  ['line-create-other-network-personal.json', (r) => !has(r, 'EXISTING_PERSONAL_CREATE_ATTEMPT') && has(r, 'TENANT_BOUNDARY') && r.personalExistenceCandidates.length === 0],
  ['line-create-contact-only.json', (r) => !has(r, 'EXISTING_PERSONAL_CREATE_ATTEMPT') && r.personalExistenceCandidates.length === 0 && r.invariantDecision === 'NO_WRITE_DECISION_THIS_SHADOW_READ'],
  ['legacy-shadow-same.json', (r) => r.legacyComparison.divergenceCode === 'MATCH'],
  ['legacy-shadow-different-card.json', (r) => r.legacyComparison.divergenceCode === 'LEGACY_SELECTED_DIFFERENT_CARD'],
  ['legacy-selected-contact-for-my-card.json', (r) => r.legacyComparison.divergenceCode === 'LEGACY_SELECTED_CONTACT_FOR_MY_CARD']
];

let failed = 0;
for (const [fixture, check] of cases) {
  try {
    const result = resolveCardShadow(load(fixture));
    assert.ok(check(result), fixture);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('U_ACTOR_A') && !serialized.includes('network-a'), `${fixture}: raw identity leaked`);
    console.log(`PASS ${fixture}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${fixture}: ${error.message}`);
  }
}

const isolated = safeRunShadowResolver({ get actor() { throw new Error('fixture throw'); } });
assert.strictEqual(isolated.ok, false, 'shadow failure must be isolated');
assert.ok(/^SHADOW_RESOLVER_FAILED:/.test(isolated.diagnostic), 'failure diagnostic must be sanitized');
console.log('PASS shadow failure isolation');
if (failed) process.exit(1);
console.log(`Card shadow resolver fixture tests passed: ${cases.length}/${cases.length}`);
