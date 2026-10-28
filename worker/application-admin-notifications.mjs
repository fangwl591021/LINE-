// Signed applications remain authoritative even when notification delivery fails.
// This runner uses only existing registered administrators and never reads signatures/bank fields.
import {resolveStoreAdminActor,DirectoryError} from './store-admin.mjs';
const UID=/^U[0-9a-f]{32}$/i,UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const AUTH_FIELDS=['row_id','line_id','legacy_line_id','point_line_id','role','name','phone'];
const LABELS={reward:'贈點單位申請',discount:'特約折抵店家申請',partner:'共創夥伴115.10契約',full:'雙向完整版申請'};
const WAIT_SECONDS=30,MAX_ITEMS=10,MAX_ADMINS=20,MAX_BATCHES=1;
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
async function rows(db,sql,...args){const r=await stmt(db,sql,...args).all();if(r.success===false||!Array.isArray(r.results))throw Error('Application notice read unavailable');return r.results;}
const canonical=`(SELECT COUNT(*) FROM users same_uid WHERE same_uid.line_id=u.line_id)=1
 AND NOT EXISTS(SELECT 1 FROM user_identity_links l JOIN users current_member ON current_member.line_id=l.new_line_id
  WHERE l.status='active' AND l.old_line_id=u.line_id AND current_member.row_id<>u.row_id)
 AND NOT EXISTS(SELECT 1 FROM user_identity_links l WHERE l.status='active' AND u.line_id IN(l.old_line_id,l.new_line_id)
  AND (l.old_line_id=l.new_line_id OR length(l.old_line_id)<>33 OR length(l.new_line_id)<>33
   OR substr(l.old_line_id,1,1) NOT IN('U','u') OR substr(l.new_line_id,1,1) NOT IN('U','u')
   OR substr(l.old_line_id,2) GLOB '*[^0-9a-fA-F]*' OR substr(l.new_line_id,2) GLOB '*[^0-9a-fA-F]*'
   OR (SELECT COUNT(*) FROM user_identity_links other WHERE other.status='active'
    AND (other.old_line_id IN(l.old_line_id,l.new_line_id) OR other.new_line_id IN(l.old_line_id,l.new_line_id)))<>1))`;
const validUid="length(u.line_id)=33 AND substr(u.line_id,1,1) IN('U','u') AND substr(u.line_id,2) NOT GLOB '*[^0-9a-fA-F]*'";
const candidate=`${validUid} AND ${canonical} AND (lower(trim(u.role)) IN('admin','總管')
 OR EXISTS(SELECT 1 FROM json_each(?1,'$.ids') configured_id WHERE configured_id.value IN(u.line_id,u.row_id,u.legacy_line_id,u.point_line_id))
 OR EXISTS(SELECT 1 FROM json_each(?1,'$.names') configured_name WHERE length(configured_name.value)>0 AND instr(COALESCE(u.name,''),configured_name.value)>0))`;
