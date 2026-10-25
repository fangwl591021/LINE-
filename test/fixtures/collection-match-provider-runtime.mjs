// Isolated test only: every network request is replaced before the actual wrapper runs.
import { AIModule, SecurityModule, scoreMemberDirectoryBatch } from 'actual-ai-wrapper';
import { scoreNewCollectionMatches, restoreCollectionHistory } from 'actual-collection-scorer';

export default { async fetch(request, env) {
  const { mode = 'success' } = await request.json(), db = env.ACTMASTER_DB;
  const owner = 'U' + 'a'.repeat(32), observed = [], warnings = [], kvCalls = [];
  const quotaMode = ['quota-unlimited', 'directory-quota-unlimited', 'legacy-limited', 'legacy-quota-failed'].includes(mode);
  let allowed = [];
  if (quotaMode) {
    const namespace = env.ACTMASTER_KV;
    env.ACTMASTER_KV = {
      get: async (...args) => { kvCalls.push('get'); return await namespace.get(...args); },
      put: async (...args) => { kvCalls.push('put'); return await namespace.put(...args); },
      delete: async (...args) => { kvCalls.push('delete'); return await namespace.delete(...args); }
    };
    // More than the generic default 50 proves matching cannot fall through to it.
    allowed = await Promise.all(Array.from({ length: 60 }, () => SecurityModule.checkRateLimit(owner, 'matchmakeContacts', env, 'user')));
  }
  const oldWarn = console.warn, oldFetch = globalThis.fetch, oldTimeout = AbortSignal.timeout;
  if (mode === 'timeout') AbortSignal.timeout = () => oldTimeout(5);
  console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
  globalThis.fetch = async (url, init) => {
    if (url !== 'https://api.openai.com/v1/chat/completions') throw Error('Unexpected test network');
    const body = JSON.parse(init.body);
    observed.push({ body, hasSignal: !!init.signal, method: init.method });
    // Model the actual JSON-mode provider precondition captured in sanitized tail.
    if (body.response_format?.type === 'json_object' && !/json/i.test(JSON.stringify(body.messages)))
      return Response.json({ error: { message: "'messages' must contain the word 'json' in some form, to use 'response_format' of type 'json_object'." } }, { status: 400 });
    if (mode === 'timeout') return await new Promise((_, reject) => { if (init.signal.aborted) reject(init.signal.reason); else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }); });
    if (mode === 'provider' || mode === 'fallback' && observed.length === 1)
      return Response.json({ error: { message: 'Synthetic private provider detail NEVER_SAVE' } }, { status: 429 });
    if (mode === 'existing-race') await db.prepare("INSERT INTO ai_match_pair_cache(requester_user_id,pool_scope,intent_hash,candidate_card_row_id,candidate_version,score,reason,result_source) VALUES(?,'own','zzz-concurrent-valid','NEW','other-version',91,'另一處已完成的有效分數及理由，必須保留。','ai')").bind(owner).run();
    const scores = JSON.parse(body.messages[1].content).candidates.map(({ index }) => ({ index, score: 78, reason: '提供的商務服務資源互補，可進一步確認合作需求。' }));
    return Response.json({ choices: [{ message: { content: mode === 'invalid' ? 'invalid JSON' : JSON.stringify({ scores }) } }] });
  };
  try {
    if (['directory-json', 'directory-quota-unlimited'].includes(mode)) {
      let directory;
      try { directory = await scoreMemberDirectoryBatch(env, { user: { line_id: owner, role: 'user' } }, { company: '合成本人公司', title: '顧問' }, [{ company: '合成候選公司', title: '通路顧問' }]); }
      catch { directory = { failed: true }; }
      return Response.json({ directory, observed, kvCalls, allowed, warningCount: warnings.length });
    }
    const cards = [
      { rowId: 'OLD', aiMatch: { status: 'pending', score: null } },
      { rowId: 'NEW', 公司名稱: '合成候選公司', 職稱: '通路顧問', 服務項目: '商務服務', 姓名: 'PRIVATE_NAME', 電話: 'PRIVATE_PHONE', health: 'PRIVATE_HEALTH', wealth: 'PRIVATE_WEALTH', aiMatch: { status: 'pending', score: null } },
      { rowId: 'ZERO', aiMatch: { status: 'pending', score: null } }
    ];
    const read = { identityIdsForUser: async () => [owner], getCardHarvestContacts: async () => ({ success: true, data: await restoreCollectionHistory(cards, db, owner) }) };
    const result = await scoreNewCollectionMatches({ env, actor: { userId: owner, token: 'synthetic-line-token', role: 'user' }, read, match: AIModule, rateLimit: async () => { throw Error('Collection must not consult daily quota'); } });
    const rows = (await db.prepare('SELECT candidate_card_row_id,score,reason,result_source FROM ai_match_pair_cache ORDER BY candidate_card_row_id').all()).results;
    return Response.json({ result, rows, observed, kvCalls, allowed, warningCount: warnings.length });
  } finally {
    globalThis.fetch = oldFetch;
    AbortSignal.timeout = oldTimeout;
    console.warn = oldWarn;
  }
} };
