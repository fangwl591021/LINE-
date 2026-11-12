// Additional write-time checks for the narrow hard-admin identity proof.
// The proof is produced only after LINE authentication and server-side checks
// against the existing hard-admin account group; it is never client supplied.
const UID = /^U[0-9a-f]{32}$/i;
const ACTOR = ['row_id','line_id','legacy_line_id','point_line_id','role','name','phone'];

export function exactHardAdminWriteGate(proof, uid, actor) {
  if (proof?.mode !== 'exact_hard_admin') return null;
  const ids = proof.ids, links = proof.links, accountIds = proof.account_ids;
  if (!Array.isArray(ids) || ![1, 2].includes(ids.length) ||
      ids.some(id => typeof id !== 'string' || !UID.test(id)) || new Set(ids).size !== ids.length ||
      !Array.isArray(accountIds) || accountIds.length < ids.length || accountIds.length > 8 ||
      accountIds.some(id => typeof id !== 'string' || !UID.test(id)) || new Set(accountIds).size !== accountIds.length ||
      ids.some(id => !accountIds.includes(id)) ||
      !Array.isArray(links) || !UID.test(uid || '') || !ids.includes(uid) ||
      !ids.includes(actor?.line_id) || !['admin', '總管'].includes(String(actor?.role || '').trim().toLowerCase())) {
    throw new Error('Administrator identity proof unavailable');
  }
  const markers = accountIds.map(() => '?').join(',');
  const sql = [`(SELECT COUNT(*) FROM users WHERE line_id IN (${markers}))=1`,
    `(SELECT COUNT(*) FROM user_identity_links WHERE status='active' AND (old_line_id IN (${markers}) OR new_line_id IN (${markers})))=?`];
  const args = [...accountIds, ...accountIds, ...accountIds, links.length];
  if (ids.length === 1) {
    if (uid !== ids[0] || actor.line_id !== ids[0] || String(actor.legacy_line_id || '') !== '' || links.length !== 0) {
      throw new Error('Administrator identity proof unavailable');
    }
  } else {
    const link = links[0];
    if (links.length !== 1 || !link || link.old_line_id === link.new_line_id ||
        !ids.includes(link.old_line_id) || !ids.includes(link.new_line_id) ||
        actor.line_id !== link.new_line_id || actor.legacy_line_id !== link.old_line_id) {
      throw new Error('Administrator identity proof unavailable');
    }
    sql.push("EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND old_line_id=? AND new_line_id=?)");
    args.push(link.old_line_id, link.new_line_id);
  }
  return {sql: sql.join(' AND '), args};
}

// Check the same trusted account snapshot immediately before a potentially
// billable external review. Existing general-admin flows are unchanged.
export async function exactHardAdminBeforeExternal(db, proof, uid, actor) {
  const gate=exactHardAdminWriteGate(proof,uid,actor);
  if(!gate)return true;
  const result=await db.prepare(`SELECT 1 AS authorized FROM users a WHERE ${ACTOR.map(key=>'a.'+key+' IS ?').join(' AND ')} AND ${gate.sql} LIMIT 1`)
    .bind(...ACTOR.map(key=>actor[key]??null),...gate.args).all();
  if(result?.success===false||!Array.isArray(result?.results))throw new Error('Administrator identity recheck unavailable');
  return result.results.length===1&&result.results[0].authorized===1;
}
