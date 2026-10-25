// Isolated test fixture: schema is preinstalled and all runtime access is read-only.
import { LineOAChatModule } from 'actual-line-oa-monitor';
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw Error('Network forbidden in monitor audit'); };
export default { async fetch(request, env) {
  const queries = [], raw = env.ACTMASTER_DB;
  const readonly = {
    prepare(sql) {
      if (!/^\s*(SELECT|WITH)\b/i.test(sql)) throw Error('Monitor must not mutate isolated data');
      queries.push(sql);
      return raw.prepare(sql);
    },
    withSession() { return this; },
    batch(statements) { return raw.batch(statements); }
  };
  // The existing ensure() does schema setup; this audit starts after that schema
  // is installed and rejects every non-read from the actual monitor/projection.
  LineOAChatModule.ensure = async () => {};
  const result = await LineOAChatModule.monitor(await request.json(), { ...env, ACTMASTER_DB: readonly });
  return Response.json({ result, queryCount: queries.length, networkCalls });
} };
