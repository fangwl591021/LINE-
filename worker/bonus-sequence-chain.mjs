// Read-only qualification checks for an entire Taiwan-local date interval.
// This does NOT establish a sale, service opening or complete batch population.
const UID=/^U[0-9a-f]{32}$/i;
const POLICY='cocreator-115.10-v3';
const CUTOFF='2026-09-30T16:00:00.000Z'; // 2026-10-01 00:00 Asia/Taipei
const pending=reason=>({status:'review_required',reasons:[reason]});
class ReadBudgetExceeded extends Error{}

// Share one budget across the whole request. A caller must verify the shared
// finance revision before AND after all reads; this cache is request-scoped.
export function createSequenceReadBudget(sourceDb,maxReads=30){
 if(!sourceDb||!Number.isSafeInteger(maxReads)||maxReads<1||maxReads>30)throw Error('invalid read budget');
 const cache=new Map(),state={used:0,maxReads};
 const db={prepare(sql){
  const statement=args=>({
   bind(...values){return statement(values);},
   async first(){return read('first',args);},
   async all(){return read('all',args);}
  });
  async function read(method,args){
   const key=JSON.stringify([sql,method,args]);if(cache.has(key))return cache.get(key);
   if(state.used>=maxReads)throw new ReadBudgetExceeded();
   state.used++;
   const promise=(async()=>{const result=await sourceDb.prepare(sql).bind(...args)[method]();if(method==='all'&&(!Array.isArray(result?.results)||result.results.length>1000))throw new ReadBudgetExceeded();return result;})();
   cache.set(key,promise);return promise;
  }
  return statement([]);
 }};
 return {db,state};
}

