const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs', 'contracts', 'button-actions.md'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

ok(contract.includes('tel:<phone>') && contract.includes('mailto:<email>') && contract.includes('https://'), 'button contract documents tel/mailto/http normalization');

ok(worker.includes('normalizeActionUri'), 'worker action URI normalizer exists');
ok(worker.includes("if (/^(https?|tel|mailto|line):/i.test(value)) return value;"), 'worker preserves safe schemes');
ok(worker.includes("return 'mailto:' + value"), 'worker auto-adds mailto for email');
ok(worker.includes("return 'tel:' + compactPhone"), 'worker auto-adds tel for phone');
ok(worker.includes('normalizePhoneForTel') && worker.includes('886') && worker.includes('86'), 'worker normalizes Taiwan and international phone prefixes');
ok(worker.includes('Utils.cleanURI(value)') && worker.includes("if (!uri.match(/^(http|https|tel|mailto|line):/i)) return 'https://' + uri;"), 'worker normalizes action button URL scheme through cleanURI');

ok(auth.includes('cardButtonUrlForWeb') || auth.includes('normalizeCardActionUri'), 'frontend action URI normalizer exists');
ok(auth.includes("return 'tel:' + value.replace") || worker.includes("return 'tel:' + compactPhone"), 'frontend/runtime auto-adds tel for phone');
ok(auth.includes('mailto:') || worker.includes("return 'mailto:' + value"), 'email action scheme exists in runtime');
ok(auth.includes('buildFlexForCardLink') && auth.includes('buildLocalECardFlexMessage'), 'push/share card uses shared button data builder path');

console.log('\nButton actions contract passed.');
