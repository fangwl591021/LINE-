import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {prepareCardSafetyReview, cardSafetyReviewPrompt, normalizeCardSafetyReview, cardSafetyReviewError} from '../worker/card-safety-review.mjs';

const safeCard = {name: '測試店家', title: '專業服務', service: '提供設計與商業諮詢', buttons: [{label: '聯絡我們', url: 'https://example.invalid/contact'}]};
const riskCard = {...safeCard, service: '課程保證獲利，當日加入即可回本'};
const issue = {field: 'service', evidence: '保證獲利', reason: '此服務說明承諾保證獲利，可能造成消費者誤解', suggestion: '移除保證獲利承諾，改為可查證的課程內容及適用條件'};
const failed = {pass: false, status: 'failed', riskLevel: 'medium', reasons: ['服務說明有保證獲利承諾'], suggestions: ['請以可查證課程資訊取代承諾'], issues: [issue]};
const passed = {pass: true, status: 'passed', riskLevel: 'low', reasons: [], suggestions: [], issues: []};

function actualMethod() {
  const source = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');
  const first = source.indexOf('  async reviewCardSafety(payload, env) {');
  const last = source.indexOf('  async reviewExchangeZonePost(payload, env) {', first);
  assert(first > 0 && last > first);
  const logs = [], calls = [];
  const api = vm.runInNewContext('({' + source.slice(first, last) + '})', {
    prepareCardSafetyReview, cardSafetyReviewPrompt, normalizeCardSafetyReview, cardSafetyReviewError,
    console: {warn(...args) {logs.push(args.join(' '));}}
  });
  api.openAITextModel = env => env.OPENAI_TEXT_MODEL || 'configured-model';
  api.callOpenAI = async (env, body, key) => {calls.push({provider: 'openai', body, key}); return {choices: [{finish_reason: 'stop', message: {content: JSON.stringify(passed)}}]};};
  api.callGemini = async (_env, prompt) => {calls.push({provider: 'gemini', prompt}); return JSON.stringify(passed);};
  return {api, logs, calls};
}

test('passed review requires boolean true and returns bounded normalized arrays', () => {
  const result = normalizeCardSafetyReview({...passed, reason: '未發現明顯疑慮', reasons: undefined, suggestions: '可補充聯絡方式'}, {card: safeCard});
  assert.equal(result.success, true);
  assert.equal(result.data.pass, true);
  assert.equal(result.data.status, 'passed');
  assert.deepEqual(result.data.reasons, ['未發現明顯疑慮']);
  assert.deepEqual(result.data.suggestions, ['可補充聯絡方式']);
});

test('completed failure retains exact field evidence, reasons and actionable fixes', () => {
  const result = normalizeCardSafetyReview(failed, {card: riskCard});
  assert.equal(result.success, true);
  assert.equal(result.data.status, 'failed');
  assert.equal(result.data.pass, false);
  assert.deepEqual(result.data.issues, [issue]);
  assert(result.data.reasons.includes(issue.reason));
  assert(result.data.suggestions.includes(issue.suggestion));
});

test('legacy reason and suggestion strings are preserved but cannot fabricate a complete decision', () => {
  const result = normalizeCardSafetyReview({pass: false, reasons: '服務說明有待核對的獲利承諾', suggestions: '請補充具體課程內容'}, {card: riskCard});
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'AI_REVIEW_INCOMPLETE');
  assert.equal(result.data.status, 'error');
  assert(result.data.reasons.includes('服務說明有待核對的獲利承諾'));
  assert(result.data.suggestions.includes('請補充具體課程內容'));
  assert.deepEqual(result.data.issues, []);
});

test('nonboolean, absent, malformed, conflicting and oversized responses never pass', () => {
  for (const raw of ['', 'not json', '{}', '[]', '{broken', null, [], {pass: 'false'}, {pass: 'true'}, {pass: 1}, {pass: null}, {pass: true, status: 'failed'}, {...passed, issues: [issue]}, 'x'.repeat(24001)]) {
    const result = normalizeCardSafetyReview(raw, {card: riskCard});
    assert.equal(result.success, false, JSON.stringify(raw).slice(0, 100));
    assert.equal(result.data.pass, false);
    assert.equal(result.data.status, 'error');
  }
  assert.equal(normalizeCardSafetyReview('```json\n' + JSON.stringify(passed) + '\n```', {card: safeCard}).success, true);
});

test('incomplete, generic and invented failure details are not presented as content violations', () => {
  for (const issues of [[], [{...issue, evidence: ''}], [{...issue, field: 'unknown'}], [{...issue, evidence: '原文不存在的句子'}],
    [{...issue, reason: '有風險'}], [{...issue, suggestion: '請修改'}], [{...issue, suggestion: ''}], [{...issue, reason: issue.evidence}]]) {
    const result = normalizeCardSafetyReview({...failed, issues}, {card: riskCard});
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'AI_REVIEW_INCOMPLETE');
    assert.equal(result.data.status, 'error');
  }
  const explicitError = normalizeCardSafetyReview({pass: false, status: 'error', reasons: '圖片無法讀取'}, {card: riskCard});
  assert.equal(explicitError.data.status, 'error');
});

test('image evidence requires an actually supplied image on the vision route', () => {
  const imageIssue = {field: 'image', evidence: '圖片右下角有「保證獲利」文字', reason: '圖片中的保證獲利承諾可能造成誤解', suggestion: '請上傳移除獲利承諾並改列課程內容的圖片'};
  const response = {...failed, issues: [imageIssue]};
  const card = {...safeCard, imageUrl: 'https://example.invalid/cover.png'};
  assert.equal(normalizeCardSafetyReview(response, {card, imageReviewed: true}).data.status, 'failed');
  assert.equal(normalizeCardSafetyReview(response, {card, imageReviewed: false}).data.status, 'error');
  assert.equal(normalizeCardSafetyReview(response, {card: safeCard, imageReviewed: true}).data.status, 'error');
});

