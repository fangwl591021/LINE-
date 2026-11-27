const annualOrderUid = /^U[0-9a-f]{32}$/iu;
const annualOrderTypes = "'tenant_annual_fee','tenant_renewal_fee'";
// Only verified links follow a moved account. Similar names and phones are lookup matches, never ownership.
export const annualRelatedBuyersSql = `
 WITH RECURSIVE related(id) AS (
  SELECT ?
  UNION
  SELECT CASE WHEN l.old_line_id=r.id THEN l.new_line_id ELSE l.old_line_id END
  FROM related r JOIN user_identity_links l
    ON l.status='active' AND (l.old_line_id=r.id OR l.new_line_id=r.id)
 ) SELECT id FROM related`;

export const annualOrderCollisionSql = `SELECT order_id FROM orders WHERE
  buyer_id IN (${annualRelatedBuyersSql})
  AND order_type IN (${annualOrderTypes}) AND order_id<>?
  AND payment_status NOT IN ('cancelled','void','refunded')`;
export const annualOrderCollisionMessage = '這位會員已有年費訂單，請先查看原訂單。續約請走續約流程。';

export async function searchAnnualOrderBuyers(db,params,fail) {
 if ([...params.keys()].some(key=>key!=='q') || params.getAll('q').length!==1) fail('請輸入一個查詢條件');
 const raw=params.get('q')?.normalize('NFKC').trim()||'';
 if (raw.length<2 || raw.length>100 || /[\p{Cc}]/u.test(raw)) fail('請輸入至少兩個字搜尋');
 const query=raw.replace(/\s+/gu,'').toLowerCase();
 const digits=/^[\d()+\s.-]+$/u.test(raw)?raw.replace(/\D/gu,'').replace(/^8869/u,'09'):'';
 const phoneSql="replace(replace(replace(replace(replace(replace(COALESCE(u.phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.','')";
 const nameSql="lower(replace(replace(trim(u.name),' ',''),'　',''))";
 const matches=await db.prepare(`SELECT u.line_id AS userId, u.name, u.member_number AS memberNumber,
    substr(${phoneSql},-3) AS phoneEnd, u.role, u.network_id AS networkId
   FROM users u WHERE length(u.line_id)=33 AND substr(u.line_id,1,1)='U'
    AND NOT EXISTS(SELECT 1 FROM user_identity_links l WHERE l.status='active' AND l.old_line_id=u.line_id)
    AND (instr(${nameSql},?)>0 OR instr(lower(u.line_id),?)>0 OR instr(COALESCE(u.member_number,''),?)>0
      OR (?<>'' AND (instr(${phoneSql},?)>0 OR instr(${phoneSql},'886'||substr(?,2))>0 AND substr(?,1,2)='09'))
      OR EXISTS(SELECT 1 FROM user_identity_links l WHERE l.status='active' AND l.new_line_id=u.line_id AND lower(l.old_line_id)=?))
   ORDER BY (lower(u.line_id)=? OR u.member_number=? OR ${nameSql}=?) DESC, u.name, u.line_id LIMIT 21`)
  .bind(query,query,query,digits,digits,digits,digits,query,query,query,query).all();
 if (matches.success===false || !Array.isArray(matches.results)) throw Error('Member search failed');
 const members=await Promise.all(matches.results.slice(0,20).filter(row=>annualOrderUid.test(row.userId)).map(async row=>{
  const summary=await db.prepare(`
   SELECT (
     SELECT json_group_array(id) FROM (${annualRelatedBuyersSql} LIMIT 33)
   ) AS buyerIds, EXISTS(${annualOrderCollisionSql}) AS existingOrder
  `).bind(row.userId,row.userId,'').first();
  const buyerIds=JSON.parse(summary?.buyerIds||'[]');
  return {...row,buyerIds:buyerIds.slice(0,32),hasExistingOrder:!!summary?.existingOrder,identityReview:buyerIds.length>32};
 }));
 return {success:true,members,more:matches.results.length>20};
}
