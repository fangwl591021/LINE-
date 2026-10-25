// Real Workerd/D1 + actual workerbackup.js AIModule, with synthetic keys and offline fetch only.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Miniflare } = require(process.env.LISTING_MINIFLARE_MODULE);
const { build } = require(process.env.LISTING_ESBUILD_MODULE);
(async () => {
  const source = readFileSync('workerbackup.js', 'utf8'), actual = source.match(/^const AIModule = \{[\s\S]*?^\};/m)?.[0];
  assert.ok(actual, 'actual AIModule exists');
  for (const version of ['baseline', 'fixed']) {
  // Reproduce the historical missing instruction without depending on mutable
  // HEAD or Git history, so this regression remains valid after release commits.
  const hint = '請回傳 JSON 物件。';
  const currentCollection = readFileSync('worker/collection-match-history.mjs', 'utf8');
  assert.equal(currentCollection.split(hint).length - 1, 1, 'exactly one collection JSON instruction');
  const collectionSource = version === 'baseline' ? currentCollection.replace(hint, '') : currentCollection;
  const currentBridge = source.match(/^export async function scoreMemberDirectoryBatch\([\s\S]*?^}/m)?.[0];
  assert.equal(currentBridge.split(hint).length - 1, 1, 'exactly one directory JSON instruction');
  const bridge = version === 'baseline' ? currentBridge.replace(hint, '') : currentBridge;
  const quotaMethod = source.match(/^  async checkRateLimit\([\s\S]*?^  }/m)?.[0];assert.ok(bridge && quotaMethod);
  const bundle = await build({ entryPoints: ['test/fixtures/collection-match-provider-runtime.mjs'], bundle: true, format: 'esm', platform: 'browser', write: false, plugins: [{ name: 'actual-ai-wrapper', setup(build) {
    build.onResolve({ filter: /^actual-(?:ai-wrapper|collection-scorer)$/ }, args => ({ path: args.path, namespace: 'isolated' }));
    build.onLoad({ filter: /.*/, namespace: 'isolated' }, args => ({ contents: args.path === 'actual-collection-scorer' ? collectionSource : "import { allowDirectoryMatchBatch } from './matchmaking-quota.mjs';\nconst SecurityModule={" + quotaMethod + "};\n" + actual + '\n' + bridge + '\nexport { AIModule };', resolveDir: resolve('worker'), loader: 'js' }));
  } }] });
  for (const mode of version === 'baseline' ? ['success', 'directory-json'] : ['success', 'directory-json', 'fallback', 'provider', 'timeout', 'invalid', 'quota', 'existing-race']) {
    const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-04-23', compatibilityFlags: [], d1Databases: { ACTMASTER_DB: 'isolated-ai-wrapper' }, bindings: { OPENAI_API_KEY: 'sk-synthetic-primary-NOT_REAL', OPENAI_API_KEY_2: 'sk-synthetic-backup-NOT_REAL' }, port: 0 });
    try {
      const db = await mf.getD1Database('ACTMASTER_DB'), owner = 'U' + 'a'.repeat(32);
      for (const stmt of readFileSync('migrations/0027_incremental_matchmaking_cache.sql', 'utf8').split(';').map(s => s.replace(/--[^\n]*/g, '').trim()).filter(Boolean)) await db.exec(stmt.replace(/\s+/g, ' ') + ';');
      await db.exec("CREATE TABLE card_contacts(row_id TEXT,line_id TEXT,profile_user_id TEXT,owner_user_id TEXT,creator_id TEXT,source_type TEXT,archived_at TEXT,company_name TEXT,title TEXT,services TEXT,personality TEXT,hobbies TEXT,career TEXT,updated_at TEXT,created_at TEXT)");
      await db.prepare("INSERT INTO card_contacts VALUES('SELF',?,?,?,?,'self_profile','','合成本人公司','顧問','通路服務','謹慎','閱讀','商務','2026-10-25','2026-10-25')").bind(owner, owner, owner, owner).run();
      await db.prepare("INSERT INTO ai_match_pair_cache(requester_user_id,pool_scope,intent_hash,candidate_card_row_id,candidate_version,score,reason,result_source) VALUES(?,'own','existing-intent','OLD','old-version',82,'既有有效理由，不得覆寫。','ai')").bind(owner).run();
      const response = await mf.dispatchFetch('https://isolated.test/audit', { method: 'POST', body: JSON.stringify({ mode }) }), data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      if (version === 'baseline') {
        assert.equal(data.observed.length, 2);
        assert.ok(data.observed.every(c => !/json/i.test(JSON.stringify(c.body.messages))));
        if (mode === 'directory-json') assert.equal(data.directory.failed, true);
        else { assert.equal(data.result.data.processed, 0); assert.equal(data.rows.find(r => r.candidate_card_row_id === 'NEW').result_source, 'partner_failed'); assert.equal(data.result.data.cards[1].aiMatch.score, null); }
        console.log('WORKERD baseline ' + mode + ' REPRODUCED provider JSON-mode rejection');continue;
      }
      if (mode === 'directory-json') { assert.equal(data.observed.length, 1); assert.equal(data.directory.scores[0].score, 78); console.log('WORKERD fixed directory JSON mode PASS');continue; }
      if (mode === 'existing-race') { assert.equal(data.result.data.cards[1].aiMatch.score, 91, 'a valid score arriving during AI must win');assert.equal(data.result.data.cards[1].aiMatch.reason, '另一處已完成的有效分數及理由，必須保留。');assert.equal(data.result.data.processed, 0);console.log('WORKERD existing valid-score race PASS');continue; }
      const old = data.rows.find(r => r.candidate_card_row_id === 'OLD'), fresh = data.rows.find(r => r.candidate_card_row_id === 'NEW');
      assert.equal(old.score, 82); assert.equal(old.reason, '既有有效理由，不得覆寫。');
      assert.ok(!JSON.stringify(data.observed).match(/PRIVATE_NAME|PRIVATE_PHONE|PRIVATE_HEALTH|PRIVATE_WEALTH/));
      for (const call of data.observed) { assert.equal(call.body.model, 'gpt-4o'); assert.equal(call.hasSignal, true); assert.equal(call.method, 'POST'); }
      if (['success', 'fallback'].includes(mode)) { assert.equal(data.result.data.processed, 1); assert.equal(fresh.score, 78); assert.equal(fresh.result_source, 'ai'); assert.equal(data.observed.length, mode === 'fallback' ? 2 : 1); }
      else { assert.equal(data.result.data.processed, 0); assert.equal(data.result.data.cards[1].aiMatch.score, null); assert.equal(data.result.data.failureCode, mode === 'invalid' ? 'invalid_response' : mode); assert.doesNotMatch(fresh.reason, /NEVER_SAVE/); assert.equal(fresh.result_source, mode === 'quota' ? 'partner_limited' : 'partner_failed'); assert.equal(data.observed.length, mode === 'quota' ? 0 : ['invalid','timeout'].includes(mode) ? 1 : 2); }
      console.log('WORKERD actual-wrapper ' + mode + ' PASS');
    } finally { await mf.dispose(); }
  }
  }
  console.log('Actual AIModule + collection scorer integration PASS; no real credentials, external AI, or production writes');
})().catch(error => { console.error(error); process.exitCode = 1; });