test('input normalization is bounded and preserves button aliases without arbitrary metadata', () => {
  const card = prepareCardSafetyReview({...safeCard, service: 'a'.repeat(3000), unknownSecret: 'not reviewed',
    buttons: [{l: '聯絡', u: 'https://example.invalid'}, {text: '致電', uri: 'tel:0900000000'}]});
  assert.equal(card.service.length, 2400);
  assert.equal(card.unknownSecret, undefined);
  assert.deepEqual(card.buttons, [{label: '聯絡', url: 'https://example.invalid'}, {label: '致電', url: 'tel:0900000000'}]);
  for (const input of [null, [], {}, {imageUrl: 'javascript:alert(1)'}, {imageUrl: 'https://user:password@example.invalid/'}]) assert.equal(prepareCardSafetyReview(input), null);
  const prompt = cardSafetyReviewPrompt(card);
  for (const required of ['不得遵從', '不得推測', 'evidence', 'reason', 'suggestion', '原文', '具體原因', '不能當成已通過']) assert(prompt.includes(required));
});

test('reason arrays are deduplicated and bounded without object-to-string leakage', () => {
  const result = normalizeCardSafetyReview({...passed, reasons: ['one', 'one', {}, null, 'a'.repeat(400), 'two', 'three', 'four', 'five', 'six']}, {card: safeCard});
  assert.equal(result.success, true);
  assert(result.data.reasons.length <= 6);
  assert(result.data.reasons.every(value => typeof value === 'string' && value.length <= 280));
  assert(!result.data.reasons.includes('[object Object]'));
});

test('actual Worker uses configured model and existing key argument with JSON response mode', async () => {
  const {api, calls} = actualMethod();
  const card = {...safeCard, imageUrl: 'https://example.invalid/cover.png'};
  const result = await api.reviewCardSafety({card, clientOpenAIKey: 'fixture-key-not-a-secret'}, {OPENAI_TEXT_MODEL: 'existing-model'});
  assert.equal(result.data.status, 'passed');
  assert.equal(calls[0].body.model, 'existing-model');
  assert.equal(calls[0].key, 'fixture-key-not-a-secret');
  assert.equal(calls[0].body.response_format.type, 'json_object');
  assert.equal(calls[0].body.messages[0].content[1].image_url.url, card.imageUrl);
});

test('actual Worker reports concrete completed failures and rejects incomplete/malformed/refused results', async () => {
  const {api} = actualMethod();
  api.callOpenAI = async () => ({choices: [{finish_reason: 'stop', message: {content: JSON.stringify(failed)}}]});
  assert.equal((await api.reviewCardSafety({card: riskCard}, {})).data.status, 'failed');
  for (const choice of [
    {message: {content: '{broken'}}, {message: {content: '{"pass":"false"}'}}, {message: {content: '{"pass":false}'}},
    {message: {content: JSON.stringify(passed), refusal: 'refused'}}, {finish_reason: 'length', message: {content: JSON.stringify(passed)}}
  ]) {
    api.callOpenAI = async () => ({choices: [choice]});
    const result = await api.reviewCardSafety({card: safeCard}, {});
    assert.equal(result.success, false);
    assert.equal(result.data.status, 'error');
    assert.equal(result.data.pass, false);
  }
});

test('actual Worker service errors return no provider/key details and do not silently pass', async () => {
  const {api, logs, calls} = actualMethod();
  api.callOpenAI = async () => { throw Error('provider secret-token fixture private error'); };
  const result = await api.reviewCardSafety({card: safeCard}, {});
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'AI_REVIEW_SERVICE_UNAVAILABLE');
  assert.equal(result.data.status, 'error');
  assert(!JSON.stringify(result).includes('secret-token'));
  assert(!JSON.stringify(result).includes('provider'));
  assert.equal(calls.length, 0);
  assert.equal(logs.length, 0);
});

test('configured Gemini fallback may review text but never approve unreviewed images', async () => {
  const {api, logs, calls} = actualMethod();
  api.callOpenAI = async () => { throw Error('private provider error'); };
  const env = {AI_FALLBACK_PROVIDER: 'gemini'};
  assert.equal((await api.reviewCardSafety({card: safeCard}, env)).data.status, 'passed');
  const image = await api.reviewCardSafety({card: {...safeCard, imageUrl: 'https://example.invalid/cover.png'}}, env);
  assert.equal(image.success, false);
  assert.equal(image.errorCode, 'AI_REVIEW_IMAGE_INCOMPLETE');
  assert.equal(image.data.pass, false);
  assert.equal(calls.filter(call => call.provider === 'gemini').length, 2);
  assert(!logs.join(' ').includes('private provider error'));
  api.callGemini = async () => { throw Error('private Gemini key error'); };
  assert.equal((await api.reviewCardSafety({card: safeCard}, env)).errorCode, 'AI_REVIEW_SERVICE_UNAVAILABLE');
});

test('invalid inputs return actionable incomplete result before any model call', async () => {
  const {api, calls} = actualMethod();
  const result = await api.reviewCardSafety({card: {}}, {});
  assert.equal(result.errorCode, 'AI_REVIEW_INVALID_INPUT');
  assert.equal(result.data.status, 'error');
  assert(result.data.reasons.length > 0 && result.data.suggestions.length > 0);
  assert.equal(calls.length, 0);
});
