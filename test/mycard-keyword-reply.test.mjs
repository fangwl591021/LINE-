import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CardLinks } from '../worker/card-links.mjs';
import { consumeShopKeywords, signRemainingShopEvents } from '../worker/store-line-keywords.mjs';

const source = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');
const pending = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const event = (text = '我的名片', id = 'test-1') => ({ type: 'message', webhookEventId: id,
  replyToken: 'secret-token-' + id, source: { userId: 'Uprivate-test' }, message: { type: 'text', text, id } });
const card = (id, version = 'standard') => ({ row_id: 'CARD_' + id, source_type: 'self_profile',
  line_id: 'Uprivate-test', name: '測試名片', company_name: '測試公司', image_url: 'https://example.com/card.jpg',
  custom_config: JSON.stringify({ cardVersion: version, buttons: [
    { l: '網站', u: 'https://example.com', c: '#06C755' },
    { l: '電話', u: 'tel:0223456789', c: '#06C755' },
    { l: '地圖', u: 'https://maps.google.com/?q=test', c: '#06C755' }
  ] }) });

function harness({ fastTimers = false, fetchImpl } = {}) {
  const logs = [], replies = [], forwarded = [], gas = [], saved = [], calls = [];
  const noop = { reply: async () => false };
  const context = vm.createContext({ URL, URLSearchParams, TextEncoder, Response, Request, crypto, btoa, AbortController,
    setTimeout: fastTimers ? (fn, ms) => setTimeout(fn, Math.min(ms, 15)) : setTimeout, clearTimeout,
    console: { log: s => logs.push(JSON.parse(s)), error: s => logs.push(JSON.parse(s)) },
    fetch: fetchImpl || (() => { throw Error('unexpected external fetch'); }), CardLinks,
    cardLinksEnabled: async () => true, consumeShopKeywords, signRemainingShopEvents,
    LineOAMyVideoKeywordModule: { ...noop, buildExistingVideoCardFlex: async () => ({ type: 'flex', altText: 'video' }) },
    LineOACardCoolKeywordModule: noop, ReferralFriendKeywordModule: noop, LineOAStoreSearchKeywordModule: noop,
    LineOAKeywordRuleModule: { replyPayload: async () => null }
  });
  for (const name of ['Utils', 'D1ReadModule', 'MessagingModule', 'LineOAChatModule']) {
    vm.runInContext(source.match(new RegExp('^const ' + name + ' = \\{[\\s\\S]*?^\\};', 'm'))[0], context);
  }
  const chat = vm.runInContext('LineOAChatModule', context);
  const realReply = chat.replyLine.bind(chat);
  Object.assign(chat, {
    ensure: async () => { calls.push('ensure'); },
    saveEvent: async (_, e) => { saved.push(e); calls.push('save'); },
    fetchProfile: async () => { throw Error('profile must not gate card reply'); },
    findMySelfCards: async () => [card('one'), card('two', 'poster')],
    findMyVideoCards: async () => [],
    attachSocialLikeCountToFlexMessage: async m => m,
    replyLine: async p => { replies.push(p); calls.push('reply'); return { success: true, status: 200 }; },
    forwardToSecondSystem: async (raw, sig) => { forwarded.push({ raw, sig }); return { success: true }; },
    followPointOnboardingJob: async () => {},
    filterAutoReplyPayload: async raw => raw,
    forwardToGas: async raw => { gas.push(raw); return { success: true }; },
    normalizeReplyPayload: () => null
  });
  const env = { LINE_CHANNEL_SECRET: 'local-test-only', LINE_CHANNEL_ACCESS_TOKEN: 'local-test-token' };
  async function webhook(events, { signature, pretty = false } = {}) {
    const body = JSON.stringify({ destination: 'test-channel', events }, null, pretty ? 2 : undefined);
    const sig = signature ?? await signRemainingShopEvents(body, env.LINE_CHANNEL_SECRET);
    const jobs = [];
    const response = await chat.handleWebhook(new Request('https://test/line-webhook', {
      method: 'POST', body, headers: { 'x-line-signature': sig }
    }), env, { waitUntil: p => jobs.push(p) });
    return { response, jobs, body, sig };
  }
  return { chat, env, logs, replies, forwarded, gas, saved, calls, webhook, realReply };
}

test('keyword is acknowledged before slow card lookup and stays alive through waitUntil', async () => {
  const h = harness(), gate = pending();
  h.chat.findMySelfCards = () => gate.promise;
  const result = await h.webhook([event()]);
  assert.equal(result.response.status, 200);
  assert.equal(result.jobs.length, 1);
  assert.deepEqual(h.calls, []);
  assert.equal(h.forwarded.length, 0);
  gate.resolve([card('one'), card('two', 'poster')]);
  await Promise.all(result.jobs);
  assert.equal(h.replies[0].messages[0].altText, '選擇我的名片');
  assert.deepEqual(h.calls, ['reply', 'ensure', 'save']);
  assert(h.logs.some(l => l.stage === 'reply_ok'));
});

test('existing full-contact card renders without profile API; odd button remains intact', async () => {
  const h = harness(); h.chat.findMySelfCards = async () => [card('one')];
  await Promise.all((await h.webhook([event()])).jobs);
  const message = h.replies[0].messages[0];
  assert.equal(message.type, 'flex');
  const actions = [];
  const visit = node => { if (!node || typeof node !== 'object') return;
    if (node.type === 'button') actions.push(node.action);
    Object.values(node).forEach(v => Array.isArray(v) ? v.forEach(visit) : visit(v)); };
  visit(message.contents.footer);
  assert.equal(actions.length, 3);
  assert(actions.some(a => a.uri === 'tel:0223456789'));
});

