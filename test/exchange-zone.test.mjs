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
            if (options.failExpires && sql.includes('p.expires_at')) throw new Error('D1_ERROR: no such column: p.expires_at');
            return { results: options.rows || [] };
          },
          async first() {
            if (options.failExpires && sql.includes('p.expires_at')) throw new Error('D1_ERROR: no such column: p.expires_at');
            if (sql.includes('FROM card_contacts c')) {
              const source = options.card || options.first || options.rows?.[0] || null;
              return source ? {
                row_id: source.card_row_id || source.row_id,
                name: source.card_name || source.name,
                company_name: source.card_company_name || source.company_name,
                title: source.card_title || source.title,
                image_url: source.card_image_url || source.image_url
              } : null;
            }
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
  mode: 'private',
  allowed: false,
  canManage: false,
  canPublish: false,
  publishCost: 10,
  publishDays: 7,
  contactTags: ['合作邀約', '商品服務', '活動邀請', '人才交流', '其他']
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
  assert.match(env.calls[0].sql, /p\.expires_at/);
  assert.match(env.calls[1].sql, /LOWER\(COALESCE\(c\.source_type/);
  assert.match(env.calls[1].sql, /LOWER\(COALESCE\(c\.visibility/);
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
  assert.deepEqual(env.calls[1].bindings, ['CARD_MUST_NOT_LEAK', 'U_MUST_NOT_LEAK']);
  assert.match(env.calls[0].sql, /p\.post_handle = \?1 AND p\.status = 'published'/);
  assert.match(env.calls[0].sql, /p\.expires_at/);
}

{
  const env = fakeEnv({ mode: 'open' });
  const result = await ExchangeZoneModule.get({}, env, member);
  assert.equal(result.success, false);
  assert.equal(env.calls.length, 0);
}

{
  const env = fakeEnv({ mode: 'private', privateTesterIds: 'U_OWNER', rows: [row], failExpires: true });
  const result = await ExchangeZoneModule.list({ limit: 10 }, env, admin);
  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  assert.equal(env.calls.length, 3);
  assert.match(env.calls[0].sql, /p\.expires_at/);
  assert.doesNotMatch(env.calls[1].sql, /p\.expires_at/);
}

{
  const env = fakeEnv({ mode: 'open', first: row, failExpires: true });
  const result = await ExchangeZoneModule.get({ postHandle: 'post_opaque_demo' }, env, member);
  assert.equal(result.success, true);
  assert.equal(result.post.postHandle, 'post_opaque_demo');
  assert.equal(env.calls.length, 3);
  assert.doesNotMatch(env.calls[1].sql, /p\.expires_at/);
}

function publishEnv(options = {}) {
  const operations = [];
  const posts = [];
  const calls = [];
  const execute = async (call) => {
    const normalized = call.sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('INSERT INTO exchange_zone_publish_operations')) {
      if (operations.some((row) => row.author_user_id === call.bindings[2] && row.idempotency_key === call.bindings[1])) {
        throw new Error('unique');
      }
      operations.push({
        operation_id: call.bindings[0],
        idempotency_key: call.bindings[1],
        author_user_id: call.bindings[2],
        post_handle: call.bindings[3],
        state: 'reserved'
      });
    } else if (normalized.startsWith('INSERT INTO exchange_zone_posts')) {
      posts.push({
        post_handle: call.bindings[0],
        author_user_id: call.bindings[1],
        title: call.bindings[2],
        body: call.bindings[3],
        contact_tags_json: call.bindings[4],
        attach_card: call.bindings[5],
        expires_at: call.bindings[6],
        point_cost: call.bindings[7],
        publish_operation_id: call.bindings[8],
        status: 'draft'
      });
    } else if (normalized.startsWith('UPDATE exchange_zone_publish_operations')) {
      const operation = operations.find((row) => row.operation_id === call.bindings.at(-1));
      if (operation) operation.state = normalized.includes("SET state = 'published'") ? 'published' : call.bindings[0];
    } else if (normalized.startsWith('UPDATE exchange_zone_posts')) {
      const post = posts.find((row) => row.publish_operation_id === call.bindings[0]);
      if (post) post.status = 'published';
    }
    return { success: true, meta: { changes: 1 } };
  };
  const db = {
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        call,
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async first() {
          if (sql.includes('exchange_zone_publish_operations')) {
            if (options.missingPublishSchema) throw new Error('D1_ERROR: no such table: exchange_zone_publish_operations');
            return operations.find((row) => row.author_user_id === call.bindings[0] && row.idempotency_key === call.bindings[1]) || null;
          }
          return null;
        },
        async run() {
          return execute(call);
        }
      };
    },
    async batch(statements) {
      if (options.failBatch) throw new Error('batch failed');
      for (const statement of statements) await execute(statement.call);
      return statements.map(() => ({ success: true }));
    }
  };
  return {
    EXCHANGE_ZONE_ACCESS_MODE: 'private',
    EXCHANGE_ZONE_PRIVATE_TESTER_IDS: 'U_OWNER',
    ACTMASTER_DB: db,
    operations,
    posts,
    calls
  };
}

function pointsService(balance = 100, options = {}) {
  const adjustments = [];
  return {
    adjustments,
    async balance() {
      return { success: true, balance };
    },
    async adjust(userId, points, context) {
      adjustments.push({ userId, points, context });
      if (points < 0 && options.throwDebit) throw new Error('network result unknown');
      if (points < 0 && options.failDebit) return { success: false, error: 'debit failed' };
      if (points > 0 && options.failCredit) return { success: false, error: 'credit failed' };
      return { success: true, data: { accepted: true } };
    }
  };
}

const publishPayload = {
  title: '尋找合作夥伴',
  body: '希望認識中小企業顧問，一起交流服務。',
  contactTags: ['合作邀約', '商品服務', '不接受的標籤'],
  attachMyCard: true,
  idempotencyKey: 'exchange_test_key_0001'
};

{
  const env = publishEnv({ missingPublishSchema: true });
  const points = pointsService(100);
  const result = await ExchangeZoneModule.publish(publishPayload, env, admin, points);
  assert.equal(result.code, 'EXCHANGE_ZONE_MIGRATION_REQUIRED');
  assert.match(result.error, /0022 migration/);
  assert.equal(points.adjustments.length, 0);
}

{
  const env = publishEnv();
  const points = pointsService(5);
  const result = await ExchangeZoneModule.publish(publishPayload, env, admin, points);
  assert.equal(result.code, 'INSUFFICIENT_POINTS');
  assert.equal(points.adjustments.length, 0);
  assert.equal(env.posts[0].status, 'draft');
  assert.equal(env.operations[0].state, 'failed');
}

{
  const env = publishEnv();
  const points = pointsService(100);
  const result = await ExchangeZoneModule.publish(publishPayload, env, admin, points);
  assert.equal(result.success, true);
  assert.equal(result.chargedPoints, 10);
  assert.equal(points.adjustments.length, 1);
  assert.equal(points.adjustments[0].points, -10);
  assert.equal(env.posts[0].status, 'published');
  assert.deepEqual(JSON.parse(env.posts[0].contact_tags_json), ['合作邀約', '商品服務']);
  assert.equal(env.posts[0].point_cost, 10);
  assert.equal(env.operations[0].state, 'published');
  assert.equal('operationId' in result, false);

  const duplicate = await ExchangeZoneModule.publish(publishPayload, env, admin, points);
  assert.equal(duplicate.success, true);
  assert.equal(duplicate.alreadyPublished, true);
  assert.equal(duplicate.chargedPoints, 0);
  assert.equal(points.adjustments.length, 1);
}

{
  const env = publishEnv({ failBatch: true });
  const points = pointsService(100);
  const result = await ExchangeZoneModule.publish({ ...publishPayload, idempotencyKey: 'exchange_test_key_0002' }, env, admin, points);
  assert.equal(result.code, 'EXCHANGE_PUBLISH_REFUNDED');
  assert.deepEqual(points.adjustments.map((entry) => entry.points), [-10, 10]);
  assert.equal(env.posts[0].status, 'draft');
  assert.equal(env.operations[0].state, 'compensated');
}

{
  const env = publishEnv();
  const points = pointsService(100);
  const result = await ExchangeZoneModule.publish(publishPayload, env, member, points);
  assert.equal(result.code, 'EXCHANGE_ZONE_ACCESS_DENIED');
  assert.equal(points.adjustments.length, 0);
}

{
  const env = publishEnv();
  const points = pointsService(100, { throwDebit: true });
  const result = await ExchangeZoneModule.publish({ ...publishPayload, idempotencyKey: 'exchange_test_key_0003' }, env, admin, points);
  assert.equal(result.code, 'POINT_DEBIT_UNCERTAIN');
  assert.deepEqual(points.adjustments.map((entry) => entry.points), [-10]);
  assert.equal(env.operations[0].state, 'debit_uncertain');
  const duplicate = await ExchangeZoneModule.publish({ ...publishPayload, idempotencyKey: 'exchange_test_key_0003' }, env, admin, points);
  assert.equal(duplicate.code, 'EXCHANGE_PUBLISH_NOT_RETRYABLE');
  assert.equal(points.adjustments.length, 1);
}

console.log('Exchange zone access, privacy, feed, detail and 10-point publish tests passed.');
