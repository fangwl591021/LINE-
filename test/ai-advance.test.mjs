import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleAiAdvance, processAiAdvanceReminders } from '../worker/ai-advance.mjs';
const A='U'+'a'.repeat(32), B='U'+'b'.repeat(32), OLD='U'+'c'.repeat(32);
function fixture(t) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,name TEXT,role TEXT);
    CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
    CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,name TEXT,company_name TEXT,title TEXT,scanner_user_id TEXT,creator_id TEXT,owner_user_id TEXT,source_type TEXT,archived_at TEXT,merged_into_row_id TEXT);
    CREATE TABLE points_ledger(id TEXT); CREATE TABLE agenda(id TEXT);
    INSERT INTO users VALUES('member-a','${A}','甲','user'),('member-b','${B}','乙','admin');
    INSERT INTO user_identity_links VALUES('${OLD}','${A}','active');
    INSERT INTO card_contacts VALUES('contact-a','王小明','範例公司','經理','${A}','','','ocr_scan','',''),('contact-b','別人的名片','公司','經理','${B}','','${A}','ocr_scan','',''),('self-a','本人','','','${A}','','','self_profile','',''),('archived-a','封存','','','${A}','','','ocr_scan','2026-01-01',''),('legacy-a','舊名片','','','','${OLD}','','ocr_scan','','');`);
  sql.exec(readFileSync(new URL('../migrations/0054_ai_advance_tasks.sql',import.meta.url),'utf8'));
  let beforeWrite=null, aiStatus=200, pushStatus=200, invalidAi=false, authStatus=200;
  const writes=[], pushes=[], aiCalls=[], background=[];
  function prepare(query,args=[]) {
    return {bind(...values){return prepare(query,values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async run(){
      beforeWrite?.(query,args);assert.match(query,/^\s*(INSERT(?: OR IGNORE)? INTO|UPDATE|DELETE FROM) ai_advance_/);writes.push(query);const result=sql.prepare(query).run(...args);return {success:true,meta:{changes:Number(result.changes)}};
    }};
  }
  const db={prepare,withSession(){return this;},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const env={ACTMASTER_DB:db,OPENAI_API_KEY:'fixture-openai-key',OPENAI_MODEL:'configured-model',LINE_CHANNEL_ACCESS_TOKEN:'fixture-line-key'};
  const fetcher=async(url,options)=>{
    if(url==='https://api.line.me/v2/profile'){
      const uid={a:A,b:B,old:OLD}[options.headers.Authorization.slice(7)];return new Response(JSON.stringify({userId:uid}),{status:uid?authStatus:401});
    }
    if(url==='https://api.openai.com/v1/responses'){
      aiCalls.push(JSON.parse(options.body));assert.equal(options.headers.Authorization,'Bearer fixture-openai-key');
      return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:invalidAi?'{}':JSON.stringify({createNextTask:true,title:'下週確認合作提案',description:'依回報聯繫，確認對方需求',dueInDays:7,priority:'normal',reason:'對方希望下週再討論'})}]}]}),{status:aiStatus});
    }
    assert.equal(url,'https://api.line.me/v2/bot/message/push');pushes.push({body:JSON.parse(options.body),key:options.headers['X-Line-Retry-Key']});
    if(pushStatus==='timeout')throw Error('timeout');return new Response('{}',{status:pushStatus,headers:pushStatus===409?{'x-line-accepted-request-id':'accepted'}:{}});
  };
  const ctx={waitUntil(promise){background.push(promise);}};
  async function api(path,{token='a',data,method=data===undefined?'GET':'POST'}={}){
    const response=await handleAiAdvance(new Request('https://point.test/v1/ai-advance'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),env,ctx,fetcher);
    if(response.status===204)return {status:204};return {httpStatus:response.status,status:response.status,...await response.json()};
  }
  const input=()=>({requestKey:crypto.randomUUID(),title:'寄送合作提案',description:'討論店家合作',dueAt:'2026-01-01T06:00:00.000Z',priority:'normal',contactCardId:'contact-a'});
  async function create(data=input()){const result=await api('/tasks',{data});assert.equal(result.success,true,JSON.stringify(result));return result.task;}
  const report=(task,action='complete',note='已寄出提案，對方希望下週聯繫')=>api('/tasks/'+task.id+'/action',{data:{requestKey:crypto.randomUUID(),revision:task.revision,action,note,...(action==='postpone'?{dueAt:'2099-01-01T06:00:00.000Z'}:{})}});
  const drain=()=>processAiAdvanceReminders(env,fetcher), settle=()=>Promise.all(background.splice(0));
  return {sql,db,env,api,input,create,report,drain,settle,writes,pushes,aiCalls,setAi(v){aiStatus=v;},invalidAi(v){invalidAi=v;},setPush(v){pushStatus=v;},setAuth(v){authStatus=v;},beforeWrite(fn){beforeWrite=fn;}};
}
test('only verified members see their own active collected contacts and tasks; no unrelated writes',async t=>{
  const f=fixture(t);assert.equal((await f.api('/dashboard',{token:''})).status,401);assert.equal((await f.api('/dashboard',{token:'spoof'})).status,401);
  assert.equal((await f.api('/dashboard?memberId=member-b')).status,400);
  const dash=await f.api('/dashboard');assert.deepEqual(dash.contacts.map(c=>c.row_id).sort(),['contact-a','legacy-a']);assert.equal(dash.notifications,false);
  const task=await f.create();assert.equal((await f.api('/tasks/'+task.id,{token:'b'})).status,404);
  assert.equal((await f.api('/tasks/'+task.id+'/action',{token:'b',data:{requestKey:crypto.randomUUID(),revision:0,action:'complete',note:'hijack'}})).status,404);
  assert.equal((await f.api('/dashboard',{token:'old'})).tasks[0].id,task.id);
  for(const contactCardId of ['contact-b','self-a','archived-a','missing'])assert.equal((await f.api('/tasks',{data:{...f.input(),contactCardId}})).status,403);
  assert.equal((await f.api('/tasks',{data:{...f.input(),memberId:'member-b'}})).status,400);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM points_ledger').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM agenda').get().n,0);
  f.setAuth(500);assert.equal((await f.api('/dashboard')).status,503);
});
test('explicit linked identity ambiguity fails closed, feature kill switch and route isolation',async t=>{
  const f=fixture(t);f.sql.exec(`INSERT INTO user_identity_links VALUES('${A}','${B}','active')`);assert.equal((await f.api('/dashboard')).status,409);
  f.env.AI_ADVANCE_DISABLED='1';assert.equal((await f.api('/dashboard')).status,503);assert.equal((await f.api('/dashboard',{method:'OPTIONS',token:''})).status,204);
  assert.equal(await handleAiAdvance(new Request('https://point.test/v1/member-chat/dashboard'),f.env),null);
});
test('create/report retries and stale revisions cannot duplicate records; input limits and dates',async t=>{
  const f=fixture(t), input=f.input(),task=await f.create(input);assert.equal((await f.create(input)).id,task.id);
  const data={requestKey:crypto.randomUUID(),revision:0,action:'complete',note:'已完成'};
  const first=await f.api('/tasks/'+task.id+'/action',{data});assert.equal(first.task.revision,1);
  assert.equal((await f.api('/tasks/'+task.id+'/action',{data})).success,true);
  assert.equal((await f.report(task)).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_advance_events').get().n,2);
  assert.equal((await f.report(first.task,'cancel')).status,409);assert.equal((await f.report(first.task,'note')).success,true);
  for(const bad of [{title:''},{title:'x'.repeat(121)},{dueAt:'2026-02-31T06:00:00.000Z'},{priority:'unknown'},{description:'x'.repeat(2001)}])assert.equal((await f.api('/tasks',{data:{...f.input(),...bad}})).status,400);
  assert.equal((await f.api('/tasks',{data:{...f.input(),description:'x'.repeat(20000)}})).status,413);
});
test('AI uses existing configured key/model, bounded private context, and creates nothing until confirmation',async t=>{
  const f=fixture(t),task=await f.create();assert.equal((await f.api('/tasks/'+task.id+'/suggest',{data:{revision:0}})).status,400);
  const updated=(await f.report(task)).task;
  assert.equal((await f.api('/tasks/'+task.id+'/suggest',{data:{revision:updated.revision}})).httpStatus,202);await f.settle();
  assert.equal(f.aiCalls.length,1);assert.equal(f.aiCalls[0].model,'configured-model');assert.equal(f.aiCalls[0].store,false);assert.ok(f.aiCalls[0].max_output_tokens<=1200);
  assert.doesNotMatch(JSON.stringify(f.aiCalls),/fixture-openai-key|member-a|owner_user_id|scanner_user_id|phone|email/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_advance_tasks').get().n,1);
  await f.api('/tasks/'+task.id+'/suggest',{data:{revision:updated.revision}});await f.settle();assert.equal(f.aiCalls.length,1);
  const suggestion=await f.api('/tasks/'+task.id+'/suggestion');assert.equal(suggestion.status,'completed');assert.equal(suggestion.suggestion.title,'下週確認合作提案');
  const accept={revision:updated.revision,dueAt:'2026-12-01T06:00:00.000Z'};
  const next=await f.api('/tasks/'+task.id+'/accept',{data:accept});assert.equal(next.success,true,JSON.stringify(next));assert.equal(next.task.parent_id,task.id);
  assert.equal((await f.api('/tasks/'+task.id+'/accept',{data:accept})).task.id,next.task.id);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_advance_tasks').get().n,2);
  await f.report(updated,'note');assert.equal((await f.api('/tasks/'+task.id+'/accept',{data:accept})).status,409);
});
test('request key collision cannot mutate another task; failed event batch rolls task back',async t=>{
  const f=fixture(t),task=await f.create(),other=await f.create(),key=crypto.randomUUID();
  assert.equal((await f.api('/tasks/'+task.id+'/action',{data:{requestKey:key,revision:0,action:'note',note:'補紀錄'}})).success,true);
  assert.equal((await f.api('/tasks/'+other.id+'/action',{data:{requestKey:key,revision:0,action:'complete',note:'不應更新'}})).status,409);
  assert.equal((await f.api('/tasks',{data:{...f.input(),requestKey:key}})).status,409);
  assert.equal((await f.api('/tasks/'+other.id)).task.revision,0);
  f.beforeWrite(query=>{if(query.includes('INTO ai_advance_events'))throw Error('simulated failed event');});
  assert.equal((await f.report(other)).status,503);f.beforeWrite(null);
  assert.equal((await f.api('/tasks/'+other.id)).task.status,'pending');assert.equal((await f.api('/tasks/'+other.id)).events.length,1);
});
test('failed AI has bounded retries and missing key never creates fake suggestions',async t=>{
  const f=fixture(t),task=(await f.report(await f.create())).task;f.setAi(503);
  for(let n=0;n<4;n++){await f.api('/tasks/'+task.id+'/suggest',{data:{revision:task.revision}});await f.settle();}
  assert.equal(f.aiCalls.length,3);assert.equal((await f.api('/tasks/'+task.id+'/suggestion')).status,'failed');
  assert.equal((await f.api('/tasks/'+task.id+'/accept',{data:{revision:task.revision,dueAt:'2026-12-01T06:00:00.000Z'}})).status,400);
  delete f.env.OPENAI_API_KEY;assert.equal((await f.api('/tasks/'+task.id+'/suggest',{data:{revision:task.revision}})).status,503);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_advance_tasks').get().n,1);
});
test('AI daily budget limits reservations and invalid provider JSON is never accepted',async t=>{
  const f=fixture(t);f.invalidAi(true);
  for(let n=0;n<10;n++){const task=(await f.report(await f.create())).task;assert.equal((await f.api('/tasks/'+task.id+'/suggest',{data:{revision:task.revision}})).httpStatus,202);await f.settle();}
  const last=(await f.report(await f.create())).task;assert.equal((await f.api('/tasks/'+last.id+'/suggest',{data:{revision:last.revision}})).status,429);assert.equal(f.aiCalls.length,10);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM ai_advance_suggestions WHERE status='completed'").get().n,0);
});
test('LINE reminders require explicit opt-in and retry same payload/key, not per note; postpone/cancel invalidate jobs',async t=>{
  const f=fixture(t),task=await f.create();await f.drain();assert.equal(f.pushes.length,0);
  await f.api('/preferences',{data:{enabled:true}});f.setPush('timeout');await f.drain();assert.equal(f.pushes.length,1);
  f.sql.exec("UPDATE ai_advance_reminders SET retry_at=0,lease_until=0");f.setPush(409);await f.drain();assert.equal(f.pushes.length,2);assert.deepEqual(f.pushes[0],f.pushes[1]);
  assert.equal(f.pushes[0].body.to,A);assert.doesNotMatch(JSON.stringify(f.pushes),/合作提案|王小明|範例公司/);
  await f.report(task,'note');await f.drain();assert.equal(f.pushes.length,2,'note does not reset deadline reminder');
  const other=await f.create();f.setPush('timeout');await f.drain();await f.report(other,'postpone');f.sql.exec("UPDATE ai_advance_reminders SET retry_at=0,lease_until=0 WHERE status='pending'");const before=f.pushes.length;await f.drain();assert.equal(f.pushes.length,before);
  const cancelled=await f.create();await f.drain();await f.report(cancelled,'cancel');f.sql.exec("UPDATE ai_advance_reminders SET retry_at=0,lease_until=0 WHERE status='pending'");const after=f.pushes.length;await f.drain();assert.equal(f.pushes.length,after);
});
test('reminder eligibility rechecked after identity and preference changes; expired retry window not resent',async t=>{
  const f=fixture(t);await f.create();await f.api('/preferences',{data:{enabled:true}});f.setPush('timeout');await f.drain();
  f.sql.exec("UPDATE ai_advance_reminders SET retry_at=0,lease_until=0,created_at=0");f.setPush(200);await f.drain();assert.equal(f.pushes.length,1);
  await f.create();await f.api('/preferences',{data:{enabled:false}});await f.drain();assert.equal(f.pushes.length,1);
});
