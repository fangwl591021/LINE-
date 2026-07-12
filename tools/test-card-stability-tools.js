#!/usr/bin/env node
'use strict';

/**
 * Fixture-only smoke tests for Card Stabilization 0 tools.
 * No runtime imports, network calls, D1 access, writes, migrations, or deploys.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const traceTool = path.join(__dirname, 'trace-card-resolution.js');
const fixtureDir = path.join(__dirname, 'fixtures', 'card-stability');

const cases = [
  {
    file: 'unique-personal.json',
    check(result) {
      const readablePersonal = result.candidateCards.filter((item) =>
        item.type === 'personal' && item.permission.read
      );
      const rejectedContact = result.candidateCards.some((item) =>
        item.type === 'contact' && item.exclusionReasons.includes('MY_CARD_RESOLVED_CONTACT')
      );
      return Boolean(result.finalCard) && readablePersonal.length === 1 && rejectedContact;
    },
    expectation: 'unique personal resolves while contact is excluded'
  },
  {
    file: 'block-second-line-generation.json',
    check(result) {
      return result.diagnostics.includes('EXISTING_PERSONAL_CREATE_ATTEMPT') &&
        result.invariantDecision === 'BLOCK_CREATE_AND_ROUTE_TO_EDIT';
    },
    expectation: 'existing personal blocks second LINE generation'
  },
  {
    file: 'claim-preserves-contact.json',
    check(result) {
      const types = result.candidateCards.map((item) => item.type);
      return types.includes('contact') && types.includes('personal') &&
        !result.diagnostics.includes('CLAIM_CONTACT_LOST') &&
        !result.diagnostics.includes('CLAIM_POINTER_MISSING') &&
        !result.diagnostics.includes('INVITER_CONFLICT');
    },
    expectation: 'claim preserves contact, creates/links personal, and preserves inviter'
  },
  {
    file: 'my-card-contact-rejected.json',
    check(result) {
      return result.diagnostics.includes('MY_CARD_RESOLVED_CONTACT') && result.finalCard === null;
    },
    expectation: 'my-card entry rejects contact-only candidate'
  },
  {
    file: 'multiple-personal.json',
    check(result) {
      return result.diagnostics.includes('MULTIPLE_PERSONAL') &&
        result.diagnostics.includes('MULTIPLE_ELIGIBLE_CARDS') &&
        result.finalCard === null && result.ambiguity === true;
    },
    expectation: 'multiple personal candidates remain ambiguous'
  },
  {
    file: 'claim-contact-lost.json',
    check(result) { return result.diagnostics.includes('CLAIM_CONTACT_LOST'); },
    expectation: 'claimed contact without scanner history is flagged'
  },
  {
    file: 'claim-pointer-missing.json',
    check(result) { return result.diagnostics.includes('CLAIM_POINTER_MISSING'); },
    expectation: 'claimed contact without recognized pointer is flagged'
  },
  {
    file: 'inviter-conflict.json',
    check(result) {
      return result.diagnostics.includes('INVITER_CONFLICT') && !result.diagnostics.includes('INVITER_DIFFERENCE_AUTHORIZED');
    },
    expectation: 'unauthorized inviter and scanner difference is flagged'
  },
  {
    file: 'inviter-authorized-difference.json',
    check(result) {
      return result.diagnostics.includes('INVITER_DIFFERENCE_AUTHORIZED') && !result.diagnostics.includes('INVITER_CONFLICT');
    },
    expectation: 'authorized inviter difference remains reviewable without conflict'
  },
  {
    file: 'prefix-config-version-conflict.json',
    check(result) { return result.diagnostics.includes('PREFIX_CONFIG_VERSION_CONFLICT'); },
    expectation: 'row prefix and config version conflict is flagged'
  },
  {
    file: 'ai-folder-personal-rejected.json',
    check(result) {
      return result.diagnostics.includes('PERSONAL_EXCLUDED_FROM_AI_FOLDER') && result.finalCard === null;
    },
    expectation: 'AI card folder excludes a personal candidate'  }
];

let failed = 0;
for (const testCase of cases) {
  const fixture = path.join(fixtureDir, testCase.file);
  if (!fs.existsSync(fixture)) {
    console.error(`FAIL ${testCase.file}: fixture missing`);
    failed += 1;
    continue;
  }
  try {
    const output = execFileSync(process.execPath, [traceTool, '--fixture', fixture], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const result = JSON.parse(output);
    if (!testCase.check(result)) {
      console.error(`FAIL ${testCase.file}: ${testCase.expectation}`);
      failed += 1;
    } else {
      console.log(`PASS ${testCase.file}: ${testCase.expectation}`);
    }
  } catch (error) {
    console.error(`FAIL ${testCase.file}: ${error.message}`);
    failed += 1;
  }
}

if (failed) {
  console.error(`Card stability fixture tests failed: ${failed}/${cases.length}`);
  process.exit(1);
}
console.log(`Card stability fixture tests passed: ${cases.length}/${cases.length}`);
