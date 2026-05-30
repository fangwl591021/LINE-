const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const identity = args.find(arg => !arg.startsWith('--'));
const remote = !args.includes('--local');
const database = readOption('--db') || 'actmaster_db';
const jsonOnly = args.includes('--json');

function readOption(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function fail(message, detail) {
  console.error(message);
  if (detail) console.error(detail);
  process.exit(1);
}

function sqlText(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function inList(values) {
  const unique = [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  return unique.length ? unique.map(sqlText).join(',') : "''";
}

function runSql(sql) {
  let wrangler = process.platform === 'win32' ? 'powershell.exe' : 'npx';
  const commandArgs = ['wrangler', 'd1', 'execute', database];
  if (remote) commandArgs.push('--remote');
  commandArgs.push('--json', '--command', sql);
  let spawnArgs = commandArgs;
  if (process.platform === 'win32') {
    const psQuote = value => `'${String(value).replace(/'/g, "''")}'`;
    const command = [
      'npx.cmd',
      'wrangler',
      'd1',
      'execute',
      database,
      remote ? '--remote' : '',
      '--json',
      '--command',
      psQuote(sql)
    ].filter(Boolean).join(' ');
    spawnArgs = ['-NoProfile', '-Command', command];
  }
  const result = spawnSync(wrangler, spawnArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false
  });
  if (result.error) fail('Failed to run wrangler d1 execute.', result.error.message);
  if (result.status !== 0) fail('wrangler d1 execute failed.', result.stderr || result.stdout);

  const text = String(result.stdout || '').trim();
  const jsonStart = text.indexOf('[');
  const payload = JSON.parse(jsonStart >= 0 ? text.slice(jsonStart) : text);
  const first = Array.isArray(payload) ? payload[0] : payload;
  if (!first || first.success === false) fail('D1 query failed.', JSON.stringify(payload, null, 2));
  return first.results || [];
}

function safeRunSql(sql, fallback = []) {
  try {
    return runSql(sql);
  } catch (err) {
    return fallback;
  }
}

function collectAliases(users) {
  const aliases = new Set([identity]);
  for (const user of users) {
    [
      user.row_id,
      user.line_id,
      user.legacy_line_id,
      user.point_line_id
    ].forEach(value => {
      const text = String(value || '').trim();
      if (text) aliases.add(text);
    });
  }
  return [...aliases];
}

if (!identity) {
  fail([
    'Usage:',
    '  node tools/diagnose-identity.js <LINE_UID_OR_POINT_UID>',
    '',
    'Options:',
    '  --local          Query local D1 instead of remote',
    '  --db <name>      D1 database name, default actmaster_db',
    '  --json           Print JSON only'
  ].join('\n'));
}

const id = sqlText(identity);
const users = runSql(`
  SELECT row_id,line_id,name,phone,role,store_id,referrer_id,network_id,
         legacy_line_id,point_line_id,identity_source,migrated_at
  FROM users
  WHERE line_id = ${id}
     OR row_id = ${id}
     OR legacy_line_id = ${id}
     OR point_line_id = ${id}
     OR referrer_id = ${id}
  LIMIT 50
`);

const aliases = collectAliases(users);
const ids = inList(aliases);

const cards = runSql(`
  SELECT row_id,line_id,profile_user_id,owner_user_id,creator_id,name,company_name,title,mobile,
         source_type,visibility,pool_eligible,crm_status,network_id,created_at,updated_at
  FROM card_contacts
  WHERE line_id IN (${ids})
     OR profile_user_id IN (${ids})
     OR owner_user_id IN (${ids})
     OR creator_id IN (${ids})
  ORDER BY updated_at DESC, created_at DESC
  LIMIT 50
`);

const awards = safeRunSql(`
  SELECT award_id,user_id,card_id,award_type,points,point_type,status,created_at,updated_at
  FROM point_awards
  WHERE user_id IN (${ids})
  ORDER BY created_at DESC
  LIMIT 30
`);

const inbox = safeRunSql(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN read_at = '' OR read_at IS NULL THEN 1 ELSE 0 END) AS unread,
    SUM(CASE WHEN receiver_user_id IN (${ids}) THEN 1 ELSE 0 END) AS received,
    SUM(CASE WHEN sender_user_id IN (${ids}) THEN 1 ELSE 0 END) AS sent
  FROM inbox_items
  WHERE receiver_user_id IN (${ids})
     OR sender_user_id IN (${ids})
`);

const tasks = safeRunSql(`
  SELECT task_id,user_id,title,task_type,due_at,status,created_at,updated_at
  FROM personal_tasks
  WHERE user_id IN (${ids})
  ORDER BY due_at ASC, created_at DESC
  LIMIT 30
`);

const report = {
  identity,
  remote,
  database,
  aliases,
  users,
  cards,
  pointAwards: awards,
  inboxSummary: inbox,
  tasks,
  warnings: []
};

if (users.length > 1) report.warnings.push('Multiple user rows match this identity. Check account merge mapping.');
if (users.some(user => user.point_line_id && user.line_id && user.point_line_id !== user.line_id)) {
  report.warnings.push('point_line_id differs from line_id. Point writes should use point_line_id.');
}
if (cards.some(card => card.source_type !== 'self_profile' && aliases.includes(String(card.line_id || '').trim()))) {
  report.warnings.push('A non-self card is bound to this identity. Check scanned CRM card vs personal card ownership.');
}

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Identity diagnostic: ${identity}`);
  console.log(`Database: ${database}${remote ? ' remote' : ' local'}`);
  console.log(`Aliases: ${aliases.join(', ') || '(none)'}`);
  console.log(`Users: ${users.length}`);
  console.table(users);
  console.log(`Cards: ${cards.length}`);
  console.table(cards);
  console.log(`Point awards: ${awards.length}`);
  console.table(awards);
  console.log('Inbox summary:');
  console.table(inbox);
  console.log(`Tasks: ${tasks.length}`);
  console.table(tasks);
  if (report.warnings.length) {
    console.log('Warnings:');
    for (const warning of report.warnings) console.log(`- ${warning}`);
  }
}
