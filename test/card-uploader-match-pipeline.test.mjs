import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'worker-entry.mjs'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/0028_card_uploader_match_queue.sql'), 'utf8');

assert.match(worker, /CardFateTagAnalysisModule\.enqueueCard\(card\.row_id, env\)/);
assert.match(worker, /CardUploaderMatchModule\.enqueueCard\(card\.row_id, env\)/);
assert.match(worker, /export async function runAutomatedUploaderMatch/);
assert.match(worker, /waitingForIntent: true/);
assert.match(entry, /CardFateTagAnalysisModule\.processOffPeak[\s\S]*CardUploaderMatchModule\.process/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS card_uploader_match_jobs/);
assert.doesNotMatch(migration, /INSERT\s+INTO\s+card_uploader_match_jobs/i);

console.log('Card uploader match pipeline contract passed.');
