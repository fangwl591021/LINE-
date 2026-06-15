const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mapPath = path.join(root, 'docs', 'contracts', 'change-risk-map.json');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadMap() {
  if (!fs.existsSync(mapPath)) {
    fail(`Missing ${path.relative(root, mapPath)}`);
  }
  return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

const query = normalize(process.argv.slice(2).join(' '));
const map = loadMap();
const areas = map.areas || {};

if (!query || query === '--list') {
  console.log('Known change areas:');
  for (const [key, area] of Object.entries(areas)) {
    console.log(`- ${key}: ${area.label}`);
  }
  console.log('\nUsage: npm run scope:lookup -- <area-or-keyword>');
  process.exit(0);
}

const matches = Object.entries(areas).filter(([key, area]) => {
  const haystack = [
    key,
    area.label,
    ...(area.keywords || [])
  ].map(normalize);
  return haystack.some(item => item.includes(query) || query.includes(item));
});

if (!matches.length) {
  fail(`No change scope found for: ${query}`);
}

for (const [key, area] of matches) {
  console.log(`\n[${key}] ${area.label}`);
  console.log('\nDocs to read:');
  for (const doc of area.docs || []) console.log(`- ${doc}`);
  console.log('\nContract checks:');
  for (const check of area.checks || []) console.log(`- ${check}`);
  console.log('\nRegression IDs:');
  console.log((area.regressionIds || []).join(', ') || '(none)');
}
