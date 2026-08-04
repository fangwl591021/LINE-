const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(
  root,
  'migrations',
  '0015_personal_task_recurrence.sql'
);

function fail(message) {
  console.error(`Personal task recurrence schema contract failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(migrationPath)) {
  fail('0015 personal task recurrence migration must exist');
}

const sql = fs.readFileSync(migrationPath, 'utf8');

function expect(pattern, message) {
  if (!pattern.test(sql)) {
    fail(message);
  }
}

expect(
  /ALTER\s+TABLE\s+personal_tasks\s+ADD\s+COLUMN\s+recurrence_type\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'none'\s+CHECK\s*\(\s*recurrence_type\s+IN\s*\(\s*'none'\s*,\s*'daily'\s*,\s*'weekly'\s*\)\s*\)\s*;/i,
  'personal_tasks must restrict recurrence_type to none, daily, and weekly'
);

expect(
  /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+personal_task_occurrences\s*\(/i,
  'personal_task_occurrences table must exist'
);

const requiredColumns = [
  [/\boccurrence_id\s+TEXT\s+PRIMARY\s+KEY\b/i, 'occurrence_id'],
  [/\btask_id\s+TEXT\s+NOT\s+NULL\b/i, 'task_id'],
  [/\buser_id\s+TEXT\s+NOT\s+NULL\b/i, 'user_id'],
  [/\boccurrence_key\s+TEXT\s+NOT\s+NULL\b/i, 'occurrence_key'],
  [/\bscheduled_for\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+''/i, 'scheduled_for'],
  [/\bstatus\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'done'/i, 'status'],
  [/\bcompleted_at\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+''/i, 'completed_at'],
  [/\bcreated_at\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP\b/i, 'created_at']
];

for (const [pattern, column] of requiredColumns) {
  expect(pattern, `personal_task_occurrences must define ${column}`);
}

expect(
  /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_personal_task_occurrences_task_key\s+ON\s+personal_task_occurrences\s*\(\s*task_id\s*,\s*occurrence_key\s*\)\s*;/i,
  'task_id and occurrence_key must have an idempotency index'
);

expect(
  /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_personal_task_occurrences_user_schedule\s+ON\s+personal_task_occurrences\s*\(\s*user_id\s*,\s*scheduled_for\s*\)\s*;/i,
  'user_id and scheduled_for must have a query index'
);

if (/\bmonthly\b/i.test(sql)) {
  fail('V1 must not include monthly recurrence');
}

console.log('Personal task recurrence schema contract passed.');
