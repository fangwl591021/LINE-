import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { enrichCardHarvestMatches, harvestMatchIntentContext, harvestMatchCandidateSnapshot } from '../worker/card-harvest-match.mjs';
import { isRewardOnlyRole } from '../worker/reward-only-cashier.mjs';
import { restoreCollectionHistory, scoreNewCollectionMatches } from '../worker/collection-match-history.mjs';

const source = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');
const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), OLD_A = 'U' + 'c'.repeat(32);
const INTENT = { offer: 'AI 顧問', seek: '日本經銷商', collaboration: '共同開發' };
const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const plain = value => JSON.parse(JSON.stringify(value));

function object(name) {
  const found = source.match(new RegExp(`^const ${name} = \\{[\\s\\S]*?^\\};`, 'm'));
  assert.ok(found, `actual ${name} exists`);
  return found[0];
}

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(`CREATE TABLE card_contacts (
    row_id TEXT PRIMARY KEY, name TEXT DEFAULT '', company_name TEXT DEFAULT '', title TEXT DEFAULT '',
    owner_user_id TEXT DEFAULT '', creator_id TEXT DEFAULT '', line_id TEXT DEFAULT '', profile_user_id TEXT DEFAULT '',
    scanner_user_id TEXT DEFAULT '', source_type TEXT DEFAULT 'private_import', visibility TEXT DEFAULT 'private',
    archived_at TEXT DEFAULT '', custom_config TEXT DEFAULT '{}', pool_eligible INTEGER DEFAULT 0,
    ai_review_status TEXT DEFAULT '', services TEXT DEFAULT '', notes TEXT DEFAULT '', tags TEXT DEFAULT '',
    personality TEXT DEFAULT '', hobbies TEXT DEFAULT '', wealth TEXT DEFAULT '', health TEXT DEFAULT '', career TEXT DEFAULT '',
    fate_analysis_status TEXT DEFAULT 'completed', created_at TEXT DEFAULT '2026-09-01 10:00:00',
    updated_at TEXT DEFAULT '2026-09-01 10:00:00'
  ); CREATE TABLE users (row_id TEXT, line_id TEXT PRIMARY KEY, role TEXT DEFAULT 'user', network_id TEXT DEFAULT 'admin',
    referrer_id TEXT DEFAULT '',name TEXT DEFAULT '',phone TEXT DEFAULT '');`);
  sql.exec(readFileSync(new URL('../migrations/0027_incremental_matchmaking_cache.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0028_card_uploader_match_queue.sql', import.meta.url), 'utf8'));
  sql.prepare('INSERT INTO users(row_id,line_id) VALUES(?,?)').run('row-a', A);
  sql.prepare('INSERT INTO users(row_id,line_id) VALUES(?,?)').run('row-b', B);
  const reads = [], forbidden = [], fail = new Set();
  const reject = what => { forbidden.push(what); throw new Error('Forbidden side effect: ' + what); };
  const env = { ACTMASTER_DB: { prepare(query) {
    const statement = args => ({
      bind(...values) { return statement(values); },
      async first() {
        assert.match(query.trim(), /^SELECT\b/i);
        reads.push({ query, args });
        if ([...fail].some(part => query.includes(part))) throw new Error('Simulated read failure');
        return sql.prepare(query).get(...args) || null;
      },
      async all() {
        assert.match(query.trim(), /^SELECT\b/i);
        reads.push({ query, args });
        if ([...fail].some(part => query.includes(part))) throw new Error('Simulated read failure');
        return { success: true, results: sql.prepare(query).all(...args) };
      },
      async run() { return reject('D1 mutation'); }
    });
    return statement([]);
  }, batch() { return reject('D1 batch'); }, exec() { return reject('D1 exec'); } },
    ACTMASTER_KV: { put() { return reject('KV write'); }, delete() { return reject('KV delete'); } }
  };
  const context = { TextEncoder, crypto: webcrypto, console: { log() {}, warn() {}, error() {} },
    enrichCardHarvestMatches, restoreCollectionHistory, scoreNewCollectionMatches, isRewardOnlyRole, fetch() { return reject('network'); }
  };
  vm.createContext(context);
  vm.runInContext([object('ACTION_POLICIES'), object('SecurityModule'), object('AIModule'), object('D1ReadModule'),
    'globalThis.modules={SecurityModule,AIModule,D1ReadModule};'].join('\n'), context);
  const { SecurityModule: security, AIModule: match, D1ReadModule: read } = context.modules;
  read.cardAccessSchemaReady = true; // Production already has the schema; no runtime migration is part of this feature.
  read.identityIdsForUser = async (_env, id) => id === A ? [A, OLD_A] : [id];
  read.findUserByIdentity = async (_env, id) => ({user: sql.prepare('SELECT * FROM users WHERE line_id=?').get(id)});
  security.getLineUserIdFromToken = async token => token === 'token-a' ? A : token === 'token-b' ? B : '';
  security.checkRateLimit = () => reject('AI quota');
  match.callOpenAI = () => reject('OpenAI');
  match.matchmaking = () => reject('new match');
  match.saveIncrementalMatchCache = () => reject('cache write');
  const dispatch = source.match(/^async function dispatchAction\([\s\S]*?^}/m);
  assert.ok(dispatch);
  vm.runInContext(dispatch[0] + '\nglobalThis.dispatch=dispatchAction;', context);

  function insertCard(id, values = {}) {
    const row = {row_id: id, name: id, owner_user_id: A, creator_id: A, scanner_user_id: A, ...values};
    const keys = Object.keys(row);
    sql.prepare(`INSERT INTO card_contacts(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map(key => row[key]));
    return id;
  }
  const self = (intent = INTENT, values = {}) => insertCard('SELF', {
    line_id: A, profile_user_id: A, scanner_user_id: '', source_type: 'self_profile',
    custom_config: JSON.stringify({ businessIntent: intent }), ...values
  });
  const dto = id => read.cardRow(sql.prepare('SELECT * FROM card_contacts WHERE row_id=?').get(id));
  async function cache(id, options = {}) {
    const ctx = harvestMatchIntentContext(options.intent || INTENT);
    const hash = options.intentHash || await match.matchmakingDigest(ctx.digestInput);
    const version = options.version || await match.matchmakingDigest(harvestMatchCandidateSnapshot(dto(id), match));
    sql.prepare(`INSERT INTO ai_match_pair_cache(requester_user_id,pool_scope,intent_hash,candidate_card_row_id,candidate_version,score,reason,result_source,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(options.user || A, options.scope || 'own', hash, id, version,
      options.score ?? 85, options.reason || '可以合作拓展日本市場', options.source || 'ai', options.updatedAt || '2026-09-18 01:00:00');
    return { hash, version };
  }
  function job(id, status, user = A) {
    sql.prepare('INSERT INTO card_uploader_match_jobs(job_id,card_row_id,owner_user_id,status) VALUES(?,?,?,?)')
      .run('JOB_' + id, id, user, status);
  }
  async function load(payload = {}, token = 'token-a') {
    const request = new Request('https://local.invalid/', {headers: token ? {Authorization: 'Bearer ' + token} : {}});
    return context.dispatch('getCardHarvestContacts', {userId: A, ...payload}, request, env);
  }
  return { sql, env, reads, forbidden, fail, match, read, insertCard, self, dto, cache, job, load, dispatch:context.dispatch };
}

test('new refresh action rejects tokenless/spoofed actor without D1 fallback or AI',async t=>{
  const f=fixture(t);
  const request=new Request('https://local.invalid/');
  const result=await f.dispatch('refreshCardHarvestMatches',{userId:A,authenticatedUserId:A,actor:{userId:A,token:'token-a'}},request,f.env);
  assert.equal(result.success,false);assert.match(result.error,/Token/);assert.deepEqual(f.forbidden,[]);
});

test('real refresh dispatch reuses old score without quota or model call',async t=>{
  const f=fixture(t);f.self({});f.insertCard('OLD');await f.cache('OLD');
  const result=await f.dispatch('refreshCardHarvestMatches',{userId:B},new Request('https://local.invalid/',{headers:{Authorization:'Bearer token-a'}}),f.env);
  assert.equal(result.success,true);assert.equal(result.data.processed,0);assert.equal(result.data.cards[0].aiMatch.score,85);assert.deepEqual(f.forbidden,[]);
});

test('verified collection returns existing AI and rule results with real zero and no mutations', async t => {
  const f = fixture(t); f.self(); f.insertCard('CARD_AI'); f.insertCard('CARD_RULE');
  await f.cache('CARD_AI'); await f.cache('CARD_RULE', {score: 0, source: 'rules'});
  const before = f.sql.prepare('SELECT total_changes() n').get().n;
  const result = await f.load();
  assert.equal(result.success, true); assert.equal(result.data.length, 2);
  const ai = result.data.find(card => card.rowId === 'CARD_AI').aiMatch;
  assert.deepEqual(plain(ai), {status: 'completed', score: 85, reason: '可以合作拓展日本市場', source: 'ai',
    updatedAt: '2026-09-18 01:00:00', intentKey: JSON.stringify({offer: 'ai 顧問', seek: '日本經銷商', collaboration: '共同開發'})});
  const rule = result.data.find(card => card.rowId === 'CARD_RULE').aiMatch;
  assert.equal(rule.score, 0); assert.equal(rule.source, 'rules'); assert.equal(rule.status, 'completed');
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n, before);
  assert.deepEqual(f.forbidden, []);
});

