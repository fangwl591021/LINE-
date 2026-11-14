import {ShopError} from './store-shop.mjs';
export const POLICY_11511='cocreator-115.11-v4';
export const TEMPLATE_11511='115.11';
export const SOURCE_11511='91fa4438661132222d0f5a77f54e10ab76d7c8eb3338ebd0f11175b7be4aabef';
const firstMonth=Date.UTC(2026,10,1)-8*3600000;
export function performanceWindow(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2026-11')throw Error('115.11 績效月份須自 2026 年 11 月起');
 const [year,m]=month.split('-').map(Number);
 return {month,start:new Date(Math.max(firstMonth,Date.UTC(year,m-12,1)-8*3600000)).toISOString(),end:new Date(Date.UTC(year,m,1)-8*3600000).toISOString()};
}
export function renewalPercent(n){return n>=6?100:n>=4?60:n>=2?40:20;}
export async function monthlyPerformance(db,uid,month){
 const window=performanceWindow(month);
 const prior=await db.prepare(`SELECT json_extract(b.raw_json,'$.monthlyPerformance') AS result FROM partner_11510_statements s JOIN bonus_transactions b ON b.beneficiary_id=s.target_uid LEFT JOIN partner_11510_statement_items i ON i.tx_id=b.tx_id WHERE s.target_uid=? AND s.month=? AND (s.id=i.statement_id OR s.id=json_extract(b.raw_json,'$.statementId')) AND json_type(b.raw_json,'$.monthlyPerformance')='object' LIMIT 1`).bind(uid,month).first();
 if(prior?.result)return JSON.parse(prior.result);
 const startMonth=new Date(Date.parse(window.start)+8*3600000).toISOString().slice(0,7),endMonth=new Date(Date.parse(window.end)+8*3600000).toISOString().slice(0,7);
 const uncertain=await db.prepare(`SELECT 1 FROM partner_bonus_deal_confirmations c JOIN orders o ON o.order_id=c.order_id JOIN partner_service_year_claims y ON y.order_id=o.order_id
  WHERE c.recruiter_uid=? AND c.deal_type='tenant_annual_fee' AND y.admission='new' AND o.payment_status='paid'
  AND json_extract(c.facts_json,'$.performanceReportingDate.month') IS NOT NULL
  AND ((strftime('%Y-%m',c.confirmed_at,'+8 hours')>=? AND strftime('%Y-%m',c.confirmed_at,'+8 hours')<?)
   != (json_extract(c.facts_json,'$.performanceReportingDate.month')>=? AND json_extract(c.facts_json,'$.performanceReportingDate.month')<?)) LIMIT 1`).bind(uid,startMonth,endMonth,startMonth,endMonth).first();
 if(uncertain)throw new ShopError('調整業績月份涉及115.11續約級距，請先核對，未重新計算',409);
 const row=await db.prepare(`SELECT count(DISTINCT o.buyer_id) n FROM partner_bonus_deal_confirmations c JOIN orders o ON o.order_id=c.order_id JOIN partner_service_year_claims y ON y.order_id=o.order_id WHERE c.recruiter_uid=? AND c.deal_type='tenant_annual_fee' AND y.admission='new' AND o.payment_status='paid' AND c.confirmed_at>=? AND c.confirmed_at<?`).bind(uid,window.start,window.end).first();
 return {...window,count:row.n,percent:renewalPercent(row.n)};
}
export function entitledPortion(portion,end,originConfirmedAt){
 if(!end)return 'tier';
 if(!['notice','nonrenewal'].includes(end.ground))return 'disputed';
 if(portion==='renewal_placement')return 'ended_owner';
 return originConfirmedAt && originConfirmedAt<=end.effective_at?'retained':'disputed';
}
export function prorate(base,percent){return Math.floor(Math.round(base*100)*percent/100)/100;}
