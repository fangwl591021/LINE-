const assert=require('node:assert/strict');
const base='http://127.0.0.1:8831/v1/ai-advance';
async function api(path,data,token='a'){
 const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 return {http:response.status,...await response.json()};
}
(async()=>{
 assert.equal((await api('/dashboard',undefined,'invalid')).http,401);
 await api('/preferences',{enabled:false});
 const input={requestKey:crypto.randomUUID(),title:'Workers 真實執行環境測試',description:'不連線外部服務',dueAt:'2026-01-01T06:00:00.000Z',priority:'normal',contactCardId:'runtime-contact'};
 const concurrent=await Promise.all([api('/tasks',input),api('/tasks',input)]);assert.ok(concurrent.every(r=>r.success));assert.equal(concurrent[0].task.id,concurrent[1].task.id);
 const task=concurrent[0].task;assert.equal((await api('/tasks/'+task.id,undefined,'b')).http,404);
 const data={requestKey:crypto.randomUUID(),revision:0,action:'complete',note:'執行完成，下週確認'};
 const actions=await Promise.all([api('/tasks/'+task.id+'/action',data),api('/tasks/'+task.id+'/action',data)]);assert.ok(actions.every(r=>r.success),JSON.stringify(actions));
 const detail=await api('/tasks/'+task.id);assert.equal(detail.events.length,2);assert.equal(detail.task.revision,1);
 await api('/tasks/'+task.id+'/suggest',{revision:1});let suggestion;
 for(let n=0;n<10;n++){suggestion=await api('/tasks/'+task.id+'/suggestion');if(suggestion.status==='completed')break;await new Promise(r=>setTimeout(r,300));}
 assert.equal(suggestion.status,'completed');
 const next=await api('/tasks/'+task.id+'/accept',{revision:1,dueAt:'2026-01-02T06:00:00.000Z'});assert.equal(next.success,true,JSON.stringify(next));assert.equal(next.task.parent_id,task.id);
 assert.equal((await fetch('http://127.0.0.1:8831/fixture/reminders').then(r=>r.json())).pushes.length,0);
 await api('/preferences',{enabled:true});assert.equal((await fetch('http://127.0.0.1:8831/fixture/reminders').then(r=>r.json())).pushes.length,1);assert.equal((await fetch('http://127.0.0.1:8831/fixture/reminders').then(r=>r.json())).pushes.length,0);
 console.log('WORKERS/D1 RUNTIME PASS: auth, owner isolation, concurrent idempotent create/report, real batch/session, AI confirm, opt-in reminder dedupe');
})().catch(e=>{console.error(e);process.exit(1);});
