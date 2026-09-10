// Read-only reporting over confirmed product redemptions. No wallet calls or writes.
const DAY=86400000;
function day(value) {
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(value||'')) return NaN;
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:NaN;
}
const sqlTime=time=>new Date(time).toISOString().slice(0,19).replace('T',' ');
export async function readShopSales(db,uid,params) {
  const start=params.get('start'),end=params.get('end');
  const from=day(start),to=day(end),page=Number(params.get('page')||0);
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<from||to-from>=366*DAY||!Number.isSafeInteger(page)||page<0||page>10000) {
    return {success:false,error:'請選擇有效日期，起訖最多 366 天，並使用有效頁碼'};
  }
  // CASE guards malformed legacy JSON irrespective of SQLite predicate order.
  // Ownership is constrained by BOTH the authenticated actor and current store owner.
  // No active-status filter: archiving a product must not erase its sales history.
  const query=`WITH journal AS (
    SELECT request_id,updated_at,CASE WHEN json_valid(fingerprint) THEN fingerprint ELSE '{}' END AS f
    FROM store_cashier_requests WHERE actor_id=? AND status='succeeded' AND updated_at>=? AND updated_at<?
  ), sales AS (
    SELECT j.request_id AS transactionId,j.updated_at AS confirmedAt,p.id AS productId,p.title AS productTitle,
      json_extract(f,'$.amount') AS amount,json_extract(f,'$.deductPoints') AS points
    FROM journal j JOIN store_shop_products p ON p.id=json_extract(f,'$.productId')
    JOIN store_shop_stores s ON s.id=p.shop_id AND s.owner_uid=?
    WHERE json_extract(f,'$.mode')='redeem' AND json_type(f,'$.amount')='integer'
      AND json_type(f,'$.deductPoints')='integer' AND json_extract(f,'$.amount') BETWEEN 1 AND 1000000
      AND json_extract(f,'$.deductPoints') BETWEEN 1 AND json_extract(f,'$.amount')
  ), totals AS (
    SELECT COUNT(*) AS totalCount,COALESCE(SUM(amount),0) AS totalAmount,
      COALESCE(SUM(points),0) AS totalPoints,COALESCE(SUM(amount-points),0) AS totalPayable FROM sales
  ) SELECT t.*,d.* FROM totals t LEFT JOIN (
    SELECT *,amount-points AS payable FROM sales ORDER BY confirmedAt DESC,transactionId DESC LIMIT 21 OFFSET ?
  ) d ON 1=1 ORDER BY d.confirmedAt DESC,d.transactionId DESC`;
  const rows=(await db.prepare(query).bind(uid,sqlTime(from-8*3600000),sqlTime(to+DAY-8*3600000),uid,page*20).all()).results;
  const total=rows[0];
  if(!total) throw Error('Missing sales aggregate');
  const records=rows.filter(row=>row.transactionId).slice(0,20).map(row=>({
    transactionId:row.transactionId,confirmedAt:row.confirmedAt.replace(' ','T')+'Z',
    productId:row.productId,productTitle:row.productTitle,amount:row.amount,points:row.points,payable:row.payable
  }));
  return {success:true,start,end,page,hasNext:rows.filter(row=>row.transactionId).length>20,
    summary:{count:total.totalCount,amount:total.totalAmount,points:total.totalPoints,payable:total.totalPayable},records};
}