test('same-actor historical scores survive; other requesters and public pool cannot supply them', async t => {
  const f = fixture(t); f.self(); f.insertCard('CARD');
  await f.cache('CARD', {user: B, score: 99}); await f.cache('CARD', {scope: 'public', score: 98});
  await f.cache('CARD', {intent: {...INTENT, seek: '舊需求'}, score: 97});
  await f.cache('CARD', {intentHash: 'arbitrary-query-history', score: 96});
  const result = (await f.load()).data[0].aiMatch;
  assert.equal(result.status, 'completed'); assert.ok([96,97].includes(result.score)); assert.equal(result.basis, 'previous');
  f.sql.prepare("DELETE FROM ai_match_pair_cache WHERE requester_user_id=? AND pool_scope='own'").run(A);
  assert.equal((await f.load()).data[0].aiMatch.score, null);
});

test('changed candidate retains historical percentage and labels its basis', async t => {
  const f = fixture(t); f.self(); f.insertCard('CARD'); await f.cache('CARD');
  f.sql.prepare('UPDATE card_contacts SET custom_config=? WHERE row_id=?').run(JSON.stringify({businessIntent: {offer: '新服務'}}), 'CARD');
  const result = (await f.load()).data[0].aiMatch;
  assert.equal(result.status, 'completed'); assert.equal(result.score, 85); assert.equal(result.basis, 'previous');
});

