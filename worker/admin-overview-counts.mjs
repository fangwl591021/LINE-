// Shared aggregate only. Callers must authenticate an administrator first.
export async function readAdminOverviewCounts(db) {
  const result = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM users) AS memberRecordCount,
    (SELECT COUNT(*) FROM card_contacts) AS cardRecordCount,
    (SELECT COUNT(*) FROM activities WHERE status='上架' AND COALESCE(series_id,'')='') AS publishedActivityCount,
    (SELECT COUNT(*) FROM registrants WHERE COALESCE(status,'')<>'cancelled') AS activeRegistrationCount`).bind().all();
  if (result.success === false || !Array.isArray(result.results) || result.results.length !== 1) throw new Error('Stats unavailable');
  const row = result.results[0];
  const keys = ['memberRecordCount','cardRecordCount','publishedActivityCount','activeRegistrationCount'];
  if (keys.some(key => row[key] === null || row[key] === undefined || row[key] === '')) throw new Error('Stats incomplete');
  const data = Object.fromEntries(keys.map(key => [key, Number(row[key])]));
  if (keys.some(key => !Number.isSafeInteger(data[key]) || data[key] < 0)) throw new Error('Stats invalid');
  return data;
}