export async function readSequenceQualification(ctx,snapshot,order,interval,budget){
 try{return await readSequenceQualificationBounded(ctx,snapshot,order,interval,budget);}catch(e){if(e instanceof ReadBudgetExceeded)return pending('QUALIFICATION_QUERY_BUDGET_EXCEEDED');throw e;}
}
async function readSequenceQualificationBounded(ctx,snapshot,order,interval,budget){
 const {first,member,activeContract,currentAttribution,buildFacts}=ctx||{};
 const db=budget?.db;
 if(!db||![first,member,activeContract,currentAttribution,buildFacts].every(f=>typeof f==='function'))return pending('QUALIFICATION_READER_UNAVAILABLE');
 if(!snapshot||!order||snapshot.order_id!==order.order_id||snapshot.buyer_uid!==order.buyer_id||snapshot.policy_version!==POLICY||order.bonus_policy_type!==POLICY||order.order_type!=='tenant_annual_fee'||!UID.test(snapshot.recruiter_uid||'')||!UID.test(snapshot.buyer_uid||'')||snapshot.recruiter_uid===snapshot.buyer_uid)return pending('ORDER_OR_IDENTITY_UNVERIFIED');
 const start=interval?.start,end=interval?.end;
 const startMs=Date.parse(start),endMs=Date.parse(end);
 if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs>=endMs||new Date(startMs).toISOString()!==start||new Date(endMs).toISOString()!==end||start<CUTOFF||endMs>Date.now())return pending('QUALIFICATION_TIME_UNVERIFIED');
 await member(db,snapshot.buyer_uid);const recruiter=await member(db,snapshot.recruiter_uid);
 if(recruiter?.crm_project_independent_at&&recruiter.crm_project_independent_at>start&&recruiter.crm_project_independent_at<end)return pending('QUALIFICATION_CHANGES_IN_INTERVAL');
 if(recruiter?.crm_project_independent_at&&recruiter.crm_project_independent_at<=start){
  // The mutable CRM projection alone cannot prove that an administrator
  // actually granted the independent exception at that time.
  const result=await db.prepare("SELECT id,event_json FROM partner_bonus_v2_status_events WHERE status='project_approved' AND created_at=? AND substr(id,1,8)='project:' AND json_valid(event_json) AND json_extract(event_json,'$.target')=? AND json_type(event_json,'$.independent')='true' LIMIT 2").bind(recruiter.crm_project_independent_at,snapshot.recruiter_uid).all();
  if(!Array.isArray(result?.results)||result.results.length!==1)return pending('PROJECT_AUTHORIZATION_UNVERIFIED');
  let event;try{event=JSON.parse(result.results[0].event_json);}catch{return pending('PROJECT_AUTHORIZATION_UNVERIFIED');}
  if(!UID.test(event?.actor||'')||typeof event.reason!=='string'||!event.reason.trim())return pending('PROJECT_AUTHORIZATION_UNVERIFIED');
 }
 async function atTime(at){
  const contract=await activeContract(db,snapshot.recruiter_uid,at);
  if(!contract||contract.id!==snapshot.contract_id||contract.policy_version!==POLICY)return pending('RECRUITER_CONTRACT_UNVERIFIED');
  const facts=await buildFacts(db,snapshot,order,at);
  if(!facts||facts.invalidatedQualification!==false||facts.historicalQualificationUnknown||!Number.isSafeInteger(facts.netAmount)||facts.netAmount<=0)return pending('RECRUITER_QUALIFICATION_UNVERIFIED');
  if(facts.projectIndependentAt&&facts.projectIndependentAt>start)return pending('QUALIFICATION_CHANGES_IN_INTERVAL');
  if(recruiter?.crm_project_independent_at&&recruiter.crm_project_independent_at<=start&&!facts.projectIndependentAt)return pending('RECRUITER_QUALIFICATION_UNVERIFIED');
  if(!facts.projectIndependentAt&&typeof facts.selfPurchased!=='boolean')return pending('PURCHASE_AT_DEAL_UNVERIFIED');
  const participants=new Set([snapshot.recruiter_uid]),chain=[];
  if(!facts.projectIndependentAt){
   let id=facts.directSponsor;
   if(!UID.test(id||''))return pending('UPLINE_HISTORY_UNVERIFIED');
   while(id){
    if(chain.length>=40||participants.has(id)||!UID.test(id))return pending('UPLINE_HISTORY_UNVERIFIED');
    participants.add(id);await member(db,id);
    const ancestor=await activeContract(db,id,at);
    if(!ancestor||ancestor.policy_version!==POLICY)return pending('UPLINE_CONTRACT_UNVERIFIED');
    const invalid=await first(db,"SELECT 1 FROM partner_bonus_deal_confirmations c JOIN orders o ON o.order_id=c.order_id WHERE c.recruiter_uid=? AND c.deal_type='tenant_annual_fee' AND o.payment_status!='paid' LIMIT 1",id);
    if(invalid)return pending('UPLINE_QUALIFICATION_UNVERIFIED');
    chain.push({uid:id,eligible:true,invalidatedQualification:false,validDeals:0,contractId:ancestor.id});
    const relation=await currentAttribution(db,id,at);id=relation?.manager_uid||ancestor.sponsor_uid||'';
   }
  }
  return {status:'ok',participants:[...participants],facts:{...facts,priorValidDeals:0,upline:chain,chainComplete:true}};
 }
 const initial=await atTime(start);if(initial.status!=='ok')return initial;
 const final=await atTime(new Date(endMs-1).toISOString());if(final.status!=='ok')return final;
 const stable=x=>JSON.stringify({participants:x.participants,selfPurchased:x.facts.selfPurchased??null,projectIndependentAt:x.facts.projectIndependentAt||'',directSponsor:x.facts.directSponsor||'',contracts:x.facts.upline.map(y=>y.contractId)});
 if(stable(initial)!==stable(final))return pending('QUALIFICATION_CHANGES_IN_INTERVAL');
 const participants=initial.participants;
 for(const id of participants){
  const existing=await first(db,"SELECT 1 FROM partner_bonus_deal_confirmations WHERE recruiter_uid=? AND deal_type='tenant_annual_fee' AND confirmed_at>=? LIMIT 1",id,CUTOFF);
  if(existing)return pending('EXISTING_CONFIRMATION_IMPACT');
  const enrollment=await first(db,"SELECT 1 FROM partner_contract_enrollments WHERE member_uid=? AND ((signed_at>? AND signed_at<?) OR (effective_at>? AND effective_at<?) OR (verified_at>? AND verified_at<?)) LIMIT 1",id,start,end,start,end,start,end);
  const life=await first(db,"SELECT 1 FROM partner_contract_lifecycle_events l JOIN partner_contract_enrollments e ON e.id=l.contract_id WHERE e.member_uid=? AND ((l.effective_at>? AND l.effective_at<?) OR (l.verified_at>? AND l.verified_at<?)) LIMIT 1",id,start,end,start,end);
  const relation=await first(db,"SELECT 1 FROM partner_attribution_events WHERE target_uid=? AND ((effective_at>? AND effective_at<?) OR (verified_at>? AND verified_at<?)) LIMIT 1",id,start,end,start,end);
  const purchase=await first(db,"SELECT 1 FROM orders WHERE buyer_id=? AND order_type IN ('tenant_annual_fee','tenant_renewal_fee') AND payment_status='paid' AND paid_at>? AND paid_at<? LIMIT 1",id,start,end);
  if(enrollment||life||relation||purchase)return pending('QUALIFICATION_CHANGES_IN_INTERVAL');
 }
 return {status:'locally_verified_qualification',qualificationInterval:{start,end},participants,facts:initial.facts,requiresBatchAndServiceVerification:true};
}