test('changed own intent cannot hide existing score and client cannot override it', async t => {
  const f = fixture(t); f.self(); f.insertCard('CARD'); await f.cache('CARD');
  f.sql.prepare('UPDATE card_contacts SET custom_config=? WHERE row_id=?').run(JSON.stringify({businessIntent: {seek: '新市場'}}), 'SELF');
  const result = (await f.load({businessIntent: INTENT, intentHash: 'spoof'})).data[0].aiMatch;
  assert.equal(result.status, 'completed'); assert.equal(result.score, 85);
  assert.equal(result.basis, 'previous'); assert.equal(result.intentKey, '');
});

test('payload spoofing cannot grant a score on tokenless or invalid-token D1 fallback', async t => {
  const f = fixture(t); f.self(); f.insertCard('CARD'); await f.cache('CARD');
  const spoof = {authenticatedUserId: A, verifiedActor: {userId: A, token: 'token-a'}, actor: {userId: A, token: 'token-a'},
    allowMatchRead: true, lineAccessToken: 'invalid', authenticatedRole: 'admin'};
  for (const token of ['', 'invalid']) {
    const result = await f.load(spoof, token);
    assert.equal(result.success, true); assert.equal(result.data.length, 1);
    assert.equal(result.data[0].aiMatch.status, 'needs_login');
    assert.equal(result.data[0].aiMatch.score, null); assert.equal(result.data[0].aiMatch.intentKey, '');
  }
  assert.equal(f.reads.filter(entry => /ai_match_pair_cache|SELECT custom_config/.test(entry.query)).length, 0);
});

