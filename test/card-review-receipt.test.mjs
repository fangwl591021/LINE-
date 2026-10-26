import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { applyVerifiedCardReview, reviewCardWithReceipt, cardReviewProjection, cardReviewFingerprint } from '../worker/card-review-receipt.mjs';
import { prepareCardSafetyReview, normalizeCardSafetyReview } from '../worker/card-safety-review.mjs';
import { CardLinks } from '../worker/card-links.mjs';
const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), NOW = 1800000000000;
const actor = { userId: A, token: 'verified-login-token', role: 'user', networkId: 'admin' };
const base = () => ({ row_id: 'card', line_id: A, profile_user_id: A, creator_id: A, owner_user_id: A, source_type: 'self_profile', ai_review_status: 'pending',
  name: '合成名片', company_name: '合成工作室', title: '顧問', mobile: '0900000001', email: 'hello@example.test', website: 'https://example.test', services: '提供品牌設計與商業諮詢', image_url: 'https://example.test/card.jpg',
  custom_config: JSON.stringify({ title: '品牌設計顧問', desc: '提供品牌設計與商業諮詢', imgUrlPortrait: 'https://example.test/portrait.jpg', buttons: [{ l: '聯絡我們', u: 'https://example.test/contact' }], color: '#00aa88' }) });
