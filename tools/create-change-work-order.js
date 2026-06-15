const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const templatePath = path.join(root, 'docs', 'release', 'change-work-order-template.md');
const outputDir = path.join(root, 'docs', 'release', 'work-orders');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function today() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (error) {
    return 'UNKNOWN';
  }
}

function sanitizeSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const rawSlug = process.argv[2];
const rawTitle = process.argv.slice(3).join(' ').trim();

if (!rawSlug) {
  fail('Usage: node tools/create-change-work-order.js <slug> [title]');
}

const slug = sanitizeSlug(rawSlug);
if (!slug) {
  fail('Work order slug is empty after sanitizing.');
}

if (!fs.existsSync(templatePath)) {
  fail(`Missing template: ${path.relative(root, templatePath)}`);
}

fs.mkdirSync(outputDir, { recursive: true });

const date = today();
const commit = currentCommit();
const title = rawTitle || rawSlug;
const outputPath = path.join(outputDir, `${date}-${slug}.md`);

if (fs.existsSync(outputPath)) {
  fail(`Work order already exists: ${path.relative(root, outputPath)}`);
}

let content = fs.readFileSync(templatePath, 'utf8');
content = content
  .replace('| 日期 |  |', `| 日期 | ${date} |`)
  .replace('| 需求來源 |  |', '| 需求來源 |  |')
  .replace('| 目標功能 |  |', `| 目標功能 | ${title} |`)
  .replace('| 起始 commit |  |', `| 起始 commit | ${commit} |`);

content = `# ${title}\n\n` + content;

fs.writeFileSync(outputPath, content, 'utf8');

console.log(`Created ${path.relative(root, outputPath)}`);
console.log(`Start commit: ${commit}`);
console.log('Next: fill sections 2, 3, 6, then run npm run guard:before.');
