const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');

function readIndex() {
  return fs.readFileSync(indexPath, 'utf8');
}

function normalizeResource(resource) {
  return String(resource || '').replace(/^\.\//, '').replace(/\\/g, '/');
}

function collectScriptVersions(html = readIndex()) {
  const versions = new Map();
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = scriptRe.exec(html))) {
    const src = match[1];
    const [resource, query = ''] = src.split('?');
    if (!query) continue;
    const params = new URLSearchParams(query);
    const version = params.get('v');
    const key = normalizeResource(resource);
    if (!versions.has(key)) versions.set(key, []);
    versions.get(key).push({ src, version });
  }
  return versions;
}

function assertCacheBust(resource, options = {}) {
  const key = normalizeResource(resource);
  const versions = collectScriptVersions(options.html);
  const entries = versions.get(key) || [];
  if (!entries.length) throw new Error(`${key} must be referenced with a cache-bust query`);
  const values = new Set();
  for (const entry of entries) {
    if (!entry.version) throw new Error(`${key} cache-bust value must be non-empty`);
    if (!/^\d+(?:\.\d+)*$/.test(entry.version)) throw new Error(`${key} cache-bust value must be numeric dotted version`);
    if (/undefined|null|\$\{|<%|%>/.test(entry.src)) throw new Error(`${key} cache-bust query contains placeholder value`);
    values.add(entry.version);
  }
  if (values.size !== 1) throw new Error(`${key} must not be referenced with multiple cache-bust versions`);
  const filePath = path.join(root, key);
  if (!fs.existsSync(filePath)) throw new Error(`${key} referenced file must exist`);
  return [...values][0];
}

function assertMany(resources) {
  for (const resource of resources) assertCacheBust(resource);
}

if (require.main === module) {
  assertMany([
    'js/core.js',
    'js/auth.js',
    'js/modules/mycard.js',
    'js/modules/cropper.js',
    'js/modules/home.js',
    'js/modules/inbox.js'
  ]);
  console.log('Cache-bust contract passed.');
}

module.exports = { assertCacheBust, assertMany, collectScriptVersions };
