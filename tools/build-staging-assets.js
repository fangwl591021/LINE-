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
let config = fs.readFileSync(configPath, 'utf8');
const productionLine = 'const WORKER_URL = "https://line-engine.fangwl591021.workers.dev/";';
const stagingLine = 'const WORKER_URL = window.location.origin + "/api";';
const productionLiffLine = 'const DEFAULT_LIFF_ID = "1660923784-vViMTZ1y";';
const stagingLiffLine = 'const DEFAULT_LIFF_ID = "1660923784-YgP3TNDr";';

for (const expected of [productionLine, productionLiffLine]) {
  if (!config.includes(expected)) {
    throw new Error(`Staging build stopped: expected config declaration was not found: ${expected}`);
  }
}

config = config
  .replace(productionLine, stagingLine)
  .replace(productionLiffLine, stagingLiffLine);
fs.writeFileSync(configPath, config);

const forbidden = ['wrangler.toml', 'workerbackup.js', 'migrations', 'tools', 'docs'];
for (const entry of forbidden) {
  if (fs.existsSync(path.join(output, entry))) {
    throw new Error(`Staging build stopped: forbidden public entry found: ${entry}`);
  }
}

console.log(`Staging assets ready: ${output}`);
