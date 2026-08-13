import assert from 'node:assert/strict';
import { ExchangeZoneModule } from '../worker/exchange-zone.mjs';

function fakeEnv(options = {}) {
  const calls = [];
  return {
    calls,
    EXCHANGE_ZONE_ACCESS_MODE: options.mode,
    EXCHANGE_ZONE_PILOT_USER_IDS: options.pilotIds,
    EXCHANGE_ZONE_PRIVATE_TESTER_IDS: options.privateTesterIds,
    ACTMASTER_DB: {
      prepare(sql) {
        const call = { sql, bindings: [] };
        calls.push(call);
        return {
          bind(...bindings) {
            call.bindings = bindings;
            return this;
          },
          async all() {
            return { results: options.rows || [] };
          },
          async first() {
            return options.first || null;
          }
        };
      }
    }
  };
}

const admin = { userId: 'U_OWNER', role: 'admin' };
const otherAdmin = { userId: 'U_OTHER_ADMIN', role: 'admin' };
const member = { userId: 'U_MEMBER', role: 'user' };

assert.deepEqual(ExchangeZoneModule.access({}, {}, member).access, {
  mode: 'private', allowed: false, canManage: false
});
assert.equal(ExchangeZoneModule.access({}, {
  EXCHANGE_ZONE_ACCESS_MODE: 'private',
  EXCHANGE_ZONE_PRIVATE_TESTER_IDS: 'U_OWNER'
}, admin).access.allowed, true);
assert.equal(ExchangeZoneModule.access({}, {
  EXCHANGE_ZONE_ACCESS_MODE: 'private',
  EXCHANGE_ZONE_PRIVATE_TESTER_IDS: 'U_OWNER'
}, otherAdmin).access.allowed, false);
assert.equal(ExchangeZoneModule.access({}, { EXCHANGE_ZONE_ACCESS_MODE: 'open' }, member).access.allowed, true);
assert.equal(ExchangeZoneModule.access({}, {
  EXCHANGE_ZONE_ACCESS_MODE: 'pilot',
  EXCHANGE_ZONE_PILOT_USER_IDS: 'U_OTHER,U_MEMBER'
}, member).access.allowed, true);

{
  const env = fakeEnv({ mode: 'private' });
  const result = await ExchangeZoneModule.list({}, env, member);
  assert.equal(result.success, false);
  assert.equal(result.code, 'EXCHANGE_ZONE_ACCESS_DENIED');
  assert.equal(env.calls.length, 0);
}

const row = {
  post_handle: 'post_opaque_demo',
  title: '尋找合作夥伴',
  body: '希望認識中小企業顧問，一起交流 LINE 行銷服務。',
  contact_tags_json: '["合作邀約","LINE行銷","超過三個","不應出現"]',
  published_at: '2026-08-13 08:00:00',
  author_name: '測試會員',
  author_avatar_url: 'https://example.com/avatar.png',
  card_available: 1,
  card_name: '測試會員',
  card_company_name: '測試公司',
  card_title: '顧問',
  card_image_url: 'https://example.com/card.png',
  author_user_id: 'U_MUST_NOT_LEAK',
  card_row_id: 'CARD_MUST_NOT_LEAK',
  post_id: 99
};

{
  const env = fakeEnv({ mode: 'private', privateTesterIds: 'U_OWNER', rows: [row] });
  const result = await ExchangeZoneModule.list({ limit: 999 }, env, admin);
  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  assert.equal(result.posts[0].postHandle, 'post_opaque_demo');
  assert.equal(result.posts[0].contactTags.length, 3);
  assert.equal(result.posts[0].cardAvailable, true);
  assert.equal('body' in result.posts[0], false);
  assert.equal('authorUserId' in result.posts[0], false);
  assert.equal('cardRowId' in result.posts[0], false);
  assert.equal('postId' in result.posts[0], false);
  assert.match(env.calls[0].sql, /p\.status = 'published'/);
  assert.match(env.calls[0].sql, /LOWER\(COALESCE\(c\.source_type/);
  assert.match(env.calls[0].sql, /LOWER\(COALESCE\(c\.visibility/);
  assert.deepEqual(env.calls[0].bindings, [50]);
}

{
  const env = fakeEnv({ mode: 'open', first: row });
  const result = await ExchangeZoneModule.get({ postHandle: 'post_opaque_demo' }, env, member);
  assert.equal(result.success, true);
  assert.equal(result.post.body, row.body);
  assert.deepEqual(result.post.card, {
    name: '測試會員',
    companyName: '測試公司',
    title: '顧問',
    imageUrl: 'https://example.com/card.png'
  });
  assert.deepEqual(env.calls[0].bindings, ['post_opaque_demo']);
  assert.match(env.calls[0].sql, /p\.post_handle = \?1 AND p\.status = 'published'/);
}

{
  const env = fakeEnv({ mode: 'open' });
  const result = await ExchangeZoneModule.get({}, env, member);
  assert.equal(result.success, false);
  assert.equal(env.calls.length, 0);
}

console.log('Exchange zone access, privacy, feed and detail tests passed.');
