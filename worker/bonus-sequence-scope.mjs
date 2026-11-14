import {dateBounds} from './bonus-sequence-evidence.mjs';
const RESET='2026-10',RESET_UTC=Date.parse('2026-10-01T00:00:00+08:00');
function taipeiMonth(value){const at=Date.parse(value);return Number.isFinite(at)?new Date(at+8*3600000).toISOString().slice(0,7):'';}
// Read-only screen for records the system knows. The administrator's explicit
// statement supplies the scope declaration, not proof of off-system facts.
export function assessSequenceScope(d,orders,awards){
 const reasons=[];
 if(d.confirmedComplete!==true||d.periodFrom!==RESET)reasons.push('ORDERING_SCOPE_UNVERIFIED');
 if(orders.length>500||awards.length>500)reasons.push('SCOPE_REQUIRES_NARROWER_REVIEW');
 const selected=new Set(d.orderIds);
 for(const row of orders){
  const bounds=dateBounds(row.precision,row.value),m=bounds?row.value.slice(0,7):'';
  const oldWithoutDate=!m&&Number.isFinite(Date.parse(row.confirmed_at))&&Date.parse(row.confirmed_at)<RESET_UTC;
  if(!m&&!oldWithoutDate){reasons.push('SCOPE_ORDER_DATE_UNVERIFIED');continue;}
  if(oldWithoutDate||m<RESET)continue;
  if(m<=d.periodTo&&!selected.has(row.order_id))reasons.push('SCOPE_ORDER_MISSING');
  if(row.confirmed_at||row.has_awards||row.has_statement)reasons.push('EXISTING_CONFIRMATION_IMPACT');
 }
 for(const row of awards){
  const m=row.reporting_month?(/^20\d\d-(0[1-9]|1[0-2])$/.test(row.reporting_month)?row.reporting_month:''):taipeiMonth(row.confirmed_at);
  if(!m||m>=RESET)reasons.push('EXISTING_CONFIRMATION_IMPACT');
 }
 return [...new Set(reasons)];
}
