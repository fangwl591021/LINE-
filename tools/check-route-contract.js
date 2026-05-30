const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const exportIndex = worker.indexOf('export default');
const routeSource = exportIndex >= 0 ? worker.slice(exportIndex) : worker;

function indexOfOrFail(pattern, name) {
  const match = routeSource.match(pattern);
  if (!match) {
    console.error(`Route contract failed: ${name} not found`);
    process.exit(1);
  }
  return match.index;
}

const checks = [
  {
    name: 'LINE OA webhook keeps both historical paths',
    pass: /url\.pathname === '\/webhook\/line' \|\| url\.pathname === '\/line-webhook'/.test(worker)
  },
  {
    name: 'LINE OA webhook still uses LineOAChatModule.handleWebhook',
    pass: /LineOAChatModule\.handleWebhook\(request,\s*env,\s*ctx/.test(worker)
  },
  {
    name: 'third-party point webhook keeps separate paths',
    pass: /url\.pathname === '\/point-webhook' \|\| url\.pathname === '\/webhook\/points'/.test(worker)
  },
  {
    name: 'third-party point webhook does not replace LINE webhook handler',
    pass: /ThirdPointWebhookModule\.handle\(request,\s*env\)/.test(worker)
  },
  {
    name: 'payment notify route remains explicit',
    pass: /url\.pathname === '\/newebpay\/notify'/.test(worker) && /PaymentModule\.handleNewebpayNotify/.test(worker)
  },
  {
    name: 'generic POST dispatch remains after explicit webhook routes',
    pass: /if \(request\.method !== 'POST'\)[\s\S]*dispatchAction\(body\.action,\s*body\.payload/.test(worker)
  }
];

const routeOrder = [
  {
    before: /url\.pathname === '\/point-webhook' \|\| url\.pathname === '\/webhook\/points'/,
    after: /if \(request\.method !== 'POST'\)/,
    name: 'point webhook must run before generic API dispatch'
  },
  {
    before: /url\.pathname === '\/webhook\/line' \|\| url\.pathname === '\/line-webhook'/,
    after: /if \(request\.method !== 'POST'\)/,
    name: 'LINE webhook must run before generic API dispatch'
  },
  {
    before: /url\.pathname === '\/newebpay\/notify'/,
    after: /if \(request\.method !== 'POST'\)/,
    name: 'payment notify must run before generic API dispatch'
  }
];

for (const rule of routeOrder) {
  const beforeIndex = indexOfOrFail(rule.before, rule.name + ' before');
  const afterIndex = indexOfOrFail(rule.after, rule.name + ' after');
  checks.push({ name: rule.name, pass: beforeIndex < afterIndex });
}

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'OK' : 'FAIL'} ${check.name}`);
}

if (failed.length) {
  console.error('\nRoute contract failed. Do not deploy until this is fixed.');
  process.exit(1);
}

console.log('\nRoute contract passed.');
