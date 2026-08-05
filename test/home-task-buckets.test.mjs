import assert from 'node:assert/strict';
import '../js/modules/home-task-buckets.mjs';

const { bucket, taipeiDate, weekStart } = globalThis.HomeTaskBuckets;
const now = new Date('2026-08-05T04:00:00.000Z'); // Wednesday noon in Taipei.

assert.equal(taipeiDate(now), '2026-08-05');
assert.equal(weekStart('2026-08-05'), '2026-08-03');

const result = bucket([
  { taskId: 'today-once', recurrenceType: 'none', startTime: '2026-08-05T14:00', status: 'pending' },
  { taskId: 'today-done', recurrenceType: 'none', startTime: '2026-08-05T09:00', status: 'done' },
  { taskId: 'daily', recurrenceType: 'daily', startTime: '2026-07-01T08:00', currentOccurrenceDone: false },
  { taskId: 'weekly', recurrenceType: 'weekly', startTime: '2026-07-31T10:00', scheduledFor: '2026-08-07', currentOccurrenceDone: false },
  { taskId: 'week-once', recurrenceType: 'none', startTime: '2026-08-09T16:00', status: 'pending' },
  { taskId: 'next-week', recurrenceType: 'none', startTime: '2026-08-10T09:00', status: 'pending' },
  { taskId: 'no-date', recurrenceType: 'none', startTime: '', status: 'pending' }
], now);

assert.deepEqual(result.today.map(task => task.taskId), ['today-once', 'today-done', 'daily']);
assert.deepEqual(result.week.map(task => task.taskId), ['weekly', 'week-once']);
assert.equal(result.today.find(task => task.taskId === 'today-done').homeDone, true);
assert.equal(result.today.filter(task => !task.homeDone).length, 2);
assert.equal(result.week.filter(task => !task.homeDone).length, 2);

console.log('Home agenda counter bucket tests passed.');