test('valid token actor overrides another user ID or role supplied in JSON', async t => {
  const f = fixture(t); f.self(); f.insertCard('CARD_A'); f.insertCard('CARD_B', {owner_user_id: B, creator_id: B, scanner_user_id: B});
  await f.cache('CARD_A'); await f.cache('CARD_B', {user: B, score: 99});
  const result = await f.load({userId: B, authenticatedUserId: B, authenticatedRole: 'admin'});
  assert.deepEqual(result.data.map(card => card.rowId), ['CARD_A']); assert.equal(result.data[0].aiMatch.score, 85);
});

test('another person claimed from this collector cannot become the collector business intent', async t => {
  const f = fixture(t); f.insertCard('CLAIMED', {line_id: B, owner_user_id: B, profile_user_id: B, source_type: 'self_profile',
    custom_config: JSON.stringify({businessIntent: INTENT})});
  await f.cache('CLAIMED');
  const result = await f.load();
  assert.equal(result.data.length, 1); assert.equal(result.data[0].rowId, 'CLAIMED');
  assert.equal(result.data[0].aiMatch.status, 'completed'); assert.equal(result.data[0].aiMatch.score, 85);
  assert.equal(result.data[0].aiMatch.basis, 'previous');
});

test('real self intent wins over newer claimed, archived, private, or conflicting-owner records', async t => {
  const f = fixture(t); f.self(); f.insertCard('CARD'); await f.cache('CARD');
  const bad = {custom_config: JSON.stringify({businessIntent: {seek: '不應使用'}}), updated_at: '2027-01-01 00:00:00'};
  f.insertCard('CLAIMED', {...bad, source_type: 'self_profile', owner_user_id: B, line_id: B, profile_user_id: B});
  f.insertCard('ARCHIVED', {...bad, source_type: 'self_profile', line_id: A, archived_at: '2026-09-10'});
  f.insertCard('CONFLICT', {...bad, source_type: 'self_profile', line_id: A, owner_user_id: B});
  f.insertCard('PRIVATE', bad);
  const result = (await f.load()).data.find(card => card.rowId === 'CARD').aiMatch;
  assert.equal(result.score, 85); assert.equal(result.status, 'completed');
});

test('verified identity aliases can resolve the real self card but do not read other requester cache', async t => {
  const f = fixture(t); f.self(INTENT, {line_id: OLD_A, profile_user_id: OLD_A, owner_user_id: OLD_A});
  f.insertCard('CARD'); await f.cache('CARD', {user: OLD_A, score: 99});
  assert.equal((await f.load()).data[0].aiMatch.score, null);
  await f.cache('CARD'); assert.equal((await f.load()).data[0].aiMatch.score, 85);
});

test('missing or malformed own intent permits new-card eligibility but reads never start AI', async t => {
  for (const config of ['{}', '{invalid', '{"businessIntent":{"offer":"　 ","seek":""}}']) {
    const f = fixture(t); f.self(); f.insertCard('CARD');
    f.sql.prepare('UPDATE card_contacts SET custom_config=? WHERE row_id=?').run(config, 'SELF');
    const result = (await f.load()).data[0].aiMatch;
    assert.equal(result.status, 'pending'); assert.equal(result.score, null); assert.equal(result.autoEligible, true);
    assert.equal(f.reads.filter(entry => /ai_match_pair_cache/.test(entry.query)).length, 1);
    assert.deepEqual(f.forbidden, []);
  }
});

