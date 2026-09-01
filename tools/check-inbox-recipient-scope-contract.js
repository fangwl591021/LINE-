const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js/modules/inbox.js'), 'utf8');
const exchangeFrontend = fs.readFileSync(path.join(root, 'js/modules/exchange-zone.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function fail(message) {
  console.error(`Inbox recipient scope contract failed: ${message}`);
  process.exit(1);
}

if (!worker.includes('async actorReachContext(payload, env)')) {
  fail('missing actor reach context helper');
}

if (!worker.includes('actorReferrerIds')) {
  fail('recipient scope must include actor referrer IDs');
}

if (!worker.includes('legacy_line_id IN') || !worker.includes('point_line_id IN')) {
  fail('store recipient search must resolve legacy and point identity IDs');
}

if (!worker.includes('async canReachRecipient(payload, receiverRow, env)')) {
  fail('canReachRecipient must be async so it can resolve actor identity links');
}

if (!worker.includes('await this.canReachRecipient(payload, receiver.user, env)')) {
  fail('direct inbox send must await the async reachability check');
}

if (!worker.includes('await this.canReachRecipient(payload, userRow, env)')) {
  fail('course recipient summary must await the async reachability check');
}

[
  'const exchangePostHandle = this.text(payload.exchangePostHandle',
  'SELECT author_user_id',
  "WHERE post_handle = ? AND status = 'published'",
  "expires_at > CURRENT_TIMESTAMP",
  'exchangeRecipientAuthorized = true',
  '!exchangeRecipientAuthorized && !publicCardRecipientAuthorized && !await this.canReachRecipient',
  "pointPayload.exchangeInquiry = { postHandle: exchangePostHandle }"
].forEach(needle => {
  if (!worker.includes(needle)) fail(`missing verified exchange inquiry contract: ${needle}`);
});

[
  'const publicCardRowId = this.text(payload.publicCardRowId',
  'async publicInboxCardByRowId(env, rowId)',
  'async ownPublicInboxCard(payload, env)',
  "LOWER(TRIM(COALESCE(visibility,''))) = 'public'",
  "LOWER(TRIM(COALESCE(source_type,''))) = 'self_profile'",
  'CAST(COALESCE(pool_eligible, 0) AS INTEGER) = 1',
  "LOWER(TRIM(COALESCE(ai_review_status,''))) = 'passed'",
  'publicCardRecipientAuthorized = true',
  "requestedMessageType !== 'message'",
  '!exchangeRecipientAuthorized && !publicCardRecipientAuthorized && !await this.canReachRecipient',
  'pointPayload.publicMatchInquiry = { targetCardRowId: publicCardRowId }'
].forEach(needle => {
  if (!worker.includes(needle)) fail(`missing verified public-card inbox contract: ${needle}`);
});

if (!worker.includes('this.intersects(senderIdentityIds, receiverIdentityIds)')) {
  fail('exchange inquiry must reject self-send across identity aliases');
}

[
  'id="inbox-exchange-post-handle"',
  'id="inbox-public-card-row-id"',
  'id="inbox-recipient-mode-buttons"',
  'id="inbox-recipient-search-button"'
].forEach(needle => {
  if (!html.includes(needle)) fail(`missing exchange inbox composer field: ${needle}`);
});

[
  'window.openInboxPublicCardInquiry = function (match)',
  'inbox-public-card-row-id',
  '由公開配對名片帶入',
  'messageType.disabled = true',
  'publicCardRowId, receiverUserId'
].forEach(needle => {
  if (!frontend.includes(needle)) fail(`missing public-card inbox composer flow: ${needle}`);
});

[
  'window.openInboxExchangeInquiry = function (post)',
  'exchangePostHandle',
  '由交流貼文帶入',
  '對「${postTitle}」有興趣',
  'query.readOnly = true'
].forEach(needle => {
  if (!frontend.includes(needle)) fail(`missing direct exchange inquiry compose flow: ${needle}`);
});

if (frontend.includes('post.authorUserId') || frontend.includes('post.author_user_id')) {
  fail('exchange inquiry frontend must never receive an internal author identity');
}

[
  'exchange-zone-inquiry-button',
  '有興趣・寄站內信',
  'window.openInboxExchangeInquiry(post)'
].forEach(needle => {
  if (!exchangeFrontend.includes(needle)) fail(`missing exchange inquiry entry: ${needle}`);
});

console.log('Inbox recipient scope contract passed.');
