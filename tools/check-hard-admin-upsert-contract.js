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

ok(worker.includes('hasHardAdminId(userId, user = {})'), 'hard admin id-only detector exists');
ok(worker.includes('const existingHardAdminId = SecurityModule.hasHardAdminId(user.line_id, existing);'), 'upsertUser checks hard admin id on existing row');
ok(worker.includes('const incomingHardAdminVerified = SecurityModule.isHardAdmin(user.line_id'), 'upsertUser requires verified incoming hard admin identity');
ok(worker.includes("if (existingHardAdminId && !incomingHardAdminVerified)"), 'upsertUser blocks unverified hard admin profile overwrite');
ok(worker.includes("['name','industry','gender','phone','birthday','region','address','socials','store_id','tg_token','tg_chat_id'].forEach(key => {\n          user[key] = existing[key] || '';"), 'upsertUser preserves hard admin personal fields');

console.log('\nHard admin upsert contract passed.');
