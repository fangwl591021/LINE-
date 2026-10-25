// Actual LineOAChatModule.monitor + projection inside Workerd/D1. No LINE, wallet or point calls.
const assert = require('node:assert/strict'), { readFileSync } = require('node:fs'), { resolve } = require('node:path'), { createHash } = require('node:crypto');
const { Miniflare } = require(process.env.LISTING_MINIFLARE_MODULE), { build } = require(process.env.LISTING_ESBUILD_MODULE);
const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), C = 'U' + 'c'.repeat(32);
const uuid = n => '00000000-0000-4000-8000-' + n.toString(16).padStart(12, '0');
const messageId = n => 'CHECKIN_MALL:' + uuid(n);
const iso = value => new Date(value).toISOString(), epoch = value => Date.parse(value);
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tables = `
CREATE TABLE line_oa_threads(thread_id TEXT PRIMARY KEY,user_id TEXT,source_type TEXT,display_name TEXT DEFAULT '',picture_url TEXT DEFAULT '',last_message_text TEXT DEFAULT '',last_message_type TEXT DEFAULT 'text',last_event_type TEXT DEFAULT 'message',message_count INTEGER DEFAULT 0,unread_count INTEGER DEFAULT 0,status TEXT DEFAULT 'open',tags TEXT DEFAULT '',note TEXT DEFAULT '',opportunity_stage TEXT DEFAULT 'new',opportunity_value INTEGER DEFAULT 0,opportunity_note TEXT DEFAULT '',ai_paused INTEGER DEFAULT 0,last_event_at TEXT,created_at TEXT DEFAULT '',updated_at TEXT);
CREATE TABLE line_oa_messages(message_id TEXT PRIMARY KEY,thread_id TEXT,user_id TEXT,direction TEXT,message_type TEXT,text_content TEXT,event_type TEXT,reply_token TEXT DEFAULT '',raw_json TEXT DEFAULT '{}',created_at TEXT);
CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,points INTEGER,status TEXT);
CREATE TABLE point_awards(id TEXT PRIMARY KEY,user_id TEXT,points INTEGER,status TEXT);
CREATE TABLE audit_ledger(id TEXT PRIMARY KEY,points INTEGER,status TEXT);
INSERT INTO users VALUES('SYNTHETIC_MEMBER','${A}',333,'unchanged');
INSERT INTO point_awards VALUES('SYNTHETIC_AWARD','${A}',10,'completed');
INSERT INTO audit_ledger VALUES('SYNTHETIC_LEDGER',333,'settled');`;
async function snapshot(db) {
  const names = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND substr(name,1,4)!='_cf_' ORDER BY name").all()).results;
  const out = {};
  for (const { name } of names) {
    // Preserve both value and SQLite type without asking D1 to serialize an
    // intentionally corrupt 64-bit balance into an unsafe JavaScript integer.
    const columns = name === 'checkin_mall_cards' ? 'id,event_id,recipient_uid,taipei_day,created_at,state,retry_key,CAST(balance AS TEXT) AS balance,typeof(balance) AS balance_type,accepted_at' : '*';
    out[name] = (await db.prepare('SELECT ' + columns + ' FROM ' + name + ' ORDER BY rowid').all()).results;
  }
  return sha(out);
}
async function setup(mf, mode) {
  const db = await mf.getD1Database('ACTMASTER_DB');
  for (const sql of tables.split(';').map(v => v.trim()).filter(Boolean)) await db.exec(sql.replace(/\s+/g, ' ') + ';');
  if (mode !== 'missing-table') for (const sql of readFileSync('migrations/0063_checkin_mall_cards.sql', 'utf8').replace(/--[^\n]*/g, '').split(';').map(v => v.trim()).filter(Boolean)) await db.exec(sql.replace(/\s+/g, ' ') + ';');
  const thread = async (id, uid, type, count, unread = 7) => db.prepare("INSERT INTO line_oa_threads(thread_id,user_id,source_type,display_name,last_message_text,message_count,unread_count,status,note,opportunity_note,opportunity_value,ai_paused,last_event_at,updated_at) VALUES(?,?,?,'合成會員','既有訊息',?,?,'waiting','KEEP_NOTE','KEEP_OPPORTUNITY',123,1,'2026-10-25 03:00:00','2026-10-25 03:00:00')").bind(id, uid, type, count, unread).run();
  const physical = async (id, uid, at, content = '既有實體訊息', target = 'line:' + uid) => db.prepare("INSERT INTO line_oa_messages VALUES(?,?,?,'outbound','text',?,'message','REPLY_TOKEN_DO_NOT_EXPOSE','{\"private\":\"RAW_JSON_DO_NOT_EXPOSE\"}',?)").bind(id, target, uid, content, at).run();
  const card = async (n, uid, state, at, balance = 12867, day = iso(at).slice(0, 10)) => db.prepare('INSERT INTO checkin_mall_cards VALUES(?,?,?,?,?,?,?,?,?)').bind(uuid(n), 'PRIVATE_EVENT_' + n, uid, day, at, state, 'PRIVATE_RETRY_' + n, balance, state === 'accepted' ? at : null).run();
  if (mode === 'balances') {
    await thread('line:' + A, A, 'user', 0);
    for (const [index, balance] of [0, null, -1, 1.5, 1].entries()) await card(index + 1, A, 'accepted', epoch('2026-10-01T00:00:00Z') + index * 86400000, balance);
    await db.exec("UPDATE checkin_mall_cards SET balance=1152921504606846976 WHERE id='" + uuid(5) + "'");
    return { db };
  }
  if (mode === 'latest80') {
    await thread('line:' + A, A, 'user', 100);
    const times = [];
    for (let n = 0; n < 100; n++) {
      const at = epoch('2026-07-01T00:00:00Z') + n * 86400000;
      await physical('PHYSICAL_' + n, A, iso(at)); await card(n + 1, A, 'accepted', at + 60000);
      times.push({ id: 'PHYSICAL_' + n, at }, { id: messageId(n + 1), at: at + 60000 });
    }
    return { db, expected: times.sort((a, b) => a.at - b.at).slice(-80).map(row => row.id) };
  }
  await thread('line:' + A, A, 'user', 5); await thread('line:' + B, B, 'user', 2, 3);
  await thread('group:SYNTHETIC', A, 'group', 3, 2); await thread('line:' + C, A, 'user', 1, 1);
  await physical('INBOUND_A', A, '2026-10-25 02:00:00', '會員打卡');
  await physical(messageId(2), A, '2026-10-23 03:56:00', 'PHYSICAL_SAME_ID_WINS');
  await physical('B_MESSAGE', B, '2026-10-25 02:30:00', 'ONLY_B_MESSAGE');
  if (mode !== 'missing-table') {
    await card(1, A, 'accepted', epoch('2026-10-25T03:56:00Z'));
    await card(2, A, 'accepted', epoch('2026-10-23T03:56:00Z'));
    await card(3, B, 'accepted', epoch('2026-10-24T03:56:00Z'));
    await card(4, A, 'unknown', epoch('2026-10-26T03:56:00Z'));
    await card(5, A, 'failed', epoch('2026-10-27T03:56:00Z'));
    await card(6, A, 'accepted', epoch('2026-10-22T03:56:00Z'), null);
    await card(7, C, 'accepted', epoch('2026-10-21T03:56:00Z'));
    await card(8, A, 'sending', epoch('2026-10-28T03:56:00Z'));
    await card(9, A, 'preparing', epoch('2026-10-29T03:56:00Z'));
    // Even a corrupt accepted_at must not make an unknown request accepted.
    await db.prepare('UPDATE checkin_mall_cards SET accepted_at=? WHERE id=?').bind(epoch('2026-10-26T03:56:00Z'), uuid(4)).run();
  }
  return { db };
}
(async () => {
  const source = readFileSync('workerbackup.js', 'utf8'), actual = source.match(/^const LineOAChatModule = \{[\s\S]*?^\};/m)?.[0];
  assert.ok(actual); assert.match(source, /getLineOAChatMonitor:\s*\{ access: 'admin'/); assert.match(actual, /projectCheckinMallMonitor\(env\.ACTMASTER_DB/);
  const bundle = await build({ entryPoints: ['test/fixtures/checkin-crm-monitor-runtime.mjs'], bundle: true, format: 'esm', platform: 'browser', write: false, plugins: [{ name: 'actual-line-oa-monitor', setup(builder) {
    builder.onResolve({ filter: /^actual-line-oa-monitor$/ }, () => ({ path: 'actual-line-oa-monitor', namespace: 'isolated' }));
    builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: "import {projectCheckinMallMonitor} from './checkin-mall-monitor.mjs';\nconst D1ReadModule={first:(env,sql,args)=>env.ACTMASTER_DB.prepare(sql).bind(...args).first(),all:async(env,sql,args)=>(await env.ACTMASTER_DB.prepare(sql).bind(...args).all()).results};\n" + actual + '\nexport {LineOAChatModule};', resolveDir: resolve('worker'), loader: 'js' }));
  } }] });
  for (const mode of ['basic', 'other-recipient', 'group', 'mismatched-thread', 'missing-table', 'balances', 'latest80']) {
    const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-04-23', compatibilityFlags: [], d1Databases: { ACTMASTER_DB: 'isolated-crm-monitor' }, port: 0 });
    try {
      const { db, expected } = await setup(mf, mode), before = await snapshot(db);
      const target = mode === 'other-recipient' ? 'line:' + B : mode === 'group' ? 'group:SYNTHETIC' : mode === 'mismatched-thread' ? 'line:' + C : 'line:' + A;
      const fetchView = async () => { const response = await mf.dispatchFetch('https://isolated.test/monitor', { method: 'POST', body: JSON.stringify({ threadId: target, limit: 100 }) }); assert.equal(response.status, 200); return await response.json(); };
      const views = await Promise.all(Array.from({ length: 5 }, fetchView)), { result, queryCount, networkCalls } = views[0], data = result.data;
      assert.ok(result.success); assert.equal(networkCalls, 0); assert.ok(queryCount <= 8, 'monitor uses bounded reads including an optional snapshot');
      for (const view of views) assert.deepEqual(view.result, result, 'concurrent viewing must not double-count virtual records');
      assert.equal(await snapshot(db), before, 'threads, unread, notes, physical messages, points, awards, clicks and delivery rows must remain identical');
      assert.doesNotMatch(JSON.stringify(result), /REPLY_TOKEN_DO_NOT_EXPOSE|RAW_JSON_DO_NOT_EXPOSE|PRIVATE_RETRY_|PRIVATE_EVENT_/);
      assert.equal(data.selectedThreadId, target);
      if (mode === 'balances') { assert.deepEqual(data.messages.map(row => row.card_preview.balance), [0, null, null, null, null]); assert.match(data.messages[0].text_content, /0 元/); for (const row of data.messages.slice(1)) assert.match(row.text_content, /不代表餘額為零/); assert.equal(data.summary.messages, 5); }
      else if (mode === 'latest80') { assert.equal(data.messages.length, 80); assert.deepEqual(data.messages.map(row => row.message_id), expected); assert.equal(data.summary.messages, 200); assert.equal(data.threads[0].message_count, 200); }
      else if (mode === 'missing-table') { assert.equal(data.summary.messages, 11); assert.equal(data.messages.length, 2); assert.ok(data.messages.every(row => !row.card_preview)); }
      else {
        assert.equal(data.summary.messages, 14); const a = data.threads.find(row => row.thread_id === 'line:' + A); assert.equal(a.message_count, 7); assert.equal(a.unread_count, 7); assert.equal(a.status, 'waiting'); assert.equal(a.note, 'KEEP_NOTE'); assert.equal(a.opportunity_value, 123); assert.equal(a.ai_paused, 1);
        const ids = data.messages.map(row => row.message_id);
        if (mode === 'basic') {
          assert.deepEqual(new Set(ids), new Set(['INBOUND_A', messageId(1), messageId(2), messageId(6)])); assert.ok(data.messages.every(row => row.user_id === A));
          assert.equal(data.messages.find(row => row.message_id === messageId(2)).text_content, 'PHYSICAL_SAME_ID_WINS');
          const card = data.messages.find(row => row.message_id === messageId(1)); assert.equal(card.card_preview.balance, 12867); assert.equal(card.delivery_status, 'accepted'); assert.equal(card.card_preview.mother_reply_available, false); assert.match(card.text_content, /LINE API已接受/); assert.match(card.text_content, /送達與已讀未確認/); assert.doesNotMatch(card.text_content, /打卡成功|入帳成功|已送達/);
          const unavailable = data.messages.find(row => row.message_id === messageId(6)); assert.equal(unavailable.card_preview.balance, null); assert.match(unavailable.text_content, /不代表餘額為零/);
          for (const n of [3, 4, 5, 7, 8, 9]) assert.ok(!ids.includes(messageId(n)), 'recipient/state mismatches never masquerade as accepted');
        } else if (mode === 'other-recipient') { assert.deepEqual(new Set(ids), new Set(['B_MESSAGE', messageId(3)])); assert.ok(data.messages.every(row => row.user_id === B)); }
        else assert.equal(data.messages.length, 0, 'group or mismatched user thread cannot expose personal cards');
      }
      console.log('WORKERD CRM monitor ' + mode + ' PASS');
    } finally { await mf.dispose(); }
  }
  console.log('Actual monitor + D1 read-only projection PASS; historical accepted visible immediately; no LINE, wallet, points or production access');
})().catch(error => { console.error(error); process.exitCode = 1; });
