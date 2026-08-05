(function (root) {
  'use strict';

  function taipeiDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now).reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function addDays(dateText, days) {
    const date = new Date(`${dateText}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function weekStart(dateText) {
    const date = new Date(`${dateText}T00:00:00Z`);
    return addDays(dateText, -((date.getUTCDay() + 6) % 7));
  }

  function taskDate(task, today) {
    const recurrence = String(task?.recurrenceType || 'none');
    if (recurrence === 'daily') return today;
    if (recurrence === 'weekly') return String(task?.scheduledFor || task?.startTime || '').slice(0, 10);
    return String(task?.startTime || '').slice(0, 10);
  }

  function isDone(task) {
    const recurring = ['daily', 'weekly'].includes(String(task?.recurrenceType || ''));
    return recurring ? task?.currentOccurrenceDone === true : String(task?.status || '') === 'done';
  }

  function bucket(tasks, now = new Date()) {
    const today = taipeiDate(now);
    const monday = weekStart(today);
    const sunday = addDays(monday, 6);
    const result = { today: [], week: [], todayDate: today, weekStart: monday, weekEnd: sunday };
    for (const task of Array.isArray(tasks) ? tasks : []) {
      const date = taskDate(task, today);
      if (!date) continue;
      const normalized = { ...task, homeDone: isDone(task), homeScheduledDate: date };
      if (date === today || String(task.recurrenceType || '') === 'daily') result.today.push(normalized);
      else if (date >= monday && date <= sunday) result.week.push(normalized);
    }
    return result;
  }

  root.HomeTaskBuckets = Object.freeze({ taipeiDate, weekStart, taskDate, isDone, bucket });
})(typeof window !== 'undefined' ? window : globalThis);
