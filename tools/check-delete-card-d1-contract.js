const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const entry = fs.readFileSync(path.join(root, 'worker-entry.mjs'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK ${message}`);
}

ok(entry.includes("if (action === 'deleteCard')"), 'deleteCard is intercepted by worker-entry');
ok(entry.includes("actor.role !== 'admin'"), 'deleteCard keeps admin-only authorization');
ok(entry.includes('DELETE FROM card_fate_tag_jobs WHERE card_row_id=?'), 'deleteCard removes queued fate-tag job');
ok(entry.includes('DELETE FROM card_contacts WHERE row_id=?'), 'deleteCard removes the D1 card row directly');
ok(!entry.includes("action === 'deleteCard') return await legacyWorker"), 'deleteCard is not intentionally routed to legacy GAS');

if (!process.exitCode) console.log('\nD1 delete-card contract passed.');
