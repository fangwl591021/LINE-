const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

ok(worker.includes('async identityIdsForUser(env, userId)'), 'identity alias helper exists');
ok(worker.includes('legacy_line_id IN') && worker.includes('point_line_id IN'), 'alias helper expands legacy and point ids');
ok(worker.includes('async cardByIdentity(env, userId'), 'shared card lookup by identity exists');
ok(worker.includes('owner_user_id IN') && worker.includes('profile_user_id IN'), 'card lookup covers owner and profile ids');
ok(worker.includes('D1ReadModule.cardByIdentity(env, customerPointUserId)'), 'point customer lookup uses identity-aware card lookup');
ok(worker.includes('D1ReadModule.cardByIdentity(env, senderId)'), 'inbox sender lookup uses identity-aware card lookup');
ok(worker.includes('D1ReadModule.cardByIdentity(env, canonicalId)'), 'inbox receiver lookup uses identity-aware card lookup');
ok(worker.includes("sourceType: 'self_profile'"), 'referral placeholder check avoids duplicate self cards across identities');

console.log('\nIdentity bridge contract passed.');
