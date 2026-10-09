import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { handleAiAdvance, processAiAdvanceReminders, ensureAiAdvanceCardTask } from '../worker/ai-advance.mjs';
const A='U'+'a'.repeat(32), B='U'+'b'.repeat(32), OLD='U'+'c'.repeat(32);
function fixture(t, allowCardSave = false) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,name TEXT,role TEXT);
    CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
    CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,name TEXT,company_name TEXT,title TEXT,scanner_user_id TEXT,creator_id TEXT,owner_user_id TEXT,source_type TEXT,archived_at TEXT,merged_into_row_id TEXT);
    CREATE TABLE points_ledger(id TEXT); CREATE TABLE agenda(id TEXT);
    INSERT INTO users VALUES('member-a','${A}','甲','user'),('member-b','${B}','乙','admin');
    INSERT INTO user_identity_links VALUES('${OLD}','${A}','active');
    INSERT INTO card_contacts VALUES('contact-a','王小明','範例公司','經理','${A}','','','ocr_scan','',''),('contact-b','別人的名片','公司','經理','${B}','','${A}','ocr_scan','',''),('self-a','本人','','','${A}','','','self_profile','',''),('archived-a','封存','','','${A}','','','ocr_scan','2026-01-01',''),('legacy-a','舊名片','','','','${OLD}','','ocr_scan','','');`);
  sql.exec(readFileSync(new URL('../migrations/0054_ai_advance_tasks.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0061_ai_advance_manual_reminders.sql',import.meta.url),'utf8'));
  sql.exec(`ALTER TABLE card_contacts ADD COLUMN crm_status TEXT NOT NULL DEFAULT '新名片';
    ALTER TABLE card_contacts ADD COLUMN crm_next_action TEXT NOT NULL DEFAULT '';
    ALTER TABLE card_contacts ADD COLUMN crm_next_followup_at TEXT NOT NULL DEFAULT '';
    ALTER TABLE card_contacts ADD COLUMN crm_ai_suggestion TEXT NOT NULL DEFAULT '';`);
  let beforeWrite=null, aiStatus=200, pushStatus=200, invalidAi=false, authStatus=200;
  const writes=[], pushes=[], aiCalls=[], background=[];
  function prepare(query,args=[]) {
    return {bind(...values){return prepare(query,values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async run(){
      beforeWrite?.(query,args);assert.match(query,allowCardSave ? /^\s*((INSERT(?: OR IGNORE)? INTO|UPDATE|DELETE FROM) ai_advance_|(INSERT INTO|UPDATE) card_contacts)/ : /^\s*(INSERT(?: OR IGNORE)? INTO|UPDATE|DELETE FROM) ai_advance_/);writes.push(query);const result=sql.prepare(query).run(...args);return {success:true,meta:{changes:Number(result.changes)}};
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
test('CRM first task bridge: owned cards, existing suggestions and Taipei dates, no AI or unrelated writes',async t=>{
  const f=fixture(t);
  f.sql.exec("UPDATE card_contacts SET crm_next_action='首次電話跟進',crm_ai_suggestion='介紹合作方案並確認需求',crm_next_followup_at='2026-10-15 14:30:00' WHERE row_id='contact-a'");
  const candidates=await f.api('/crm-candidates');assert.equal(candidates.success,true);
  const draft=candidates.candidates.find(c=>c.contactCardId==='contact-a');
  assert.equal(draft.title,'首次電話跟進：王小明');assert.equal(draft.description,'介紹合作方案並確認需求');assert.equal(draft.dueAt,'2026-10-15T06:30:00.000Z');assert.equal(draft.defaultDue,false);
  assert.equal(f.writes.length,0,'GET candidates never writes');
  const task=await ensureAiAdvanceCardTask(f.env,A,'contact-a');assert.equal(task.contact_card_id,'contact-a');assert.equal(task.create_key,'crm:contact-a');
  assert.equal((await ensureAiAdvanceCardTask(f.env,OLD,'contact-a')).id,task.id);
  for(const id of ['self-a','contact-b','archived-a','missing'])assert.equal(await ensureAiAdvanceCardTask(f.env,A,id),null);
  assert.equal(await ensureAiAdvanceCardTask(f.env,'forged','contact-a'),null);
  f.env.AI_ADVANCE_DISABLED='1';assert.equal(await ensureAiAdvanceCardTask(f.env,A,'legacy-a'),null);delete f.env.AI_ADVANCE_DISABLED;
  assert.equal(f.aiCalls.length,0);assert.equal(f.pushes.length,0);
  const dash=await f.api('/dashboard');assert.equal(dash.tasks[0].source,'card_crm');assert.equal(dash.events.length,1);assert.equal(dash.events[0].task_id,task.id);
  await f.report(task);assert.equal((await f.api('/crm-candidates')).candidates.some(c=>c.contactCardId==='contact-a'),false);
  assert.equal((await ensureAiAdvanceCardTask(f.env,A,'contact-a')).status,'completed');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_advance_tasks').get().n,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM points_ledger').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM agenda').get().n,0);
});
test('CRM selected backfill validates the entire selection first and survives retries, closed records and capacity limits',async t=>{
  const f=fixture(t),cards=[{contactCardId:'contact-a',dueAt:'2026-10-15T06:30:00.000Z'},{contactCardId:'legacy-a',dueAt:'2026-10-16T06:30:00.000Z'}];
  const request=data=>f.api('/crm-tasks',{data});
  assert.equal((await request({cards:[cards[0],{...cards[1],contactCardId:'contact-b'}]})).status,403);assert.equal(f.writes.length,0);
  for(const data of [{cards:[]},{cards:Array(21).fill(cards[0])},{cards:[cards[0],cards[0]]},{cards:[{...cards[0],dueAt:'2026-02-31T06:00:00Z'}]},{cards,memberId:'member-b'}])assert.equal((await request(data)).status,400);
  f.sql.exec("UPDATE card_contacts SET crm_status='已流失' WHERE row_id='legacy-a'");assert.equal((await request({cards})).status,403);
  f.sql.exec("UPDATE card_contacts SET crm_status='新名片' WHERE row_id='legacy-a'");
  const first=await request({cards}),again=await request({cards});assert.equal(first.results.length,2);assert.ok(first.results.every(r=>r.task));assert.deepEqual(again.results.map(r=>r.task.id),first.results.map(r=>r.task.id));
  const cancelled=(await f.report(first.results[0].task,'cancel')).task;assert.equal((await request({cards:[cards[0]]})).results[0].task.status,'cancelled');
  assert.equal((await f.api('/dashboard',{token:'b'})).events.length,0);assert.equal((await f.api('/dashboard',{token:'old'})).tasks.length,2);
  assert.equal((await f.api('/tasks/'+cancelled.id)).task.source,'card_crm');
  assert.equal(f.aiCalls.length,0);assert.equal(f.pushes.length,0);
  const capacity=fixture(t);
  const insert=capacity.sql.prepare('INSERT INTO ai_advance_tasks(id,member_id,create_key,title,due_at,priority,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
  for(let n=0;n<300;n++)insert.run(crypto.randomUUID(),'member-a',crypto.randomUUID(),'容量測試','2099-01-01T06:00:00.000Z','normal',new Date().toISOString(),new Date().toISOString());
  const limited=await capacity.api('/crm-tasks',{data:{cards:[cards[0]]}});assert.match(limited.results[0].error,/300/);assert.equal(capacity.sql.prepare('SELECT COUNT(*) n FROM ai_advance_tasks').get().n,300);
});
test('CRM failed event batch rolls task back; transferred or closed contact between validation and write is denied',async t=>{
  const f=fixture(t);
  f.beforeWrite(query=>{if(query.includes('INTO ai_advance_events'))throw Error('fixture event failure');});
  const body={cards:[{contactCardId:'contact-a',dueAt:'2026-10-15T06:30:00Z'}]};
  const result=await f.api('/crm-tasks',{data:body});assert.equal(result.results[0].task,undefined);assert.match(result.results[0].error,/未完成/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_advance_tasks').get().n,0);
  f.beforeWrite(query=>{if(query.includes('INTO ai_advance_tasks'))f.sql.prepare('UPDATE card_contacts SET scanner_user_id=? WHERE row_id=?').run(B,'contact-a');});
  const denied=await f.api('/crm-tasks',{data:body});assert.match(denied.results[0].error,/權限或跟進狀態已變更/);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_advance_tasks').get().n,0);
  f.sql.prepare('UPDATE card_contacts SET scanner_user_id=? WHERE row_id=?').run(A,'contact-a');
  f.beforeWrite(query=>{if(query.includes('INTO ai_advance_tasks'))f.sql.prepare("UPDATE card_contacts SET crm_status='已成交' WHERE row_id=?").run('contact-a');});
  const closed=await f.api('/crm-tasks',{data:body});assert.match(closed.results[0].error,/跟進狀態已變更/);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_advance_tasks').get().n,0);
});
test('dashboard shows linked cards outside picker limit and bounded history, all within member scope',async t=>{
  const f=fixture(t),task=await f.create();
  const insert=f.sql.prepare("INSERT INTO card_contacts(row_id,name,scanner_user_id,source_type) VALUES(?,? ,?,'ocr_scan')");
  for(let n=0;n<205;n++)insert.run('early-'+n,'A '+n,A);
  for(let n=0;n<6;n++)await f.report((await f.api('/tasks/'+task.id)).task,'note','紀錄 '+n);
  const dash=await f.api('/dashboard');assert.equal(dash.contacts.some(c=>c.row_id==='contact-a'),false);assert.equal(dash.taskContacts[0].row_id,'contact-a');assert.equal(dash.events.length,4);
  assert.equal((await f.api('/tasks/'+task.id)).events.length,7);
});
test('manual own reminder: explicit opt-in, no target spoof, future deadline, request retry and due dedupe',async t=>{
  const f=fixture(t),task=await f.create({...f.input(),dueAt:'2099-01-01T06:00:00Z'}),path='/tasks/'+task.id+'/remind';
  assert.equal((await f.api(path,{data:{revision:0}})).status,409);assert.equal(f.pushes.length,0);
  await f.api('/preferences',{data:{enabled:true}});
  assert.equal((await f.api(path,{token:'b',data:{revision:0}})).status,404);assert.equal((await f.api(path,{data:{revision:0,to:B}})).status,400);
  assert.equal((await f.api(path,{data:{revision:1}})).status,409);
  const first=await f.api(path,{data:{revision:0}});assert.equal(first.httpStatus,202);assert.equal(first.reminder.status,'pending');await f.settle();
  assert.equal(f.pushes.length,1);assert.equal(f.pushes[0].body.to,A);assert.doesNotMatch(JSON.stringify(f.pushes),/王小明|合作提案|範例公司/);
  assert.equal((await f.api(path,{data:{revision:0}})).reminder.status,'sent');await f.settle();await f.drain();assert.equal(f.pushes.length,1);
  assert.equal((await f.api('/dashboard')).reminders[0].status,'sent');
  const completed=(await f.report(task)).task;assert.equal((await f.api(path,{data:{revision:completed.revision}})).status,409);
});
test('manual reminder retry payload stays stable; preference off and postpone stop pending future jobs',async t=>{
  const f=fixture(t);await f.api('/preferences',{data:{enabled:true}});
  const task=await f.create({...f.input(),dueAt:'2099-01-01T06:00:00Z'});f.setPush('timeout');await f.api('/tasks/'+task.id+'/remind',{data:{revision:0}});await f.settle();
  f.sql.exec('UPDATE ai_advance_reminders SET retry_at=0,lease_until=0');f.setPush(409);await f.drain();assert.deepEqual(f.pushes[0],f.pushes[1]);
  const other=await f.create({...f.input(),dueAt:'2099-01-01T06:00:00Z'});f.setPush('timeout');await f.api('/tasks/'+other.id+'/remind',{data:{revision:0}});await f.settle();
  await f.api('/tasks/'+other.id+'/action',{data:{requestKey:crypto.randomUUID(),revision:0,action:'postpone',note:'延期一個月',dueAt:'2099-02-01T06:00:00Z'}});f.sql.exec('UPDATE ai_advance_reminders SET retry_at=0,lease_until=0');const count=f.pushes.length;await f.drain();assert.equal(f.pushes.length,count);
  const last=await f.create({...f.input(),dueAt:'2099-01-01T06:00:00Z'}),now=Math.floor(Date.now()/1000);
  f.sql.prepare('INSERT INTO ai_advance_reminders(id,task_id,member_id,line_id,revision,due_at,retry_at,created_at,target_url,manual_requested) VALUES(?,?,?,?,?,?,?,?,?,1)').run(crypto.randomUUID(),last.id,'member-a',A,0,last.due_at,0,now,'https://liff.line.me/1660923784-vViMTZ1y?aiAdvance=1');
  await f.api('/preferences',{data:{enabled:false}});await f.drain();assert.equal(f.pushes.length,count);
});
test('manual reminder budget fails closed, action dispatch does not process others',async t=>{
  const f=fixture(t);await f.api('/preferences',{data:{enabled:true}});await f.api('/preferences',{token:'b',data:{enabled:true}});
  const foreign=(await f.api('/tasks',{token:'b',data:{...f.input(),contactCardId:''}})).task;
  for(let n=0;n<10;n++){const task=await f.create({...f.input(),dueAt:'2099-01-01T06:00:00Z'});assert.equal((await f.api('/tasks/'+task.id+'/remind',{data:{revision:0}})).httpStatus,202);await f.settle();}
  assert.equal(f.pushes.length,10);assert.ok(f.pushes.every(p=>p.body.to===A));assert.equal((await f.api('/tasks/'+foreign.id+'/remind',{data:{revision:0}})).status,404);
  const task=await f.create({...f.input(),dueAt:'2099-01-01T06:00:00Z'});assert.equal((await f.api('/tasks/'+task.id+'/remind',{data:{revision:0}})).status,429);
});
test('manual reminder rechecks identity mapping before sending a queued future reminder',async t=>{
  const f=fixture(t),task=await f.create({...f.input(),dueAt:'2099-01-01T06:00:00Z'});await f.api('/preferences',{data:{enabled:true}});
  f.setPush('timeout');await f.api('/tasks/'+task.id+'/remind',{data:{revision:0}});await f.settle();assert.equal(f.pushes.length,1);
  f.sql.exec(`INSERT INTO user_identity_links VALUES('${A}','${B}','active');UPDATE ai_advance_reminders SET retry_at=0,lease_until=0`);
  f.setPush(200);await f.drain();assert.equal(f.pushes.length,1);assert.equal(f.sql.prepare('SELECT status FROM ai_advance_reminders WHERE task_id=?').get(task.id).status,'cancelled');
});
test('actual authenticated card-save hook creates a CRM task; UID-only fallback cannot trigger it and failure cannot undo the saved card',async t=>{
  const f=fixture(t,true),source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
  const object=name=>source.match(new RegExp('^const '+name+' = \\{[\\s\\S]*?^\\};','m'))[0];
  const insert=source.slice(source.indexOf('    const cardWriteResult = await'));
  const columns=insert.match(/INSERT INTO card_contacts \(([^)]+)\)/)[1].split(',').map(s=>s.trim());
  const present=new Set(f.sql.prepare('PRAGMA table_info(card_contacts)').all().map(c=>c.name));
  for(const column of [...columns,'source_event_id','claimed_from_row_id','claimed_by_uid','claimed_at'])if(!present.has(column)){assert.match(column,/^[a-z_]+$/);f.sql.exec('ALTER TABLE card_contacts ADD COLUMN '+column+" TEXT DEFAULT ''");present.add(column);}
  let failHook=false,awardCalls=0;
  const read={ensureCardAccessColumns:async()=>{},first:async(env,query,args)=>env.ACTMASTER_DB.prepare(query).bind(...args).first(),
    inferCardAccess:card=>({ownerUserId:A,profileUserId:'',sourceType:card.source_type,visibility:'private',poolEligible:false,aiReviewStatus:'pending',isSelfProfile:card.source_type==='self_profile'}),
    inferCrmType:()=> '待判斷',inferCrmNextAction:()=> '首次聯繫',inferCrmSuggestion:()=> '介紹合作方案並確認需求',cardRow:card=>({...card})};
  const context=vm.createContext({console:{error(){}},D1ReadModule:read,CardLinks:{parse:()=>({})},
    CardFateTagAnalysisModule:{enqueueCard:async()=>{}},CardUploaderMatchModule:{enqueueCard:async()=>{}},
    ensureAiAdvanceCardTask:async(...args)=>{if(failHook)throw Error('fixture queue failure');return ensureAiAdvanceCardTask(...args);}});
  vm.runInContext(object('SecurityModule')+'\n'+object('D1WriteModule')+'\nglobalThis.security=SecurityModule;globalThis.write=D1WriteModule;',context);
  const {security,write}=context;
  security.getActionPolicy=()=>({access:'authenticated',allowD1Fallback:true});security.getActor=async()=>({userId:A,role:'user',networkId:'admin',token:'verified-fixture'});
  security.getActorFromD1Identity=async()=>({userId:A,role:'user',networkId:'admin',token:'',source:'d1_identity_fallback'});
  write.normalizeCard=payload=>({...Object.fromEntries(columns.map(c=>[c,''])),row_id:payload.data.rowId,creator_id:A,owner_user_id:A,scanner_user_id:A,source_type:'private_import',name:'新收藏測試名片',custom_config:'{}'});
  write.resolvePointAwardUserId=async(_,id)=>id;write.hasDuplicateCardForOwner=async()=>false;write.awardCardScanPoints=async()=>{awardCalls++;return{awarded:false};};
  const request=new Request('https://fixture.invalid/');
  async function save(id){const payload={userId:A,authenticatedUserId:A,data:{rowId:id}};assert.equal((await security.authorizeAction('saveCard',payload,request,f.env)).allowed,true);return write.upsertCard(payload,f.env);}
  assert.equal((await save('new-saved-card')).success,true);assert.equal((await f.api('/dashboard')).tasks.length,1);assert.equal((await f.api('/dashboard')).tasks[0].contact_card_id,'new-saved-card');
  security.getActor=async()=>null;
  assert.equal((await save('fallback-card')).success,true);assert.equal((await f.api('/dashboard')).tasks.length,1,'fallback permission for existing save flow does not authorize new CRM tasks');
  security.getActor=async()=>({userId:A,role:'user',networkId:'admin',token:'verified-fixture'});failHook=true;
  assert.equal((await save('saved-despite-hook-failure')).success,true);assert.ok(f.sql.prepare('SELECT row_id FROM card_contacts WHERE row_id=?').get('saved-despite-hook-failure'));assert.equal(awardCalls,3,'award code is not retried');
  assert.equal(f.aiCalls.length,0);assert.equal(f.pushes.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM agenda').get().n,0);
});
