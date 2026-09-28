const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');
const timeModule = fs.readFileSync(path.join(root, 'worker', 'personal-agenda-time.mjs'), 'utf8');

function fail(message) {
  console.error(`Personal agenda voice contract failed: ${message}`);
  process.exit(1);
}
function expect(source, pattern, message) {
  if (!pattern.test(source)) fail(message);
}

expect(worker, /parsePersonalTaskVoice:\s*\{\s*access:\s*'authenticated',\s*ownership:\s*'self'\s*\}/, 'voice action must require an authenticated self actor');
expect(worker, /case 'parsePersonalTaskVoice':\s*return await D1PersonalTaskModule\.parseVoiceDraft\(payload \|\| \{\}, env\);/, 'voice action must dispatch to the draft parser');
expect(worker, /durationMs > 15000/, 'voice input must be limited to 15 seconds');
expect(worker, /bytes\.byteLength > 1500000/, 'voice input must be limited to 1.5MB');
const voiceMethod = worker.match(/async parseVoiceDraft\(payload, env\) \{([\s\S]*?)\r?\n  \},\r?\n  async setStatus/);
if (!voiceMethod) fail('voice draft method must exist');
if (/\.save\(|INSERT INTO personal_tasks|UPDATE personal_tasks/.test(voiceMethod[1])) fail('voice draft parsing must not write personal tasks');
expect(home, /personal-agenda-calendar-grid/, 'agenda must provide a monthly calendar grid');
expect(home, /agenda-end/, 'agenda must provide an end time field');
expect(home, /MediaRecorder/, 'agenda must support recorded voice input');
expect(home, /fetchAPI\('parsePersonalTaskVoice'/, 'agenda must request server-side voice drafting');
expect(home, /AI 已整理草稿/, 'agenda must require user confirmation of the generated draft');
expect(home, /'agenda-start': proposal\.startTime \|\| ''/, 'empty AI start time must clear the prefilled form value');
expect(home, /'agenda-end': proposal\.endTime \|\| ''/, 'empty AI end time must clear the prefilled form value');
expect(home, /personalAgendaVoiceDraft = \{/, 'voice draft confirmation state must be tracked');
expect(home, /AI 尚未確認日期或時間，請補充後再儲存/, 'voice draft without a start time must be blocked');
expect(home, /\['agenda-title', 'agenda-start', 'agenda-end', 'agenda-related', 'agenda-location', 'agenda-notes'\]/, 'saved agenda form must clear time and location fields');
expect(home, /if \(!calendarUrl\) return window\.showToast\('請先設定行程日期與時間'/, 'Google Calendar export must reject a missing or invalid start time');
expect(worker, /inputSource === 'voice' && !startTime/, 'server must reject voice saves without a confirmed start time');
expect(worker, /normalizeTaipeiDateTime\(clean\(value\)\)/, 'AI dates must use the tested Taipei normalizer');
expect(timeModule, /timeZone: 'Asia\/Taipei'/, 'timezone-bearing AI dates must normalize to Asia Taipei');
expect(worker, /location: clean\(parsed\.location\)/, 'voice proposal must preserve a distinct location field');
expect(core, /'parsePersonalTaskVoice'/, 'voice action must receive the extended request timeout');

// Every status shares the same blue panel, including errors and retries.
expect(home, /id="agenda-voice-status" class="text-\[11px\] text-white mt-0\.5"/, 'initial voice hint must be white');
const statusStart = home.indexOf('function setAgendaVoiceStatus_(');
const statusEnd = home.indexOf('function applyPersonalAgendaVoiceDraft_(', statusStart);
if (statusStart < 0 || statusEnd < statusStart) fail('voice status renderer must exist');
const statusNode = { textContent: '', className: '' };
const context = vm.createContext({ document: { getElementById: id => id === 'agenda-voice-status' ? statusNode : null } });
vm.runInContext(home.slice(statusStart, statusEnd), context);
for (const [message, isError] of [
  ['錄音中，請在 15 秒內說完。', false], ['AI 正在整理語音內容...', false],
  ['AI 已整理草稿，請確認內容後再儲存。', false], ['語音辨識失敗，請改用文字建立。', true],
  ['請開始說出日期、時間與行程。', false]
]) {
  context.setAgendaVoiceStatus_(message, isError);
  if (statusNode.textContent !== message) fail('voice status must retain its original message');
  if (statusNode.className !== 'text-[11px] text-white mt-0.5') fail('all voice states must keep white text without error backgrounds');
}
console.log('Personal agenda voice contract passed.');
