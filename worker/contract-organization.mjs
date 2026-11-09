import {ShopError} from './store-shop.mjs';

const MAX_NODES = 240;

// Only signed, approved applications and verified paper/electronic enrollments
// establish an edge. Conflicting sponsors require review outside this view.
export async function contractOrganization(db, memberId, depth) {
  const rows = (await db.prepare(`
    WITH RECURSIVE
    claims(child, parent) AS (
      SELECT a.owner_uid, p.line_id FROM partner_applications a
        JOIN partner_application_reviews v ON v.application_id=a.id AND v.decision='accepted'
        JOIN users p ON p.member_number=NULLIF(json_extract(a.snapshot_json,'$.fields.performance_owner_member_number'),'')
        WHERE json_extract(a.snapshot_json,'$.attribution_mode')='applicant_performance_v1'
      UNION
      SELECT member_uid, sponsor_uid FROM partner_contract_enrollments WHERE sponsor_uid!=''
    ),
    edges(child,parent) AS (
      SELECT child,MIN(parent) FROM claims GROUP BY child
        HAVING COUNT(DISTINCT parent)=1 AND child!=MIN(parent)
    ),
    branch(uid,parent,level,path) AS (
      SELECT line_id,NULL,0,'|'||line_id||'|' FROM users WHERE line_id=?
      UNION ALL
      SELECT e.child,e.parent,b.level+1,b.path||e.child||'|'
        FROM branch b JOIN edges e ON e.parent=b.uid JOIN users u ON u.line_id=e.child
        WHERE b.level<? AND instr(b.path,'|'||e.child||'|')=0
      ORDER BY 3,1 LIMIT ?
    )
    SELECT b.uid,b.parent,b.level,u.name,u.member_number,u.crm_project_independent_at,
      EXISTS(SELECT 1 FROM partner_bonus_deal_confirmations d WHERE d.buyer_uid=b.uid AND d.recruiter_uid=b.parent) AS credited,
      EXISTS(SELECT 1 FROM edges e JOIN users c ON c.line_id=e.child
        WHERE e.parent=b.uid AND instr(b.path,'|'||e.child||'|')=0) AS has_children
    FROM branch b JOIN users u ON u.line_id=b.uid ORDER BY b.level,u.member_number,b.uid
  `).bind(memberId,depth,MAX_NODES+1).all()).results;
  if (!rows.length) throw new ShopError('查不到這位會員',404);
  const limited = rows.length > MAX_NODES;
  const byId = new Map();
  for (const row of rows.slice(0,MAX_NODES)) {
    const node = {name:row.name || '會員',number:row.member_number || '',independent:Boolean(row.crm_project_independent_at),
      credited:Boolean(row.credited),hasChildren:Boolean(row.has_children),children:[]};
    byId.set(row.uid,node);
    if (row.parent) byId.get(row.parent)?.children.push(node);
  }
  return {root:byId.get(memberId),limited,depth};
}