test('single video card and no-card template retain their paths', async () => {
  const h = harness(); h.chat.findMySelfCards = async () => [];
  h.chat.findMyVideoCards = async () => [card('VIDEO_one', 'video')];
  await h.chat.replySimpleMyCard([event()], h.env);
  assert.equal(h.replies[0].messages[0].altText, 'video');
  h.chat.findMyVideoCards = async () => [];
  await h.chat.replySimpleMyCard([event()], h.env);
  assert.equal(h.replies[1].messages[0].type, 'flex');
});

test('postback selection preserves ownership and rejects another card without leaking it', async () => {
  const h = harness();
  const selected = { ...event(), type: 'postback', postback: { data: 'action=lineoa_mycard_select&rowId=CARD_one' } };
  await Promise.all((await h.webhook([selected])).jobs);
  assert.equal(h.replies[0].messages[0].type, 'flex');
  selected.postback.data = 'action=lineoa_mycard_select&rowId=CARD_foreign';
  await Promise.all((await h.webhook([selected])).jobs);
  assert.match(h.replies[1].messages[0].text, /找不到/);
  assert.equal(h.forwarded.length, 0);
});

test('lookup failure and timeout yield one useful reply; late lookup cannot send again', async () => {
  for (const fail of [true, false]) {
    const h = harness({ fastTimers: true }), gate = pending();
    h.chat.findMySelfCards = () => fail ? Promise.reject(Error('private database detail')) : gate.promise;
    const result = await h.webhook([event()]);
    await Promise.all(result.jobs);
    assert.equal(h.replies.length, 1);
    assert.match(h.replies[0].messages[0].text, /暫時無法載入/);
    gate.resolve([card('one')]);
    await new Promise(r => setTimeout(r, 20));
    assert.equal(h.replies.length, 1);
    assert.equal(h.forwarded.length, 0);
    assert(!JSON.stringify(h.logs).includes('private database detail'));
  }
});

test('like-count outage never suppresses a ready card', async () => {
  const h = harness({ fastTimers: true });
  h.chat.attachSocialLikeCountToFlexMessage = () => new Promise(() => {});
  const message = await h.chat.prepareMyCardReply({ ...event(), type: 'postback',
    postback: { data: 'action=lineoa_mycard_select&rowId=CARD_one' } }, h.env);
  assert.equal(message.type, 'flex');
});

test('mixed batch strips owned tokens, resigns only remaining events and saves each', async () => {
  const h = harness();
  const result = await h.webhook([event(), event('會員分享', 'other')]);
  await Promise.all(result.jobs);
  assert.equal(h.replies.length, 1);
  assert.equal(JSON.parse(h.forwarded[0].raw).events.length, 1);
  assert.equal(JSON.parse(h.gas[0]).events[0].message.text, '會員分享');
  assert.equal(h.forwarded[0].sig, await signRemainingShopEvents(h.forwarded[0].raw, h.env.LINE_CHANNEL_SECRET));
  assert(!h.forwarded[0].raw.includes('secret-token-test-1'));
  assert.equal(h.saved.length, 2);
});

test('unrelated batch retains exact original payload/signature', async () => {
  const h = harness(), result = await h.webhook([event('你好')], { pretty: true });
  await Promise.all(result.jobs);
  assert.equal(h.forwarded[0].raw, result.body);
  assert.equal(h.forwarded[0].sig, result.sig);
});

test('invalid signature does not queue, send, save or forward', async () => {
  const h = harness(), result = await h.webhook([event()], { signature: 'invalid' });
  assert.equal(result.response.status, 401);
  assert.equal(result.jobs.length, 0);
  assert.deepEqual(h.calls, []);
  assert.equal(h.forwarded.length, 0);
});

test('standby and duplicate tokens never reply twice or leak to forwarding', async () => {
  const h = harness();
  await Promise.all((await h.webhook([event(), event(), { ...event('我的名片', 'standby'), mode: 'standby' }])).jobs);
  assert.equal(h.replies.length, 1);
  assert.equal(h.forwarded.length, 0);
});

test('LINE rejection logs safe status without token, user ID or message contents', async () => {
  const h = harness();
  h.chat.replyLine = async p => { h.replies.push(p); return { success: false, status: 400, error: 'sensitive response' }; };
  await Promise.all((await h.webhook([event()])).jobs);
  assert.equal(h.replies.length, 1);
  assert(h.logs.some(l => l.stage === 'reply_rejected' && l.status === 400));
  for (const value of ['secret-token', 'Uprivate-test', 'sensitive response']) assert(!JSON.stringify(h.logs).includes(value));
  assert.equal(h.forwarded.length, 0);
});

test('reply HTTP timeout aborts the fetch and does not retry or forward', async () => {
  let attempts = 0;
  const h = harness({ fastTimers: true, fetchImpl: (_, options) => new Promise((_, reject) => {
    attempts++;
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }) });
  h.chat.replyLine = h.realReply;
  await Promise.all((await h.webhook([event()])).jobs);
  assert.equal(attempts, 1);
  assert(h.logs.some(l => l.stage === 'reply_timeout'));
  assert.equal(h.forwarded.length, 0);
});
