const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const cards = fs.readFileSync(path.join(root, 'js', 'modules', 'cards.js'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs', 'contracts', 'card-resolvers.md'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

ok(worker.includes('async getCardHarvestContacts(payload, env)'), 'collection resolver exists');
ok(worker.includes("AND LOWER(COALESCE(source_type,'')) <> 'referral_placeholder'"), 'collection resolver still excludes referral placeholders');
ok(worker.includes("AND scanner_user_id IN (${placeholders})"), 'claimed self profile stays scoped to the original scanner');
ok(worker.includes('async isClaimedCollectionReadOnlyForActor(env, card, actorId)'), 'server has a claimed-collection read-only guard');
ok((worker.match(/claimed collection is read-only for the original scanner/g) || []).length === 3, 'server blocks update, delete, and unlink for the original scanner');
ok(cards.includes('function isClaimedCollectedCard(card, userId = getCurrentUserId())'), 'client identifies claimed collections');
ok(cards.includes('if (sourceType === "self_profile") return isClaimedCollectedCard(card, userId);'), 'client keeps claimed cards in the collector list only');
ok(cards.includes('if (isClaimedCollectedCard(card, userId)) return false;'), 'client prevents a collector from editing a claimed card');
ok(cards.includes('對方已認領此名片'), 'client explains the read-only state');
ok(contract.includes('收藏者仍可在「我的收錄名單」查看同一筆名片。'), 'resolver contract documents retained collector visibility');
ok(contract.includes('管理者身分不可繞過。'), 'resolver contract documents server-enforced read-only ownership');

console.log('\nClaimed collected-card contract passed.');