test('job states are batch-read for the actor and missing data does not imply fake zero', async t => {
  const f = fixture(t); f.self();
  for (const status of ['pending', 'waiting_tags', 'waiting_intent', 'leased', 'completed', 'failed', 'cancelled']) {
    f.insertCard(status); f.job(status, status);
  }
  f.insertCard('OTHER_JOB'); f.job('OTHER_JOB', 'pending', B);
  const result = await f.load();
  for (const card of result.data) {
    const expected = 'pending';
    assert.equal(card.aiMatch.status, expected); assert.equal(card.aiMatch.score, null);
  }
  assert.equal(f.reads.filter(entry => /FROM card_uploader_match_jobs/.test(entry.query)).length, 1);
});

test('missing cache table and auxiliary read errors preserve the collection', async t => {
  const f = fixture(t); f.self(); f.insertCard('CARD');
  f.sql.exec('DROP TABLE ai_match_pair_cache');
  let result = await f.load();
  assert.equal(result.success, true); assert.equal(result.data.length, 1); assert.equal(result.data[0].aiMatch.status, 'unavailable');
  f.fail.add('SELECT custom_config'); result = await f.load();
  assert.equal(result.data.length, 1); assert.equal(result.data[0].aiMatch.status, 'unavailable');
});

test('missing job table never hides an already valid score', async t => {
  const f = fixture(t); f.self(); f.insertCard('CARD'); await f.cache('CARD');
  f.sql.exec('DROP TABLE card_uploader_match_jobs');
  assert.equal((await f.load()).data[0].aiMatch.score, 85);
});

test('invalid score and unknown provenance are unavailable, not AI zero', async t => {
  const f = fixture(t); f.self();
  for (const [id, score, origin] of [['EMPTY', '', 'ai'], ['NAN', 'NaN', 'ai'], ['NEGATIVE', -1, 'ai'],
    ['OVER', 101, 'ai'], ['UNKNOWN', 88, 'unknown']]) {
    f.insertCard(id); await f.cache(id, {score, source: origin});
  }
  const result = await f.load();
  assert.ok(result.data.every(card => card.aiMatch.score === null && card.aiMatch.status === 'pending'));
});

test('200 or 500 cards add only four bounded SELECTs including history, never per-card SQL', async t => {
  const f = fixture(t); f.self();
  for (let i = 0; i < 500; i++) f.insertCard('CARD_' + i);
  for (const limit of [200, 500]) {
    f.reads.length = 0;
    const result = await f.load({limit});
    assert.equal(result.data.length, limit);
    const additional = f.reads.filter(entry => /SELECT custom_config|FROM ai_match_pair_cache|FROM card_uploader_match_jobs/.test(entry.query));
    assert.equal(additional.length, 4);
    assert.ok(additional.every(entry => entry.args.length <= 3));
    assert.ok(additional.filter(entry => /_cache|_jobs/.test(entry.query)).every(entry => /LIMIT 500/.test(entry.query)));
    assert.deepEqual(f.forbidden, []);
  }
});

test('empty collections do not query intent, cache or jobs', async t => {
  const f = fixture(t); f.self();
  const result = await f.load(); assert.equal(result.data.length, 0);
  assert.equal(f.reads.filter(entry => /SELECT custom_config|ai_match_pair_cache|card_uploader_match_jobs/.test(entry.query)).length, 0);
});

