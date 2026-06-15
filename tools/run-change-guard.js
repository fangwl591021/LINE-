#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const stage = String(process.argv[2] || '').toLowerCase();
const validStages = new Set(['before', 'after']);

if (!validStages.has(stage)) {
  console.error('Usage: node tools/run-change-guard.js <before|after>');
  process.exit(2);
}

const root = path.resolve(__dirname, '..');
const label = stage === 'before' ? 'BEFORE functional edits' : 'AFTER functional edits';

console.log(`\n== Change guard: ${label} ==`);
console.log('Running full smoke contracts. Do not deploy on failure.\n');

const result = spawnSync(process.execPath, ['tools/run-smoke-contracts.js', '--full'], {
  cwd: root,
  stdio: 'inherit'
});

if (result.error) {
  console.error(`\nChange guard failed to start: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`\nChange guard ${stage} failed. Stop and fix the contract failure before continuing.`);
  process.exit(result.status || 1);
}

console.log(`\nChange guard ${stage} passed.`);
