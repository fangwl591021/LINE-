const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.staging-assets');
const files = ['index.html', 'manifest.webmanifest', 'sw.js'];
const directories = ['assets', 'css', 'data', 'js'];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

for (const directory of directories) {
  fs.cpSync(path.join(root, directory), path.join(output, directory), { recursive: true });
}

const configPath = path.join(output, 'js', 'config.js');
const config = fs.readFileSync(configPath, 'utf8');
const productionLine = 'const WORKER_URL = "https://line-engine.fangwl591021.workers.dev/";';
const stagingLine = 'const WORKER_URL = window.location.origin + "/api";';

if (!config.includes(productionLine)) {
  throw new Error('Staging build stopped: expected WORKER_URL declaration was not found.');
}

fs.writeFileSync(configPath, config.replace(productionLine, stagingLine));

const forbidden = ['wrangler.toml', 'workerbackup.js', 'migrations', 'tools', 'docs'];
for (const entry of forbidden) {
  if (fs.existsSync(path.join(output, entry))) {
    throw new Error(`Staging build stopped: forbidden public entry found: ${entry}`);
  }
}

console.log(`Staging assets ready: ${output}`);