test('legacy digest inputs retain old formatting, normalization and candidate business intent', async t => {
  const f = fixture(t);
  const intent = {offer: ' ＡＩ  顧問 ', seek: '日本\n經銷商', collaboration: '  CO-SELL '};
  const legacyIntent = {offer: intent.offer.trim(), seek: intent.seek.trim(), collaboration: intent.collaboration.trim()};
  const query = ['我可以提供：' + legacyIntent.offer, '我正在尋找：' + legacyIntent.seek,
    '我希望合作：' + legacyIntent.collaboration].join('；');
  const oldInput = {version: 'incremental-v1', query: normalize(query), offer: normalize(legacyIntent.offer),
    seek: normalize(legacyIntent.seek), collaboration: normalize(legacyIntent.collaboration)};
  assert.deepEqual(harvestMatchIntentContext(intent).digestInput, oldInput);
  const digest = await f.match.matchmakingDigest(oldInput);
  assert.equal(await f.match.matchmakingDigest(harvestMatchIntentContext(intent).digestInput), digest);
  assert.equal(digest, '994d45682e1c038e79cc7d1fdc707f09f43bba5a676640bd93ab4dca63459cba');
  f.insertCard('CARD_GOLDEN', {name: '測試候選人', company_name: '測試公司', title: '經理',
    services: '通路合作', personality: '穩健', career: '行銷', custom_config: JSON.stringify({businessIntent: intent})});
  const card = f.dto('CARD_GOLDEN');
  const contact = f.match.matchContactFromCard(card);
  contact.BusinessIntent = ['可提供:' + intent.offer.trim(), '正在尋找:' + intent.seek.trim(),
    '合作方式:' + intent.collaboration.trim()].join('；');
  const oldCandidate = f.match.matchmakingCandidateSnapshot(contact);
  assert.deepEqual(plain(harvestMatchCandidateSnapshot(card, f.match)), plain(oldCandidate));
  const candidateDigest = await f.match.matchmakingDigest(oldCandidate);
  assert.equal(candidateDigest, '0568acafba16249d8ab953f341064cb675ea64a73a6425243425aafa5ff36e7d');
});

test('direct resolver calls cannot use payload actor flags or a mismatched trusted actor', async t => {
  const f = fixture(t); f.self(); f.insertCard('CARD'); await f.cache('CARD');
  const payload = {authenticatedUserId: A, actor: {userId: A, token: 'token-a'}, verifiedActor: {userId: A, token: 'token-a'}};
  for (const actor of [null, {userId: B, token: 'token-b'}, {userId: A, token: 'token-a', source: 'd1_identity_fallback'}]) {
    const result = await f.read.getCardHarvestContacts(payload, f.env, actor);
    assert.equal(result.data[0].aiMatch.status, 'needs_login');
    assert.equal(result.data[0].aiMatch.score, null);
  }
});

test('claimed collections retain existing visibility while foreign and referral cards stay excluded', async t => {
  const f = fixture(t); f.self();
  f.insertCard('CLAIMED', {line_id: B, owner_user_id: B, profile_user_id: B, source_type: 'self_profile'});
  f.insertCard('OTHER', {owner_user_id: B, creator_id: B, scanner_user_id: B});
  f.insertCard('REFERRAL', {source_type: 'referral_placeholder'});
  await f.cache('CLAIMED');
  const result = await f.load();
  assert.deepEqual(result.data.map(card => card.rowId), ['CLAIMED']);
  assert.equal(result.data[0].ownerUserId, B); assert.equal(result.data[0].scannerUserId, A);
  assert.equal(result.data[0].aiMatch.score, 85);
  assert.equal(f.sql.prepare('SELECT owner_user_id FROM card_contacts WHERE row_id=?').get('CLAIMED').owner_user_id, B);
});

test('archived cards never gain a new visible match score', async t => {
  const f = fixture(t); f.self(); f.insertCard('ARCHIVED', {archived_at: '2026-09-10'}); await f.cache('ARCHIVED');
  const result = await f.load();
  // Do not change the pre-existing list contract; only suppress score enrichment.
  assert.equal(result.data.length, 1); assert.equal(result.data[0].aiMatch.status, 'unavailable');
  assert.equal(result.data[0].aiMatch.score, null);
});
