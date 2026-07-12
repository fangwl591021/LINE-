const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
let failures = 0;

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    failures += 1;
    return;
  }
  console.log(`OK ${message}`);
}

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(path.join(root, htmlFile), 'utf8');
  const localScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((src) => !/^(?:https?:)?\/\//i.test(src));
  const versions = new Map();

  for (const src of localScripts) {
    const [resource, query = ''] = src.split('?', 2);
    const params = new URLSearchParams(query);
    const version = params.get('v');
    const resourcePath = path.resolve(root, resource.replace(/^\//, ''));

    ok(fs.existsSync(resourcePath), `${htmlFile}: referenced script exists: ${resource}`);
    ok(version !== null && version.trim() !== '', `${htmlFile}: ${resource} has a non-empty v query`);
    ok(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version || ''), `${htmlFile}: ${resource} has a valid v query format`);
    ok(!/(?:undefined|null|\{\{|\}\}|\$\{|<%|%>)/i.test(version || ''), `${htmlFile}: ${resource} v query contains no placeholder`);

    if (!versions.has(resource)) versions.set(resource, version);
    else ok(versions.get(resource) === version, `${htmlFile}: ${resource} is not referenced with conflicting versions`);
  }
}

if (failures) process.exit(1);
console.log('\nCache-bust contract passed.');