const fs = require('fs');
const path = require('path');
const { assertCacheBust } = require('./check-cache-bust-contract');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8');

function fail(message) {
  console.error(`Home recurring task panel contract failed: ${message}`);
  process.exit(1);
}

const panelIndex = html.indexOf('id="home-recurring-task-panel"');
const aiIndex = html.indexOf('<section class="home-lower-panel mx-0 mt-5');
if (panelIndex < 0 || aiIndex < 0 || panelIndex > aiIndex) {
  fail('recurring task panel must appear before AI services');
}

for (const id of [
  'home-recurring-task-toggle',
  'home-recurring-task-content',
  'home-daily-task-count',
  'home-weekly-task-count',
  'home-daily-task-list',
  'home-weekly-task-list'
]) {
  if (!html.includes(`id="${id}"`)) fail(`${id} must exist`);
}

if (!html.includes('aria-expanded="false"') || !html.includes('class="hidden border-t border-slate-100"')) {
  fail('panel must be collapsible and initially closed');
}

for (const marker of [
  'window.toggleHomeRecurringTaskPanel = function',
  'window.loadHomeRecurringTasks = async function',
  'window.renderHomeRecurringTasks = function',
  "window.fetchAPI('listPersonalTasks'",
  "window.fetchAPI('completePersonalTask'",
  "['daily', 'weekly'].includes",
  "recurrenceType: document.getElementById('agenda-recurrence')?.value || 'none'",
  "runHomeBackgroundTask_('home-recurring-tasks'"
]) {
  if (!home.includes(marker)) fail(`home module must include ${marker}`);
}

if (!home.includes('tasks.slice(0, limit)') ||
    !home.includes("'home-daily-task-list', daily, daily.length ? '今日待辦已完成' : '尚未設定每日待辦', 3") ||
    !home.includes("'home-weekly-task-list', weekly, weekly.length ? '本週待辦已完成' : '尚未設定每週待辦', 2")) {
  fail('home panel must cap previews to three daily and two weekly tasks');
}

if (!home.includes('id="agenda-recurrence"')) {
  fail('agenda form must offer recurrence selection');
}

if (/value="monthly"|recurrenceType\s*===\s*['"]monthly['"]/i.test(home)) {
  fail('V1 must not expose monthly recurrence');
}

try {
  assertCacheBust('js/modules/home.js');
} catch (error) {
  fail(error.message);
}

console.log('Home recurring task panel contract passed.');
