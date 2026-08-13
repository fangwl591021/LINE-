const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migration = read('migrations/0023_exchange_zone_likes.sql');
const likes = read('worker/exchange-zone-likes.mjs');
const workerModule = read('worker/exchange-zone.mjs');
const frontend = read('js/modules/exchange-zone.js');
const overlay = read('js/modules/exchange-zone-delete-overlay.js');

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

includesAll(workerModule, [
  "from './exchange-zone-likes.mjs'",
  'hydrateExchangeZoneLikes',
  'getExchangeZoneLikeState',
  'payload?.toggleLike === true',
  'toggleExchangeZoneLike(env.ACTMASTER_DB, payload, actor)',
  'likeCount:',
  'likedByMe:'
], 'exchange worker exposes like state through existing authenticated exchange update path');

includesAll(frontend, [
  'thumb_up',
  'data-exchange-like=',
  "window.fetchAPI('updateExchangeZonePost', { postHandle: handle, toggleLike: true }",
  'event.stopPropagation()',
  '附上的公開名片',
  '查看完整名片',
  '收合名片',
  'max-h-[280px]'
], 'frontend shows surface likes and a compact expandable public card');

includesAll(overlay, [
  "row.id = 'exchange-zone-owner-actions'",
  'grid grid-cols-2 gap-3',
  "button.id = 'exchange-zone-archive-button'",
  'min-h-14',
  'text-[16px]',
  '刪除貼文'
], 'owner edit and delete actions render as one large two-column row');

includesAll(likes, [
  'fetchExchangeZoneLinkPreview',
  "url.protocol !== 'https:'",
  "host === 'localhost'",
  "host.endsWith('.internal')",
  "host === '169.254.169.254'",
  "redirect: 'manual'",
  'readHtmlBounded',
  '262144',
  "metaContent(html, 'og:image')",
  "metaContent(html, 'og:title')",
  "if (payload?.previewUrl) return fetchExchangeZoneLinkPreview(payload.previewUrl)"
], 'link preview fetch is HTTPS-only, redirect-checked, bounded and OG-aware');

includesAll(overlay, [
  'firstHttpsUrl',
  'linkifyArticle',
  'exchangeLinksEnhanced',
  "window.fetchAPI('updateExchangeZonePost', { toggleLike: true, previewUrl: url }",
  'exchangeLinkPreview',
  "anchor.target = '_blank'",
  "anchor.rel = 'noopener noreferrer'",
  'preview.imageUrl',
  'preview.description'
], 'exchange detail linkifies HTTPS URLs and renders first-link preview metadata safely');

ok(!frontend.includes('max-h-[420px]'), 'exchange detail no longer renders the old oversized card image');
ok(!frontend.includes('window.open('), 'exchange enhancements do not open a new browser window');
ok(!frontend.includes('window.location'), 'exchange enhancements do not navigate away from the LIFF app');
ok(!overlay.includes('innerHTML = preview.'), 'link preview metadata is rendered with DOM textContent rather than unsafe HTML');

console.log('\nExchange zone like, compact-card, owner-action and link-preview contract passed.');
