const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');

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
expect(core, /'parsePersonalTaskVoice'/, 'voice action must receive the extended request timeout');
console.log('Personal agenda voice contract passed.');
