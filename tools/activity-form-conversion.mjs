// Offline planner only: never connects to a database or deletes anything on import.
// Run the generated SQL as ONE D1 import transaction, after saving a verified backup.
const quote = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const exact = row => Object.entries(row).map(([key,value]) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(key)) throw Error('Invalid backup column');
  return `${key} IS ${quote(value)}`;
}).join(' AND ');
const guard = condition => `SELECT CASE WHEN (${condition}) THEN 1 ELSE json('conversion_precondition_failed') END;`;
export function planActivityFormConversion(backup, {rootId,networkId,childIds}) {
  if (!rootId || !networkId || !childIds?.length || childIds.length>24 || new Set(childIds).size!==childIds.length) throw Error('Exact target scope required');
  const {activities,registrants,activity_share_links:links}=backup.tables;
  const root=activities.find(a=>a.activity_id===rootId);
  const children=childIds.map(id=>activities.find(a=>a.activity_id===id));
  if (!root || !root.is_series || root.series_id || JSON.parse(root.batch_options || '[]').length || activities.length!==children.length+1) throw Error('Expected one unconverted form');
  if (children.some(c=>!c || c.series_id!==rootId || c.is_series || c.creator_id!==root.creator_id || c.network_id!==networkId || !c.batch_name || !c.start_time || !c.name.startsWith(root.name+'｜'))) throw Error('Child identity, owner or network mismatch');
  if (root.network_id!==networkId && root.network_id!=='admin') throw Error('Unexpected parent ownership');
  if (Number(backup.points)!==0) throw Error('Points references need separate review');
  if (registrants.some(r=>r.activity_id!==rootId && !childIds.includes(r.activity_id))) throw Error('Registration outside scope');
  if (links.some(l=>![rootId,...childIds].includes(l.activity_id))) throw Error('Link outside scope');
  const options=children.map(c=>Object.fromEntries(['activity_id','batch_name','start_time','end_time','price','batch_limit','status','nfc_checkin_start','nfc_checkin_end','nfc_same_day_only','reward_points'].map(k=>[k,c[k]])));
  const scope=[rootId,...childIds].map(quote).join(','), childScope=childIds.map(quote).join(',');
  const sql=[
    guard(`(SELECT COUNT(*) FROM activities WHERE activity_id IN (${scope}) OR series_id=${quote(rootId)})=${activities.length}`),
    ...activities.map(a=>guard(`EXISTS (SELECT 1 FROM activities WHERE ${exact(a)})`)),
    guard(`(SELECT COUNT(*) FROM registrants WHERE activity_id IN (${scope}))=${registrants.length}`),
    ...registrants.map(r=>guard(`EXISTS (SELECT 1 FROM registrants WHERE ${exact(r)})`)),
    guard(`(SELECT COUNT(*) FROM activity_share_links WHERE activity_id IN (${scope}))=${links.length}`),
    ...links.map(l=>guard(`EXISTS (SELECT 1 FROM activity_share_links WHERE ${exact(l)})`)),
    guard(`(SELECT COUNT(*) FROM points_ledger WHERE activity_id IN (${scope}))=0`),
    `UPDATE activities SET batch_options=${quote(JSON.stringify(options))},network_id=${quote(networkId)} WHERE activity_id=${quote(rootId)};`,
    // Move first: the old FK has ON DELETE CASCADE. Keep row IDs, payment/checkin, dates, identities intact.
    `UPDATE registrants SET batch_id=activity_id,activity_id=${quote(rootId)} WHERE activity_id IN (${childScope});`,
    `DELETE FROM activity_share_links WHERE activity_id IN (${childScope});`,
    `DELETE FROM activities WHERE activity_id IN (${childScope});`,
    guard(`(SELECT COUNT(*) FROM activities WHERE activity_id=${quote(rootId)} AND json_array_length(batch_options)=${children.length})=1`),
    guard(`(SELECT COUNT(*) FROM registrants WHERE activity_id=${quote(rootId)})=${registrants.length}`)
  ].join('\n');
  return {sql,options,deleteCount:children.length,registrationCount:registrants.length,deletedChildLinks:links.filter(l=>childIds.includes(l.activity_id)).length};
}
