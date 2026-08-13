const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migration = read('migrations/0023_exchange_zone_likes.sql');
const likes = read('worker/exchange-zone-likes.mjs');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

function includesAll(source, needles, message) {
  const missing = needles.filter((needle) => !source.includes(needle));
  ok(!missing.length, `${message}${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);
}

includesAll(migration, [
  'CREATE TABLE IF NOT EXISTS exchange_zone_post_likes',
  'post_handle TEXT NOT NULL',
  'user_id TEXT NOT NULL',
  'UNIQUE(post_handle, user_id)',
  'idx_exchange_zone_post_likes_post',
  'idx_exchange_zone_post_likes_user'
], 'like migration defines one-like-per-member contract and indexes');

includesAll(likes, [
  'getExchangeZoneLikeState',
  'hydrateExchangeZoneLikes',
  'toggleExchangeZoneLike',
  "status = 'published'",
  "expires_at = '' OR expires_at > CURRENT_TIMESTAMP",
  'INSERT OR IGNORE INTO exchange_zone_post_likes',
  'DELETE FROM exchange_zone_post_likes',
  'likeCount',
  'likedByMe'
], 'like service supports published non-expired posts and toggle state');

ok(!likes.includes('payload?.userId'), 'like service never trusts a user id from payload');
ok(!likes.includes('payload?.authorUserId'), 'like service never trusts an author id from payload');
ok(likes.includes('actor?.userId'), 'like service derives member identity from verified actor');

console.log('\nExchange zone like contract passed.');