function snapshotGate(prefix='u',json='j.value'){
 return AUTH_FIELDS.map(field=>`${prefix}.${field} IS json_extract(${json},'$.${field}')`).join(' AND ');
}
const eligibleRecipient=`EXISTS(SELECT 1 FROM users u WHERE ${candidate} AND ${AUTH_FIELDS.map(field=>'u.'+field+' IS ?').join(' AND ')})`;
function existingAdmins(hardAdminIds,hardAdminNames){
 // Names are only a necessary candidate clue for the existing phone+name authority.
 // The original mapper must still verify the entire stored account; a name alone grants nothing.
 return JSON.stringify({ids:[...new Set((Array.isArray(hardAdminIds)?hardAdminIds:[]).filter(id=>UID.test(id)))],names:[...new Set((Array.isArray(hardAdminNames)?hardAdminNames:[]).filter(name=>typeof name==='string'&&name.trim()&&name.length<=100))]});
}
async function recipient(db,memberId,lineId,profileMapper,ids){
 const found=await rows(db,`SELECT ${AUTH_FIELDS.map(field=>'u.'+field).join(',')} FROM users u WHERE ${candidate} AND CAST(u.row_id AS TEXT)=?2 AND u.line_id=?3 LIMIT 2`,ids,memberId,lineId);
 if(found.length!==1||profileMapper(found[0])?.role!=='admin')return null;
 try{
  // Reuse the exact admin-page identity resolver. Candidate clues are not authority.
  const verified=await resolveStoreAdminActor(db,lineId,profileMapper);
  if(String(verified?.row_id)!==memberId||verified.line_id!==lineId)return null;
  return verified;
 }catch(error){if(error instanceof DirectoryError)return null;throw error;}
}
function reviewUrl(liffId,kind,id){
 if(!/^\d+-[A-Za-z0-9]+$/.test(liffId)||!Object.hasOwn(LABELS,kind)||!UUID.test(id))throw Error('Invalid application notice destination');
 const url=new URL('https://liff.line.me/'+liffId);url.searchParams.set('shopSection','mine');url.searchParams.set('applicationReview','1');url.searchParams.set('applicationKind',kind);url.searchParams.set('applicationId',id);return url.href;
}
function stamp(value){const parsed=new Date(value);return Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(parsed):'請登入查看簽署時間';}
export function buildApplicationAdminNoticeFlex(items,liffId){
 if(!Array.isArray(items)||!items.length||items.length>MAX_ITEMS)throw Error('Invalid application notice cohort');
 const pages=items.map((item,index)=>({type:'bubble',size:'mega',header:{type:'box',layout:'vertical',paddingAll:'16px',backgroundColor:'#007F68',contents:[
  {type:'text',text:'點數通｜合作申請待審核',color:'#FFFFFF',size:'sm',weight:'bold'},
  {type:'text',text:LABELS[item.kind]||'合作申請',color:'#FFFFFF',size:'xl',weight:'bold',wrap:true,margin:'md'}]},
  body:{type:'box',layout:'vertical',paddingAll:'20px',spacing:'md',contents:[
   {type:'text',text:'已收到完整資料與手寫簽名，請管理員登入核對。',wrap:true,size:'md'},
   {type:'text',text:'簽署時間（台北）：'+stamp(item.signed_at),wrap:true,size:'sm',color:'#475569'},
   {type:'text',text:(index+1)+' / '+items.length+' 份'+(items.length>1?'・左右滑動查看':''),size:'xs',color:'#64748B'}]},
  footer:{type:'box',layout:'vertical',paddingAll:'16px',contents:[{type:'button',style:'primary',color:'#007F68',action:{type:'uri',label:'查看簽署申請',uri:reviewUrl(liffId,item.kind,item.application_id)}}]}}));
 return {type:'flex',altText:'點數通：收到 '+items.length+' 份已簽合作申請，請審核',contents:pages.length===1?pages[0]:{type:'carousel',contents:pages}};
}
async function fanout(db,profileMapper,ids,now){
 const candidates=await rows(db,`SELECT ${AUTH_FIELDS.map(field=>'u.'+field).join(',')} FROM users u WHERE ${candidate} ORDER BY CAST(u.row_id AS TEXT) LIMIT ${MAX_ADMINS+1}`,ids);
 if(candidates.length>MAX_ADMINS)throw Error('Application administrator list requires review');
 const admins=candidates.filter(row=>profileMapper(row)?.role==='admin');
 if(!admins.length)return;
 const events=await rows(db,'SELECT kind,application_id FROM application_admin_notice_events WHERE fanout_at=0 ORDER BY created_at,kind,application_id LIMIT 20');
 if(!events.length)return;
 const keys=JSON.stringify(events.map(event=>event.kind+':'+event.application_id)),targets=JSON.stringify(admins);
 await db.batch([
  stmt(db,`INSERT OR IGNORE INTO application_admin_notice_deliveries(kind,application_id,member_id,line_id,created_at)
   SELECT e.kind,e.application_id,CAST(json_extract(j.value,'$.row_id') AS TEXT),json_extract(j.value,'$.line_id'),?
   FROM application_admin_notice_events e CROSS JOIN json_each(?) j WHERE e.fanout_at=0
   AND e.kind||':'||e.application_id IN(SELECT value FROM json_each(?))
   AND EXISTS(SELECT 1 FROM users u WHERE ${candidate.replaceAll('?1','?4')} AND ${snapshotGate()} )`,now,targets,keys,ids),
  stmt(db,`UPDATE application_admin_notice_events SET fanout_at=? WHERE fanout_at=0 AND kind||':'||application_id IN(SELECT value FROM json_each(?))
   AND EXISTS(SELECT 1 FROM application_admin_notice_deliveries d WHERE d.kind=application_admin_notice_events.kind AND d.application_id=application_admin_notice_events.application_id)`,now,keys)
 ]);
}
async function finish(db,batch,status,lease,now){
 await db.batch([
  stmt(db,"UPDATE application_admin_notice_batches SET status=?,lease_until=0,finished_at=? WHERE id=? AND status='pending' AND lease_until=?",status,now,batch.id,lease),
  stmt(db,"UPDATE application_admin_notice_deliveries SET status=? WHERE batch_id=? AND status='pending' AND EXISTS(SELECT 1 FROM application_admin_notice_batches WHERE id=? AND status=? AND lease_until=0)",status,batch.id,batch.id,status)
 ]);
}
async function createBatches(db,env,profileMapper,ids,now){
 const cohorts=await rows(db,`SELECT d.member_id,d.line_id FROM application_admin_notice_deliveries d JOIN application_admin_notice_events e ON e.kind=d.kind AND e.application_id=d.application_id
  WHERE d.status='pending' AND d.batch_id='' AND NOT EXISTS(SELECT 1 FROM application_admin_notice_batches b WHERE b.member_id=d.member_id AND b.status='pending')
  GROUP BY d.member_id,d.line_id HAVING MIN(e.created_at)<=? ORDER BY MIN(e.created_at) LIMIT ${MAX_BATCHES}`,now-WAIT_SECONDS);
 const liffId=String(env.POINT_LIFF_ID||env.LIFF_ID||'1660923784-vViMTZ1y').trim();
 for(const cohort of cohorts){
  const admin=await recipient(db,cohort.member_id,cohort.line_id,profileMapper,ids);
  if(!admin){await stmt(db,"UPDATE application_admin_notice_deliveries SET status='cancelled' WHERE member_id=? AND line_id=? AND status='pending' AND batch_id=''",cohort.member_id,cohort.line_id).run();continue;}
  const items=await rows(db,`SELECT d.kind,d.application_id,e.signed_at FROM application_admin_notice_deliveries d JOIN application_admin_notice_events e ON e.kind=d.kind AND e.application_id=d.application_id
   WHERE d.member_id=? AND d.line_id=? AND d.status='pending' AND d.batch_id='' ORDER BY e.created_at,d.kind,d.application_id LIMIT ${MAX_ITEMS}`,cohort.member_id,cohort.line_id);
  if(!items.length)continue;
  const key=crypto.randomUUID(),keys=JSON.stringify(items.map(item=>item.kind+':'+item.application_id)),payload=JSON.stringify({to:cohort.line_id,notificationDisabled:false,messages:[buildApplicationAdminNoticeFlex(items,liffId)]});
  await db.batch([
   stmt(db,`INSERT OR IGNORE INTO application_admin_notice_batches(id,member_id,line_id,payload_json,item_count,retry_at,created_at)
    SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM application_admin_notice_batches WHERE member_id=? AND status='pending')
    AND (SELECT COUNT(*) FROM application_admin_notice_deliveries WHERE member_id=? AND line_id=? AND status='pending' AND batch_id='' AND kind||':'||application_id IN(SELECT value FROM json_each(?)))=?
    AND ${eligibleRecipient.replaceAll('?1','?13')}`,key,cohort.member_id,cohort.line_id,payload,items.length,now,now,cohort.member_id,cohort.member_id,cohort.line_id,keys,items.length,ids,...AUTH_FIELDS.map(field=>admin[field]??null)),
   stmt(db,`UPDATE application_admin_notice_deliveries SET batch_id=? WHERE member_id=? AND line_id=? AND status='pending' AND batch_id=''
    AND kind||':'||application_id IN(SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM application_admin_notice_batches WHERE id=?)`,key,cohort.member_id,cohort.line_id,keys,key)
  ]);
 }
}
export async function processApplicationAdminNotifications(env,{profileMapper,hardAdminIds=[],hardAdminNames=[],fetcher=fetch,now=Math.floor(Date.now()/1000)}={}){
 if(!env?.LINE_CHANNEL_ACCESS_TOKEN||!env?.ACTMASTER_DB||typeof profileMapper!=='function')return;
 const db=env.ACTMASTER_DB.withSession?env.ACTMASTER_DB.withSession('first-primary'):env.ACTMASTER_DB,ids=existingAdmins(hardAdminIds,hardAdminNames);
 await fanout(db,profileMapper,ids,now);
 await createBatches(db,env,profileMapper,ids,now);
 const batches=await rows(db,`SELECT * FROM application_admin_notice_batches WHERE status='pending' AND lease_until<=? AND (retry_at<=? OR attempts>=5 OR created_at<?) ORDER BY created_at,id LIMIT ${MAX_BATCHES}`,now,now,now-23*3600);
 for(const batch of batches){
  if(batch.attempts>=5||batch.created_at<now-23*3600){await finish(db,batch,'failed',batch.lease_until,now);continue;}
  const lease=now+120,claimed=await stmt(db,"UPDATE application_admin_notice_batches SET lease_until=? WHERE id=? AND status='pending' AND lease_until<=? AND attempts=? AND retry_at<=?",lease,batch.id,now,batch.attempts,now).run();
  if(claimed.meta?.changes!==1)continue;
  try{
   const admin=await recipient(db,batch.member_id,batch.line_id,profileMapper,ids);
   if(!admin){await finish(db,batch,'cancelled',lease,now);continue;}
   const started=await stmt(db,`UPDATE application_admin_notice_batches SET attempts=attempts+1 WHERE id=? AND status='pending' AND lease_until=? AND ${eligibleRecipient.replaceAll('?1','?3')}`,batch.id,lease,ids,...AUTH_FIELDS.map(field=>admin[field]??null)).run();
   if(started.meta?.changes!==1){await finish(db,batch,'cancelled',lease,now);continue;}
   const current=await recipient(db,batch.member_id,batch.line_id,profileMapper,ids);
   if(!current||AUTH_FIELDS.some(field=>(current[field]??null)!==(admin[field]??null))){await finish(db,batch,'cancelled',lease,now);continue;}
   const response=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,'Content-Type':'application/json','X-Line-Retry-Key':batch.id},body:batch.payload_json});
   await response.body?.cancel();
   if(response.ok||(response.status===409&&response.headers.get('x-line-accepted-request-id')))await finish(db,batch,'sent',lease,now);
   else if(response.status<500&&response.status!==429)await finish(db,batch,'failed',lease,now);
   else throw Error('Application notice temporary delivery failure');
  }catch{
   // Timeout may mean accepted by LINE; retain the frozen body, destination and retry UUID.
   await stmt(db,"UPDATE application_admin_notice_batches SET lease_until=0,retry_at=? WHERE id=? AND status='pending' AND lease_until=?",now+60*2**batch.attempts,batch.id,lease).run();
   console.warn('application_admin_notice_retry');
  }
 }
}
