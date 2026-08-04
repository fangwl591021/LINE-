const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const start = worker.indexOf('const D1PersonalTaskModule = {');
const end = worker.indexOf('\nconst D1PersonalAssistantCoreModule = {', start);

function fail(message) {
  console.error(`Personal task recurrence worker contract failed: ${message}`);
  process.exit(1);
}

if (start < 0 || end < 0) {
  fail('D1PersonalTaskModule must remain available');
}

const source = worker.slice(start, end);

function expect(pattern, message) {
  if (!pattern.test(source)) {
    fail(message);
  }
}

expect(/recurrenceType:\s*this\.text\(row\.recurrence_type,\s*'none'\)/, 'task rows must expose recurrenceType');
expect(/\['none',\s*'daily',\s*'weekly'\]\.includes\(recurrenceType\)/, 'save must allow only V1 recurrence types');
expect(/timeZone:\s*'Asia\/Taipei'/, 'occurrence dates must use Asia/Taipei');
expect(/occurrenceKey:\s*`D:\$\{date\}`/, 'daily occurrences must use a date key');
expect(/occurrenceKey:\s*`W:\$\{monday\}`/, 'weekly occurrences must use a Monday week key');
expect(/currentOccurrenceDone:\s*Boolean\(completedAt\)/, 'list must expose current occurrence completion');
expect(/ON\s+CONFLICT\(task_id,\s*occurrence_key\)\s+DO\s+NOTHING/i, 'recurring completion must be idempotent');
expect(/SET\s+status\s*=\s*'pending',\s*completed_at\s*=\s*''/i, 'recurring completion must keep the master pending');
expect(/WHERE\s+task_id\s*=\s*\?\s+AND\s+user_id\s*=\s*\?/i, 'task writes must remain owner scoped');

if (/\bmonthly\b/i.test(source)) {
  fail('V1 must not implement monthly recurrence');
}

console.log('Personal task recurrence worker contract passed.');
