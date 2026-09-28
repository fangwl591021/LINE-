import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {normalizeActivityBatches,createActivityBatches,activityWithBatches,joinActivityBatches} from '../worker/activity-batches.mjs';
import {normalizeActivityDraft} from '../worker/activity-dm-ai.mjs';
const source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
const batches=[{name:'早場',startTime:'2026-10-07T10:00',endTime:'2026-10-07T12:00',price:200,limit:1},
 {name:'晚場',startTime:'2026-10-07T19:00',endTime:'',price:0}];
const payload={activityId:'ACT_series',activityName:'系列活動',isBatch:true,batches,names:[],authenticatedUserId:'manager',userId:'manager',authenticatedNetworkId:'admin',status:'上架'};
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE activities(activity_id TEXT PRIMARY KEY,name TEXT,type TEXT,fee_type TEXT,price INTEGER,start_time TEXT,end_time TEXT,description TEXT,image_url TEXT,image_ratio TEXT,creator_id TEXT,network_id TEXT,status TEXT,is_series INTEGER,series_id TEXT DEFAULT '',batch_name TEXT DEFAULT '',batch_limit INTEGER,nfc_checkin_start TEXT,nfc_checkin_end TEXT,nfc_same_day_only INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,ever_unpublished INTEGER DEFAULT 0);
 CREATE TABLE registrants(row_id TEXT PRIMARY KEY,line_id TEXT,activity_id TEXT,activity_name TEXT,name TEXT,phone TEXT,identity TEXT,amount INTEGER,payment_status TEXT,start_time TEXT,description TEXT,image_url TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE users(line_id TEXT PRIMARY KEY,name TEXT,phone TEXT); INSERT INTO users VALUES('member','測試會員','0912345678'),('other','另一會員','0987654321');`);
 let failIndex=-1;
 const prepare=query=>({bind:(...args)=>({query,args,run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}}),first:async()=>sql.prepare(query).get(...args),all:async()=>({results:sql.prepare(query).all(...args)})})});
 const env={ACTMASTER_DB:{prepare,batch:async statements=>{sql.exec('BEGIN');try{const r=statements.map((s,i)=>{if(i===failIndex)throw Error('synthetic failure');return {meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}};});sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
 const context=vm.createContext({console,crypto:webcrypto,createActivityBatches,activityWithBatches,
   SecurityModule:{normalizeRole:x=>x},D1ReadModule:{first:async(_e,q,args)=>sql.prepare(q).get(...args),all:async(_e,q,args)=>sql.prepare(q).all(...args)}});
 const begin=source.indexOf('const D1ActivityModule = {'),end=source.indexOf('\n};',begin);
 vm.runInContext(source.slice(begin,end+3)+'\nglobalThis.mod=D1ActivityModule;',context);
 const mod=context.mod;mod._networkScopeReady=true;
 const security={getActor:async()=>({userId:'member',networkId:'admin',token:'verified'})};
 return {sql,env,mod,security,setFail:n=>failIndex=n,join:p=>joinActivityBatches({activityId:'ACT_series',...p},env,{},security,mod)};
}
test('batch validation rejects incomplete time, invalid dates, prices, duplicates and oversized arrays',()=>{
 assert.equal(normalizeActivityBatches(batches).length,2);
 for(const rows of [[],Array(25).fill(batches[0]),[{...batches[0],startTime:'2026-02-30T10:00'}],[{...batches[0],endTime:'2026-10-06T10:00'}],[{...batches[0],price:null}],[{...batches[0],price:''}],[{...batches[0],limit:-1}],[batches[0],batches[0]]])assert.throws(()=>normalizeActivityBatches(rows));
});
test('AI preserves all slot candidates, leaves unknowns empty, bounds fields and never trusts foreign IDs',()=>{
 const d=normalizeActivityDraft({timeStatus:'multiple',batches:[...batches.map(b=>({...b,scheduleText:b.startTime})),{name:'日期不明',startTime:'2026-10-07T10:00',price:null,networkId:'bad'}]});
 assert.equal(d.batches.length,3);assert.equal(d.batches[0].startTime,'2026-10-07T10:00');assert.equal(d.batches[2].startTime,'');assert.equal(d.batches[2].price,null);assert.equal('networkId' in d.batches[2],false);assert.equal(d.startTime,'');
 assert.equal(normalizeActivityDraft({batches:Array(30).fill({})}).batches.length,24);
});
test('existing bulk API persists parent and selected children, stable retry does not rewrite data',async()=>{
 const f=fixture();try{
  const r=await f.mod.bulkAddRegistrants({...payload,networkId:'forged'},f.env);assert.equal(r.success,true);assert.equal(r.data.batchCount,2);
  const rows=f.sql.prepare('SELECT * FROM activities ORDER BY activity_id').all();assert.equal(rows.length,3);
  assert(rows.every(r=>r.network_id==='admin'&&r.creator_id==='manager'));assert.equal(rows[1].series_id,'ACT_series');assert.equal(rows[1].batch_name,'早場');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM registrants').get().n,0);
  const retry=await f.mod.bulkAddRegistrants({...payload,activityName:'do not replace'},f.env);assert.equal(retry.data.existed,true);assert.equal(f.sql.prepare('SELECT name FROM activities WHERE activity_id=?').get(payload.activityId).name,'系列活動');
  const denied=await f.mod.bulkAddRegistrants({...payload,authenticatedUserId:'attacker'},f.env);assert.equal(denied.success,false);
  const loaded=await f.mod.getActivityById({activityId:'ACT_series',networkId:'admin'},f.env,{userId:'member',role:'user',networkId:'admin'});
  assert.equal(loaded.data.batches.length,2);assert.equal(loaded.data['是否系列'],true);
 }finally{f.sql.close();}
});
test('failed series create rolls back all rows and retry fills exactly one series',async()=>{
 const f=fixture();try{f.setFail(1);assert.equal((await f.mod.bulkAddRegistrants(payload,f.env)).success,false);assert.equal(f.sql.prepare('SELECT count(*) n FROM activities').get().n,0);
 f.setFail(-1);assert.equal((await f.mod.bulkAddRegistrants(payload,f.env)).success,true);}finally{f.sql.close();}
});
test('registration uses token member and database prices, supports multiselect and idempotent concurrent retry',async()=>{
 const f=fixture();try{await f.mod.bulkAddRegistrants(payload,f.env);
 const p={batchIds:['ACT_series_B01','ACT_series_B02'],userId:'forged',amount:1,userName:'forged'};
 const r=await f.join(p);assert.equal(r.success,true);assert.equal(r.data.registrations.length,2);
 assert.deepEqual(f.sql.prepare('SELECT line_id,name,amount FROM registrants ORDER BY amount').all().map(r=>[r.line_id,r.name,r.amount]),[['member','測試會員',0],['member','測試會員',200]]);
 const retries=await Promise.all([f.join(p),f.join(p)]);assert(retries.every(r=>r.success&&r.existed));assert.equal(f.sql.prepare('SELECT count(*) n FROM registrants').get().n,2);
 f.sql.prepare("UPDATE registrants SET status='cancelled' WHERE activity_id='ACT_series_B02'").run();
 assert.equal((await f.join(p)).success,true);assert.equal(f.sql.prepare("SELECT count(*) n FROM registrants WHERE status='active'").get().n,2);
 }finally{f.sql.close();}
});
test('invalid token, missing selection, foreign/closed slot and wrong tenant never write registrations',async()=>{
 for(const mode of ['token','empty','foreign','closed','tenant','member']){const f=fixture();try{
  await f.mod.bulkAddRegistrants(payload,f.env);
  if(mode==='token')f.security.getActor=async()=>null;
  if(mode==='tenant')f.security.getActor=async()=>({userId:'member',networkId:'foreign',token:'valid'});
  if(mode==='closed')f.sql.exec("UPDATE activities SET status='下架' WHERE activity_id='ACT_series'");
  if(mode==='member')f.sql.exec('DELETE FROM users');
  const r=await f.join({batchIds:mode==='empty'?[]:[mode==='foreign'?'wrong':'ACT_series_B01']});assert.equal(r.success,false,mode);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM registrants').get().n,0);
 }finally{f.sql.close();}}
});
test('capacity is checked inside batch; partial success reports missing slot, retry never duplicates',async()=>{
 const f=fixture();try{
  await f.mod.bulkAddRegistrants(payload,f.env);await f.join({batchIds:['ACT_series_B01']});
  f.security.getActor=async()=>({userId:'other',networkId:'admin',token:'verified'});
  const r=await f.join({batchIds:['ACT_series_B01','ACT_series_B02']});assert.equal(r.success,false);assert.match(r.error,/額滿/);assert.equal(r.data.registrations.length,1);
  await f.join({batchIds:['ACT_series_B01','ACT_series_B02']});assert.equal(f.sql.prepare('SELECT count(*) n FROM registrants').get().n,2);
 }finally{f.sql.close();}
});
test('editing series retains structure and old registrations; duplicate copies slots without registrations',async()=>{
 const f=fixture();try{
 await f.mod.bulkAddRegistrants(payload,f.env);await f.join({batchIds:['ACT_series_B01']});
 await f.mod.upsertActivity({activityId:'ACT_series',data:{activityName:'修訂標題'},authenticatedNetworkId:'admin'},f.env);
 assert.equal(f.sql.prepare("SELECT is_series FROM activities WHERE activity_id='ACT_series'").get().is_series,1);
 const r=await f.mod.duplicateActivity({...payload,newActivityId:'ACT_copy'},f.env);assert.equal(r.success,true);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM activities WHERE series_id='ACT_copy'").get().n,2);assert.equal(f.sql.prepare('SELECT count(*) n FROM registrants').get().n,1);
 const roster=await f.mod.listRegistrants({activityId:'ACT_series'},f.env);assert.equal(roster.data.length,1);assert.match(roster.data[0].activityName,/早場/);
 }finally{f.sql.close();}
});
test('concurrent creation is one parent and one set of children',async()=>{
 const f=fixture();try{const results=await Promise.all([f.mod.bulkAddRegistrants(payload,f.env),f.mod.bulkAddRegistrants(payload,f.env)]);
 assert(results.every(r=>r.success));assert.equal(f.sql.prepare('SELECT count(*) n FROM activities').get().n,3);
 }finally{f.sql.close();}
});

function batchUi(){
 const classes=new Set();
 const host={dataset:{},classList:{add:(...names)=>names.forEach(name=>classes.add(name))},isConnected:true,innerHTML:'',textContent:'',querySelectorAll:()=>[{value:'B1'},{value:'B2'}]};
 const context=vm.createContext({window:{},document:{getElementById:()=>host}});
 vm.runInContext(readFileSync(new URL('../js/modules/activity-batches.js',import.meta.url),'utf8'),context);
 return {host,classes,ui:context.window.ActivityBatches};
}
test('batch choices match description typography and width without oversized frame',async()=>{
 const {host,classes,ui}=batchUi();
 const activity={activityId:'series',isBatch:true,batches:[{activityId:'B1',batchName:'10/7（三）',startTime:'2026-10-07 14:00',endTime:'2026-10-07 17:00',price:200,status:'上架'}]};
 await ui.mount(activity,host);
 assert.deepEqual([...classes],['text-[14px]','text-slate-600']);
 const home=readFileSync(new URL('../js/modules/home.js',import.meta.url),'utf8');
 assert.match(home,/<p class="text-\[14px\] text-slate-600 whitespace-pre-wrap">\$\{desc\}<\/p>\s*<div id="activity-batch-choices">/);
 assert.match(host.innerHTML,/min-width:0;width:100%;margin:0;padding:0;border:0;font:inherit;color:inherit/);
 assert.match(host.innerHTML,/min-height:44px/);
 assert.match(host.innerHTML,/width:18px;height:18px/);
 assert.match(host.innerHTML,/2026\/10\/07 14:00–17:00/);
 assert.match(host.innerHTML,/NT\$ 200/);
 assert.doesNotMatch(host.innerHTML,/#a7f3d0|font-weight:bold|<strong>|2026-10-07 17:00/);
 assert.equal(host.dataset.ready,'true');
 assert.deepEqual(Array.from(ui.selection(activity)),['B1','B2']);
 assert.match(readFileSync(new URL('../index.html',import.meta.url),'utf8'),/activity-batches\.js\?v=2/);
});
test('compact schedule retains cross-day dates, missing ends, aliases and escaped values',async()=>{
 const {host,ui}=batchUi();
 await ui.mount({activityId:'series',isBatch:true,batches:[
  {activityId:'B1',batchName:'<img onerror=alert(1)>',startTime:'2026-10-07T23:00',endTime:'2026-10-08T01:00',price:0,status:'上架'},
  {activityId:'B2',batchName:'早場','開始時間':'2026-10-21 14:00','結束時間':'2026-10-21 17:00',price:200,status:'上架'},
  {activityId:'B3',batchName:'單一時間',startTime:'2026-11-11 14:00',status:'上架'},
  {activityId:'B4',batchName:'待確認',startTime:'<script>bad</script>',status:'上架'},
  {activityId:'closed',batchName:'不公開',status:'下架'}
 ]},host);
 assert.match(host.innerHTML,/2026\/10\/07 23:00 ～ 2026\/10\/08 01:00/);
 assert.match(host.innerHTML,/2026\/10\/21 14:00–17:00/);
 assert.match(host.innerHTML,/2026\/11\/11 14:00<\/span>/);
 assert.match(host.innerHTML,/免費/);
 assert.match(host.innerHTML,/&lt;img onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(host.innerHTML,/<script>|<img|不公開/);
 assert.equal((host.innerHTML.match(/type="checkbox"/g)||[]).length,4);
});
