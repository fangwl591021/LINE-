const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('migrations/0018_card_fate_tag_queue.sql');
const entry = read('worker-entry.mjs');
const worker = read('workerbackup.js');
const moduleSource = read('worker/card-fate-tag-analysis.mjs');
const cards = read('js/modules/cards.js');
const cropper = read('js/modules/cropper.js');

assert(migration.includes('CREATE TABLE IF NOT EXISTS card_fate_tag_jobs'));
assert(migration.includes('INSERT OR IGNORE INTO card_fate_tag_jobs'));
assert(migration.includes("fate_analysis_status = 'queued'"));
assert(worker.includes('async upsertCard(payload, env)'));
assert(worker.includes('CardFateTagAnalysisModule.enqueueCard(card.row_id, env)'));
assert(entry.includes('CardFateTagAnalysisModule.processOffPeak'));
assert(entry.includes('let postBody = null'));
assert.equal((entry.match(/request\.clone\(\)/g) || []).length, 1);
assert(moduleSource.includes('max_jobs_per_run'));
assert(moduleSource.includes('max_jobs_per_day'));
assert(moduleSource.includes('max_attempts'));
assert(moduleSource.includes("fate_analysis_status='completed'"));
assert(!cropper.includes('calculateFateTags'));
assert(cards.includes('已排入 AI 分析，將於離峰時段自動完成。'));

console.log('Card fate tag queue, off-peak execution, and UI status contract passed.');
