const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK ${message}`);
}

const packageJson = JSON.parse(read('package.json'));
const runner = read('tools/run-smoke-contracts.js');
const script = read('tools/create-change-work-order.js');
const template = read('docs/release/change-work-order-template.md');
const protocol = read('docs/release/feature-change-protocol.md');
const readme = read('docs/README.md');

ok(packageJson.scripts && packageJson.scripts['workorder:new'] === 'node tools/create-change-work-order.js', 'npm script creates work orders');
ok(runner.includes('tools/check-change-work-order-contract.js'), 'work order contract is included in full guard');
ok(script.includes('change-work-order-template.md'), 'work order tool uses the template');
ok(script.includes('git') && script.includes('rev-parse') && script.includes('--short'), 'work order tool records current commit');
ok(script.includes('docs') && script.includes('release') && script.includes('work-orders'), 'work order tool writes under release work-orders');
ok(script.includes('fs.existsSync(outputPath)') && script.includes('Work order already exists'), 'work order tool refuses overwrite');
ok(template.includes('本次只允許改什麼'), 'template requires explicit allowed scope');
ok(template.includes('本次禁止碰什麼'), 'template requires explicit forbidden scope');
ok(template.includes('npm run guard:before'), 'template requires guard before');
ok(template.includes('npm run guard:after'), 'template requires guard after');
ok(protocol.includes('docs/release/change-work-order-template.md'), 'protocol references work order template');
ok(readme.includes('docs/release/change-work-order-template.md'), 'README references work order template');

if (process.exitCode) {
  console.error('\nChange work order contract failed.');
  process.exit(process.exitCode);
}

console.log('\nChange work order contract passed.');