function input(row) {
  const cfg = JSON.parse(row.custom_config);
  return { rowId: row.row_id, name: row.name || '未命名', company: row.company_name,
    title: cfg.title || row.name || '未命名', phone: row.mobile, email: row.email, website: row.website,
    service: cfg.desc || row.services, imageUrl: cfg.imgUrl || cfg.imgUrlLandscape || cfg.imgUrlPortrait || cfg.imgUrlSquare || row.image_url, buttons: cfg.buttons || [] };
}
function fixture() {
  const values = new Map(), writes = [], evaluations = [], row = base();
  let failGet = false, failPut = false;
  const env = { ACTMASTER_DB: { prepare(query) { assert.match(query, /^SELECT /); return { bind(id) { return { async first() { return id === row.row_id ? row : null; } }; } }; } },
    ACTMASTER_KV: { async get(key, type) { if (failGet) throw Error('private get error'); assert.equal(type, 'json'); const value = values.get(key); return value ? JSON.parse(value) : null; }, async put(key, value, options) { if (failPut) throw Error('private put error'); values.set(key, value); writes.push({ key, value, options }); } } };
  const evaluate = async payload => {
    evaluations.push(payload);
    return normalizeCardSafetyReview({ pass: true, status: 'passed', riskLevel: 'low', reasons: [], suggestions: [], issues: [] }, { card: prepareCardSafetyReview(payload.card), imageReviewed: true });
  };
  const review = (target = row, as = actor, model = evaluate) => reviewCardWithReceipt({ card: input(target), clientOpenAIKey: 'not-a-real-secret' }, env, as, model, NOW);
  return { env, row, values, writes, evaluations, review, evaluate, failGet() { failGet = true; }, failPut() { failPut = true; } };
}
test('real normalized AI result issues a server receipt and normal config save becomes approved', async () => {
  const f = fixture(), result = await f.review();
  assert.equal(result.success, true); assert.equal(result.data.status, 'passed'); assert.equal(f.evaluations.length, 1);
  const cfg = JSON.parse(f.row.custom_config); cfg.safetyReview = { pass: true, status: 'passed', mode: 'ai', reviewedAt: new Date(NOW + 5).toISOString() };
  const saved = await applyVerifiedCardReview(f.env, { ...f.row, custom_config: JSON.stringify(cfg), ai_review_status: 'passed' }, f.row, A, NOW + 10);
  assert.equal(saved.status, 'passed'); assert.equal(saved.preserved, false);
  assert.equal(JSON.parse(saved.customConfig).safetyReview.reviewedAt, new Date(NOW).toISOString());
  assert.equal(f.writes[0].options.expirationTtl, 3600);
  assert.doesNotMatch(f.writes[0].value, /verified-login-token|not-a-real-secret|0900000001|hello@example.test/);
});
test('client passed/failed flags do not confer or revoke authority, and new approval is scoped by actor/card/content', async () => {
  const f = fixture(), cfg = JSON.parse(f.row.custom_config);
  cfg.safetyReview = { pass: true, status: 'passed', reviewedAt: new Date().toISOString() };
  const forged = { ...f.row, ai_review_status: 'passed', custom_config: JSON.stringify(cfg) };
  assert.equal((await applyVerifiedCardReview(f.env, forged, f.row, A, NOW)).status, 'pending');
  assert.equal((await applyVerifiedCardReview(f.env, forged, f.row, A, NOW)).rejectApproval, true, 'new unverified pass must fail the save instead of misleading CardMaster');
  assert.equal(JSON.parse((await applyVerifiedCardReview(f.env, forged, f.row, A, NOW)).customConfig).safetyReview, undefined);
  await f.review();
  for (const [row, who] of [[{ ...forged, row_id: 'other-card' }, A], [forged, B], [forged, ''], [{ ...forged, name: '不同名片' }, A]]) {
    assert.equal((await applyVerifiedCardReview(f.env, row, f.row, who, NOW + 10)).status, 'pending');
  }
  assert.equal((await applyVerifiedCardReview(f.env, forged, f.row, A, NOW + 3600000)).status, 'pending');
});
test('unchanged existing approvals survive absent/outage receipts and styling edits; changed content resets pending', async () => {
  const f = fixture(), existing = { ...f.row, ai_review_status: 'passed' }, cfg = JSON.parse(existing.custom_config);
  cfg.color = '#112233'; cfg.safetyReview = { pass: false, status: 'failed', reasons: ['forged client failure'] };
  f.failGet();
  const saved = await applyVerifiedCardReview(f.env, { ...existing, custom_config: JSON.stringify(cfg), ai_review_status: 'failed' }, existing, A, NOW);
  assert.equal(saved.status, 'passed'); assert.equal(saved.preserved, true);
  assert.equal(JSON.parse(saved.customConfig).safetyReview, undefined);
  for (const changed of [{ name: '新姓名' }, { company_name: '新公司' }, { mobile: '0900000002' }, { website: 'https://different.test' }, { custom_config: JSON.stringify({ ...cfg, desc: '新的服務內容' }) }]) {
    assert.equal((await applyVerifiedCardReview(f.env, { ...existing, ...changed }, existing, A, NOW)).status, 'pending');
  }
});
test('a real failed receipt overrides fabricated pass reports and keeps actual review feedback', async () => {
  const f = fixture();
  const report = { pass: false, status: 'failed', riskLevel: 'medium', reasons: ['服務說明需要修正'], suggestions: ['補上可查證的資訊'], issues: [{ field: 'service', evidence: '品牌設計', reason: '需要說明服務範圍', suggestion: '補上明確服務項目' }] };
  assert.equal((await f.review(f.row, actor, async () => ({ success: true, data: report }))).data.status, 'failed');
  const cfg = JSON.parse(f.row.custom_config); cfg.safetyReview = { pass: true, status: 'passed' };
  const saved = await applyVerifiedCardReview(f.env, { ...f.row, custom_config: JSON.stringify(cfg), ai_review_status: 'passed' }, f.row, A, NOW + 10);
  assert.equal(saved.status, 'failed'); assert.deepEqual(JSON.parse(saved.customConfig).safetyReview.issues, report.issues);
});
test('converted imported/video or restored inactive profiles cannot inherit an unverified passed column', async () => {
  const f = fixture(), current = { ...f.row, ai_review_status: 'passed' };
  for (const prior of [{ source_type: 'private_import' }, { source_type: 'video_profile' }, { archived_at: '2026-10-26' }, { merged_into_row_id: 'other-card' }]) {
    const existing = { ...current, ...prior };
    const result = await applyVerifiedCardReview(f.env, current, existing, A, NOW);
    assert.equal(result.status, 'pending'); assert.equal(result.preserved, false);
  }
});
test('unauthorized actors, UID-only fallbacks, invalid rows and service/KV failures issue no usable proof', async () => {
  const f = fixture();
  for (const as of [{ ...actor, userId: B }, { ...actor, token: '' }, { ...actor, source: 'd1_identity_fallback' }]) assert.equal((await f.review(f.row, as)).success, false);
  for (const row_id of ['', 'missing', 'x'.repeat(181), 'bad\nrow']) assert.equal((await f.review({ ...f.row, row_id })).success, false);
  assert.equal(f.evaluations.length, 0); assert.equal(f.writes.length, 0);
  const unavailable = { success: false, errorCode: 'AI_REVIEW_SERVICE_UNAVAILABLE' };
  assert.deepEqual(await f.review(f.row, actor, async () => unavailable), unavailable); assert.equal(f.writes.length, 0);
  f.failPut(); const failed = await f.review(); assert.equal(failed.success, false); assert.equal(failed.errorCode, 'AI_REVIEW_RECEIPT_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(failed), /private put error|verified-login-token|not-a-real-secret/);
  assert.equal((await applyVerifiedCardReview(f.env, f.row, null, A, NOW)).status, 'pending');
});
test('receipt hashes include omitted model-input tails and all button destinations and order', async () => {
  const f = fixture(), cfg = JSON.parse(f.row.custom_config);
  cfg.desc = '服務'.repeat(1300); cfg.buttons = Array.from({ length: 15 }, (_, i) => ({ l: '連結' + i, u: 'https://example.test/' + i }));
  const row = { ...f.row, custom_config: JSON.stringify(cfg) };
  assert.equal(cardReviewProjection(row).service.length, 2400); assert.equal(cardReviewProjection(row).buttons.length, 12);
  await f.review(row);
  assert.equal((await applyVerifiedCardReview(f.env, row, null, A, NOW + 10)).status, 'passed');
  for (const next of [{ ...cfg, desc: cfg.desc + '未審查新內容' }, { ...cfg, buttons: cfg.buttons.map((b, i) => i === 14 ? { ...b, u: 'https://changed.test' } : b) }, { ...cfg, buttons: cfg.buttons.toReversed() }]) {
    const changed = { ...row, custom_config: JSON.stringify(next) };
    assert.notEqual(await cardReviewFingerprint(changed), await cardReviewFingerprint(row));
    assert.equal((await applyVerifiedCardReview(f.env, changed, null, A, NOW + 10)).status, 'pending');
  }
});
test('image priorities and blank-Chinese/English-only cards match actual CardMaster/D1 display projection', async () => {
  const f = fixture(), cfg = JSON.parse(f.row.custom_config);
  const row = { ...f.row, name: '', english_name: 'English Only', custom_config: JSON.stringify({ ...cfg, title: '', imgUrl: '', imgUrlLandscape: 'https://example.test/landscape.jpg' }) };
  const view = { '姓名': '未命名', '英文名': row.english_name, '公司名稱': row.company_name, '職稱': row.title, '手機號碼': row.mobile, '電子郵件': row.email, '公司網址': row.website, '服務項目': row.services, '名片圖檔': row.image_url, '自訂名片設定': row.custom_config, rowId: row.row_id };
  const source = readFileSync(new URL('../js/modules/cardmaster.js', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('  function collectCard(card) {'), source.indexOf('  function hasTemplateContent(card) {'));
  const collect = vm.runInNewContext('(' + method.replace('function collectCard', 'function') + ')', { SERVICE_FIELD: '服務項目', IMAGE_FIELD: '名片圖檔', getCardRowId: card => card.rowId, parseConfig: card => JSON.parse(card['自訂名片設定']), getField: (card, fields) => fields.map(field => card[field]).find(value => value !== undefined && value !== null) ?? '' });
  const actual = JSON.parse(JSON.stringify(collect(view)));
  assert.deepEqual(prepareCardSafetyReview(actual), cardReviewProjection(row));
  const result = await reviewCardWithReceipt({ card: actual }, f.env, actor, f.evaluate, NOW);
  assert.equal(result.success, true);
  assert.equal((await applyVerifiedCardReview(f.env, row, null, A, NOW + 10)).status, 'passed');
});

test('the actual dispatcher and final-merged save hooks call the verified receipt path', () => {
  const worker = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');
  assert.match(worker, /case 'reviewCardSafety':\s+return await reviewCardWithReceipt\(payload, env, actor,/);
  const start = worker.indexOf('  async upsertCard(payload, env) {'), end = worker.indexOf('\n  async deleteCard(payload, env)', start), save = worker.slice(start, end);
  assert.ok(save.indexOf('applyVerifiedCardReview') > save.indexOf('const inferredAccess'));
  assert.ok(save.indexOf('applyVerifiedCardReview') < save.indexOf('INSERT INTO card_contacts'));
  assert.match(save, /payload\[SecurityModule.aiAdvanceVerifiedActor\]/);
  assert.match(save, /if \(verifiedReview.rejectApproval\) return \{ success: false, code: 'AI_REVIEW_RECEIPT_REQUIRED'/);
});

test('actual upsert SQL rejects forged approval then accepts matching real-review config save without altering ownership', async t => {
  const f = fixture(), source = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');
  const start = source.indexOf('  async upsertCard(payload, env) {'), end = source.indexOf('\n  async deleteCard(payload, env)', start), method = source.slice(start, end);
  const columns = method.match(/INSERT INTO card_contacts \(([^)]+)\)/)[1].split(',').map(value => value.trim());
  const extra = ['source_event_id','claimed_from_row_id','claimed_by_uid','claimed_at','merged_into_row_id','archived_at'];
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  sql.exec('CREATE TABLE card_contacts (' + [...columns, ...extra].map(column => column + ' TEXT' + (column === 'row_id' ? ' PRIMARY KEY' : '')).join(',') + ')');
  const initial = { ...Object.fromEntries([...columns, ...extra].map(column => [column, ''])), ...f.row };
  sql.prepare('INSERT INTO card_contacts(' + Object.keys(initial).join(',') + ') VALUES(' + Object.keys(initial).map(() => '?').join(',') + ')').run(...Object.values(initial));
  const writes = [], prepare = query => {
    const build = args => ({ bind: (...values) => build(values), first: async () => sql.prepare(query).get(...args), run: async () => { writes.push(query); return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; } });
    return build([]);
  };
  f.env.ACTMASTER_DB = { prepare };
  const verifiedActor = Symbol('server-only-verified-actor');
  const context = vm.createContext({ console, CardLinks, cardLinksEnabled: async () => false, applyVerifiedCardReview: (...args) => applyVerifiedCardReview(...args, NOW + 10), SecurityModule: { aiAdvanceVerifiedActor: verifiedActor },
    D1ReadModule: { ensureCardAccessColumns: async () => {}, first: async (_env, query, args) => sql.prepare(query).get(...args), cardRow: row => ({ ...row }), inferCrmType: () => '', inferCrmNextAction: () => '', inferCrmSuggestion: () => '',
      inferCardAccess: row => ({ ownerUserId: A, profileUserId: A, sourceType: 'self_profile', visibility: 'public', poolEligible: true, aiReviewStatus: row.ai_review_status || (JSON.parse(row.custom_config).safetyReview?.pass ? 'passed' : 'pending'), isSelfProfile: true }) },
    CardFateTagAnalysisModule: { enqueueCard: async () => {} }, CardUploaderMatchModule: { enqueueCard: async () => {} } });
  const writer = vm.runInContext('({' + method + '})', context);
  Object.assign(writer, { hasD1: () => true, text: (value, fallback = '') => String(value || fallback), role: value => value, pick: (obj, keys, fallback = '') => keys.map(key => obj?.[key]).find(value => value !== undefined) ?? fallback,
    isLineUserIdLike: () => false, isClaimedCollectionReadOnlyForActor: async () => false, resolvePointAwardUserId: async (_env, id) => id,
    normalizeCard: payload => ({ ...initial, custom_config: payload.data.customConfig, ai_review_status: payload.data.aiReviewStatus || '' }), upsertUser: async () => {}, awardCardScanPoints: async () => ({ awarded: false }) });
  const cfg = JSON.parse(initial.custom_config); cfg.safetyReview = { pass: true, status: 'passed', mode: 'ai' };
  const payload = { rowId: 'card', userId: A, authenticatedUserId: A, authenticatedRole: 'user', [verifiedActor]: A, data: { customConfig: JSON.stringify(cfg), aiReviewStatus: 'passed' } };
  assert.equal((await writer.upsertCard(payload, f.env)).code, 'AI_REVIEW_RECEIPT_REQUIRED');
  assert.equal(writes.length, 0); assert.equal(sql.prepare("SELECT ai_review_status FROM card_contacts WHERE row_id='card'").get().ai_review_status, 'pending');
  assert.equal((await f.review()).success, true);
  const result = await writer.upsertCard(payload, f.env); assert.equal(result.success, true);
  const saved = sql.prepare("SELECT * FROM card_contacts WHERE row_id='card'").get();
  assert.equal(saved.ai_review_status, 'passed'); assert.equal(saved.line_id, A); assert.equal(saved.owner_user_id, A); assert.equal(saved.profile_user_id, A);
  assert.equal(JSON.parse(saved.custom_config).safetyReview.pass, true);
});
