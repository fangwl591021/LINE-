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
    roster AS (SELECT * FROM partner_org_roster WHERE root_uid=?),
    visible(child,parent,verified,listed) AS (
      SELECT e.child,e.parent,1,EXISTS(SELECT 1 FROM roster r WHERE r.node_key=e.child AND r.parent_key=e.parent) FROM edges e
      UNION ALL
      SELECT r.node_key,r.parent_key,0,1 FROM roster r
        WHERE r.parent_key NOT IN ('','@upline') AND NOT EXISTS(SELECT 1 FROM claims c WHERE c.child=r.node_key)
    ),
    branch(uid,parent,level,path,verified,scoped) AS (
      SELECT line_id,NULL,0,'|'||line_id||'|',1,0 FROM users WHERE line_id=?
      UNION ALL
      SELECT e.child,e.parent,b.level+1,b.path||e.child||'|',e.verified,(b.scoped OR NOT e.verified)
        FROM branch b JOIN visible e ON e.parent=b.uid AND (NOT b.scoped OR e.listed)
        WHERE b.level<? AND instr(b.path,'|'||e.child||'|')=0
      ORDER BY 3,1 LIMIT ?
    )
    SELECT b.uid,b.parent,b.level,b.verified,
      CASE WHEN b.level=0 THEN (SELECT CASE WHEN count(*)=1 THEN max(coalesce(p.name,r.alias)) END
        FROM roster r LEFT JOIN users p ON p.line_id=r.node_key
        WHERE r.parent_key='@upline' AND (SELECT count(*) FROM roster WHERE parent_key='@upline')=1 AND NOT EXISTS(SELECT 1 FROM claims c WHERE c.child=b.uid AND c.parent<>r.node_key)) END AS reported_upline,
      COALESCE(u.name,r.alias) AS name,u.member_number,u.crm_project_independent_at,
      EXISTS(SELECT 1 FROM partner_bonus_deal_confirmations d WHERE d.buyer_uid=b.uid AND d.recruiter_uid=b.parent) AS credited,
      EXISTS(SELECT 1 FROM visible e
        WHERE e.parent=b.uid AND (NOT b.scoped OR e.listed) AND instr(b.path,'|'||e.child||'|')=0) AS has_children
    FROM branch b LEFT JOIN users u ON u.line_id=b.uid LEFT JOIN roster r ON r.node_key=b.uid WHERE u.line_id IS NOT NULL OR length(r.alias)>0 ORDER BY b.level,u.member_number,b.uid
  `).bind(memberId,memberId,depth,MAX_NODES+1).all()).results;
  if (!rows.length) throw new ShopError('查不到這位會員',404);
  const limited = rows.length > MAX_NODES;
  const byId = new Map();
  for (const row of rows.slice(0,MAX_NODES)) {
    const node = {name:row.name || '會員',number:row.member_number || '',independent:Boolean(row.crm_project_independent_at),
      status:row.verified ? 'verified' : 'reported',credited:Boolean(row.verified && row.credited),hasChildren:Boolean(row.has_children),children:[]};
    byId.set(row.uid,node);
    if (row.parent) byId.get(row.parent)?.children.push(node);
  }
  const unplaced=(await db.prepare(`SELECT coalesce(u.name,r.alias) AS name FROM partner_org_roster r
    LEFT JOIN users u ON r.node_key=u.line_id WHERE r.root_uid=? AND r.parent_key='' ORDER BY name LIMIT 240`).bind(memberId).all()).results.map(r=>r.name).filter(Boolean);
  return {root:byId.get(memberId),limited,depth,unplaced,reportedUpline:rows[0].reported_upline||null};
}

