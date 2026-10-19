// Durable self-only delivery cohorts. No private task/card text enters LINE.
import {resolveMemberIdentity} from './member-chat.mjs';
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const rows=async(db,sql,...args)=>{const r=await stmt(db,sql,...args).all();if(r.success===false||!Array.isArray(r.results))throw Error('Reminder read unavailable');return r.results;};
const WAIT_SECONDS=120;
const validJoin=`JOIN ai_advance_tasks t ON t.id=r.task_id AND t.member_id=r.member_id AND t.due_at=r.due_at AND t.status='pending'
 JOIN ai_advance_preferences p ON p.member_id=r.member_id AND p.line_id=r.line_id AND p.enabled=1`;
const dueClause="(r.manual_requested=1 OR t.due_at<=?)";
const stamp=value=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
const lineText=text=>({type:'text',text,wrap:true,size:'sm',color:'#475569'});
function bubble({heading,description,date,url,index,total,summary=false}){
 return {type:'bubble',size:'mega',header:{type:'box',layout:'vertical',backgroundColor:'#007F68',paddingAll:'16px',contents:[
  {type:'text',text:'點數通｜AI 商務導航',color:'#FFFFFF',size:'sm',weight:'bold'},
  {type:'text',text:heading,color:'#FFFFFF',weight:'bold',size:'xl',wrap:true,margin:'md'}]},
  body:{type:'box',layout:'vertical',spacing:'md',paddingAll:'20px',contents:[
   lineText(description),...(date?[lineText('任務期限（台北）'),{type:'text',text:stamp(date),size:'md',weight:'bold',wrap:true}]:[]),
   lineText('請登入查看內容、回報或延期。'),{type:'text',text:summary?'其餘任務已合併於本則通知':index+' / '+total+' 筆',size:'xs',color:'#64748B'}]},
  footer:{type:'box',layout:'vertical',paddingAll:'16px',contents:[{type:'button',style:'primary',color:'#007F68',action:{type:'uri',label:summary?'查看全部待辦':'查看此任務',uri:url}}]}};
}
export function buildAiReminderFlex(jobs,url){
 if(!jobs.length||jobs.length>300)throw Error('Invalid reminder cohort');
 const total=jobs.length,shown=total>12?11:total;
 const pages=jobs.slice(0,shown).map((job,i)=>{
  const target=new URL(url);target.searchParams.set('aiAdvanceTask',job.task_id);
  return bubble({heading:'待辦提醒 '+(i+1),description:total===1?'本則有 1 筆任務提醒，請點擊下方查看。':'本則彙整 '+total+' 筆任務提醒，左右滑動查看。',date:job.due_at,url:target.href,index:i+1,total});
 });
 if(total>12)pages.push(bubble({heading:'另有 '+(total-shown)+' 筆待辦',description:'共 '+total+' 筆提醒已合併，其他任務請至完整清單查看；不會再逐筆推送。',url,index:12,total,summary:true}));
 return {type:'flex',altText:'點數通：'+total+' 筆 AI 推進待辦提醒，已合併一則',contents:pages.length===1?pages[0]:{type:'carousel',contents:pages}};
}
export async function enqueueDueReminders(db,onlyMember,now,url){
 const at=new Date(now*1000).toISOString();
 const members=await rows(db,`SELECT t.member_id,p.line_id FROM ai_advance_tasks t JOIN ai_advance_preferences p ON p.member_id=t.member_id AND p.enabled=1
  WHERE t.status='pending' AND t.due_at<=? AND (?='' OR t.member_id=?) AND NOT EXISTS(SELECT 1 FROM ai_advance_reminders r WHERE r.task_id=t.id AND r.due_at=t.due_at)
  GROUP BY t.member_id,p.line_id ORDER BY MIN(t.due_at) LIMIT 5`,at,onlyMember,onlyMember);
 for(const member of members){
  const tasks=await rows(db,`SELECT t.id,t.revision,t.due_at FROM ai_advance_tasks t WHERE t.member_id=? AND t.status='pending' AND t.due_at<=?
   AND NOT EXISTS(SELECT 1 FROM ai_advance_reminders r WHERE r.task_id=t.id AND r.due_at=t.due_at) ORDER BY t.due_at,t.id LIMIT 300`,member.member_id,at);
  if(!tasks.length)continue;
  const data=JSON.stringify(tasks.map(t=>({id:crypto.randomUUID(),task_id:t.id,revision:t.revision,due_at:t.due_at})));
  await stmt(db,`INSERT OR IGNORE INTO ai_advance_reminders(id,task_id,member_id,line_id,revision,due_at,retry_at,created_at,target_url)
   SELECT json_extract(value,'$.id'),json_extract(value,'$.task_id'),?,?,json_extract(value,'$.revision'),json_extract(value,'$.due_at'),?,?,? FROM json_each(?)
   WHERE EXISTS(SELECT 1 FROM ai_advance_preferences WHERE member_id=? AND line_id=? AND enabled=1)`,
   member.member_id,member.line_id,now,now,url,data,member.member_id,member.line_id).run();
 }
}
async function validItems(db,batch,now){
 return rows(db,`SELECT r.* FROM ai_advance_reminders r ${validJoin} WHERE r.batch_id=? AND r.member_id=? AND r.line_id=? AND r.status='pending' AND ${dueClause} ORDER BY r.due_at,r.id`,batch.id,batch.member_id,batch.line_id,new Date(now*1000).toISOString());
}
async function finish(db,batch,status,lease){
 await db.batch([
  stmt(db,"UPDATE ai_advance_reminder_batches SET status=?,lease_until=0 WHERE id=? AND status='pending' AND lease_until=?",status,batch.id,lease),
  stmt(db,"UPDATE ai_advance_reminders SET status=?,lease_until=0 WHERE batch_id=? AND status='pending' AND EXISTS(SELECT 1 FROM ai_advance_reminder_batches WHERE id=? AND status=? AND lease_until=0)",status,batch.id,batch.id,status)
 ]);
}
async function invalidate(db,batch,now,lease,release=true){
 // Release eligible members only if this payload has never reached an HTTP attempt.
 const at=new Date(now*1000).toISOString();
 await db.batch([
  ...(release&&batch.attempts===0?[stmt(db,`UPDATE ai_advance_reminders SET batch_id='' WHERE batch_id=? AND status='pending'
   AND id IN(SELECT r.id FROM ai_advance_reminders r ${validJoin} WHERE r.batch_id=? AND ${dueClause})`,batch.id,batch.id,at)]:[]),
  stmt(db,"UPDATE ai_advance_reminders SET status='cancelled',lease_until=0 WHERE batch_id=? AND status='pending'",batch.id),
  stmt(db,"UPDATE ai_advance_reminder_batches SET status='cancelled',lease_until=0 WHERE id=? AND status='pending' AND lease_until=?",batch.id,lease)
 ]);
}
export async function processAiReminderBatches(db,env,fetcher,onlyMember,now,url){
 const at=new Date(now*1000).toISOString();
 await stmt(db,`UPDATE ai_advance_reminders SET status='cancelled' WHERE batch_id='' AND status='pending' AND attempts=0 AND (?='' OR member_id=?)
  AND NOT EXISTS(SELECT 1 FROM ai_advance_tasks t JOIN ai_advance_preferences p ON p.member_id=t.member_id
   WHERE t.id=ai_advance_reminders.task_id AND t.member_id=ai_advance_reminders.member_id AND t.due_at=ai_advance_reminders.due_at AND t.status='pending'
   AND p.line_id=ai_advance_reminders.line_id AND p.enabled=1)`,onlyMember,onlyMember).run();
 const cohorts=await rows(db,`SELECT r.member_id,r.line_id FROM ai_advance_reminders r ${validJoin}
  WHERE r.batch_id='' AND r.status='pending' AND r.attempts=0 AND ${dueClause} AND (?='' OR r.member_id=?)
  AND NOT EXISTS(SELECT 1 FROM ai_advance_reminder_batches b WHERE b.member_id=r.member_id AND b.status='pending')
  AND NOT EXISTS(SELECT 1 FROM ai_advance_reminders old WHERE old.member_id=r.member_id AND old.batch_id='' AND old.status='pending' AND old.attempts>0)
  GROUP BY r.member_id,r.line_id HAVING MIN(r.created_at)<=? OR MAX(r.manual_requested)=1 ORDER BY MIN(r.created_at) LIMIT 5`,at,onlyMember,onlyMember,now-WAIT_SECONDS);
 for(const cohort of cohorts){
  const jobs=await rows(db,`SELECT r.* FROM ai_advance_reminders r ${validJoin} WHERE r.member_id=? AND r.line_id=?
   AND r.batch_id='' AND r.status='pending' AND r.attempts=0 AND ${dueClause} ORDER BY r.due_at,r.id LIMIT 300`,cohort.member_id,cohort.line_id,at);
  if(!jobs.length)continue;
  const id=crypto.randomUUID(),keys=JSON.stringify(jobs.map(j=>j.id)),payload=JSON.stringify({to:cohort.line_id,notificationDisabled:false,messages:[buildAiReminderFlex(jobs,url)]});
  await db.batch([
   stmt(db,`INSERT OR IGNORE INTO ai_advance_reminder_batches(id,member_id,line_id,payload_json,item_count,retry_at,created_at)
    SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM ai_advance_reminders r ${validJoin} WHERE r.id IN(SELECT value FROM json_each(?))
     AND r.member_id=? AND r.line_id=? AND r.batch_id='' AND r.status='pending' AND r.attempts=0 AND ${dueClause})=?`,id,cohort.member_id,cohort.line_id,payload,jobs.length,now,now,keys,cohort.member_id,cohort.line_id,at,jobs.length),
   stmt(db,`UPDATE ai_advance_reminders SET batch_id=? WHERE id IN(SELECT value FROM json_each(?)) AND batch_id='' AND status='pending' AND attempts=0
    AND EXISTS(SELECT 1 FROM ai_advance_reminder_batches WHERE id=?)`,id,keys,id)
  ]);
 }
 const batches=await rows(db,"SELECT * FROM ai_advance_reminder_batches WHERE status='pending' AND lease_until<=? AND (retry_at<=? OR attempts>=5 OR created_at<?) AND (?='' OR member_id=?) ORDER BY created_at,id LIMIT 5",now,now,now-23*3600,onlyMember,onlyMember);
 await Promise.all(batches.map(async batch=>{
  if(batch.attempts>=5||batch.created_at<now-23*3600){await finish(db,batch,'failed',batch.lease_until);return;}
  if(batch.retry_at>now)return;
  const lease=now+120;
  // Claim before identity checks so a competing cron cannot invalidate a sender.
  const claimed=await stmt(db,"UPDATE ai_advance_reminder_batches SET lease_until=? WHERE id=? AND status='pending' AND lease_until<=? AND attempts=? AND retry_at<=?",lease,batch.id,now,batch.attempts,now).run();
  if(claimed.meta?.changes!==1)return;
  try{
   const actor=await resolveMemberIdentity(db,batch.line_id),items=await validItems(db,batch,now);
   if(actor.memberId!==batch.member_id||items.length!==batch.item_count){await invalidate(db,batch,now,lease,actor.memberId===batch.member_id);return;}
   const start=await stmt(db,`UPDATE ai_advance_reminder_batches SET attempts=attempts+1 WHERE id=? AND status='pending' AND lease_until=?
    AND (SELECT COUNT(*) FROM ai_advance_reminders r ${validJoin} WHERE r.batch_id=? AND r.member_id=? AND r.line_id=? AND r.status='pending' AND ${dueClause})=?`,batch.id,lease,batch.id,batch.member_id,batch.line_id,new Date().toISOString(),batch.item_count).run();
   if(start.meta?.changes!==1){await invalidate(db,batch,now,lease);return;}
   const response=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
    headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,'Content-Type':'application/json','X-Line-Retry-Key':batch.id},body:batch.payload_json});
   await response.body?.cancel();
   if(response.ok||(response.status===409&&response.headers.get('x-line-accepted-request-id')))await finish(db,batch,'sent',lease);
   else if(response.status<500)await finish(db,batch,'failed',lease);
   else throw Error('LINE_TEMPORARY_FAILURE');
  }catch(error){
   if(error.code==='IDENTITY_CONFLICT'||error.code==='MEMBER_REQUIRED'){await invalidate(db,batch,now,lease,false);return;}
   await stmt(db,"UPDATE ai_advance_reminder_batches SET lease_until=0,retry_at=? WHERE id=? AND status='pending' AND lease_until=?",now+60*2**batch.attempts,batch.id,lease).run();
   console.warn('ai_advance_batch_retry');
  }
 }));
}
