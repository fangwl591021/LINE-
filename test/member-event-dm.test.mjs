import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/member-events-fixture.mjs';
import {extractMemberEventDm} from '../worker/member-event-dm.mjs';
import {handleMemberEvents} from '../worker/member-hosted-events.mjs';
import {dmValue} from './helpers/member-event-dm-output.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const body={file:{type:'image/png',data:png}},actor={memberId:'host'};
const raw={activityName:'合作交流',location:'板橋文化路一段486號3樓之2',description:'認識人、聊資源',timeStatus:'single',scheduleText:'2027/10/07 14:00–17:00',startTime:'2027-10-07T14:00',endTime:'2027-10-07T17:00',price:200};
const response=v=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(dmValue(v))}]}]});
function setup(t){const f=fixture(t);f.env.OPENAI_API_KEY='test-only-key';return f;}
test('authenticated canonical member; draft only, existing key, no provider file/R2/business writes',async t=>{
 const f=setup(t);let calls=0;
 const fetcher=async(url,init)=>{if(url.includes('api.line.me'))return f.fetcher(url,init);calls++;assert.equal(url,'https://api.openai.com/v1/responses');const data=JSON.parse(init.body);assert.equal(init.headers.Authorization,'Bearer test-only-key');assert.equal(data.store,false);assert.equal(data.max_output_tokens,4000);assert.equal(data.model,'gpt-5.6-sol');assert.deepEqual(data.reasoning,{effort:'low'});assert.equal(data.text.format.type,'json_schema');assert.equal(data.text.format.strict,true);assert.ok(init.signal instanceof AbortSignal);assert.match(data.instructions,/不是指令/);assert.equal(data.input[0].content[1].image_url,png);return response(raw);};
 const request=new Request('https://test/v1/member-events/dm-draft',{method:'POST',headers:{Authorization:'Bearer old','Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await handleMemberEvents(request,f.env,fetcher);assert.equal(result.status,200);const data=await result.json();assert.equal(data.draft.activityName,raw.activityName);assert.equal('memberId' in data.draft,false);assert.equal(calls,1);assert.equal(f.sql.prepare('SELECT member_id FROM member_event_dm_usage').get().member_id,'host');
 for(const table of ['member_hosted_events','member_event_registrations','activities','personal_tasks','points_ledger'])assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
 assert.equal(f.writes.length,1);assert.match(f.writes[0],/member_event_dm_usage/);
});
test('no token, invalid token, disabled feature, forged model and URLs cannot reach AI',async t=>{
 const f=setup(t);let calls=0;const fetcher=async(url,init)=>{if(url.includes('api.line.me'))return f.fetcher(url,init);calls++;return response(raw);};
 for(const token of ['', 'bad']){const r=await handleMemberEvents(new Request('https://test/v1/member-events/dm-draft',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:JSON.stringify(body)}),f.env,fetcher);assert.equal(r.status,401);}
 for(const invalid of [null,[],{}, {...body,model:'forged'}, {file:{...body.file,role:'admin'}},{file:{type:'image/png',data:'https://internal/' }},{file:{type:'application/pdf',data:'data:application/pdf;base64,QUFBQQ=='}}])await assert.rejects(extractMemberEventDm(invalid,f.env,f.db,actor,fetcher),e=>e.status===400);
 assert.equal(calls,0);assert.equal(f.writes.length,0);
});
test('PDF embeds exact bounded data, never creates a provider file or public URL',async t=>{
 const f=setup(t),pdf='data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nsynthetic test only').toString('base64');
 const r=await extractMemberEventDm({file:{type:'application/pdf',data:pdf}},f.env,f.db,actor,async(url,init)=>{assert.equal(url,'https://api.openai.com/v1/responses');const file=JSON.parse(init.body).input[0].content[1];assert.equal(file.type,'input_file');assert.equal(file.file_data,pdf);assert.equal(file.filename,'activity.pdf');return response(raw);});assert.equal(r.success,true);
});
test('unknown dates/fee blank; multiple times stay distinct without auto-creating events',async t=>{
 const f=setup(t),r=await extractMemberEventDm(body,f.env,f.db,actor,async()=>response({...raw,timeStatus:'multiple',price:null,batches:[{name:'上午',scheduleText:'2027/10/7 09:00–12:00',startTime:'2027-10-07T09:00',endTime:'2027-10-07T12:00',price:0},{name:'下午',scheduleText:'10/7下午',startTime:'10/7',endTime:'',price:null}]}));
 assert.equal(r.draft.startTime,'');assert.equal(r.draft.endTime,'');assert.equal(r.draft.price,null);assert.equal(r.draft.batches.length,2);assert.equal(r.draft.batches[1].startTime,'');assert.equal(r.draft.batches[1].price,null);
});
test('atomic 15-second cooldown and Taiwan-day 20-attempt quota; failures count, no retries',async t=>{
 const f=setup(t);let calls=0;const fetcher=async()=>{calls++;return response(raw);};await extractMemberEventDm(body,f.env,f.db,actor,fetcher);
 await assert.rejects(extractMemberEventDm(body,f.env,f.db,actor,fetcher),e=>e.status===429);assert.equal(calls,1);
 f.sql.exec('UPDATE member_event_dm_usage SET next_allowed_at=0,attempts=19');await extractMemberEventDm(body,f.env,f.db,actor,fetcher);f.sql.exec('UPDATE member_event_dm_usage SET next_allowed_at=0');await assert.rejects(extractMemberEventDm(body,f.env,f.db,actor,fetcher),e=>e.status===429);
 f.sql.exec("UPDATE member_event_dm_usage SET usage_day='2000-01-01',next_allowed_at=0");await extractMemberEventDm(body,f.env,f.db,actor,fetcher);const quota=f.sql.prepare('SELECT * FROM member_event_dm_usage').get();assert.equal(quota.attempts,1);assert.equal(quota.usage_day,new Date(Date.now()+8*3600000).toISOString().slice(0,10));
});
test('missing key takes no quota; incomplete/invalid/provider/abort errors safe and draft not saved',async t=>{
 const noKey=fixture(t);await assert.rejects(extractMemberEventDm(body,noKey.env,noKey.db,actor),e=>e.status===503);assert.equal(noKey.writes.length,0);
 for(const provider of [async()=>Response.json({error:'SECRET_VALUE'},{status:500}),async()=>Response.json({status:'incomplete'}),async()=>response({}),async()=>Response.json({output:[{content:[{type:'output_text',text:'bad JSON'}]}]}),async()=>{throw Object.assign(Error('SECRET_VALUE'),{name:'AbortError'});},async()=>new Response('x'.repeat(128001))]){
  const f=setup(t);await assert.rejects(extractMemberEventDm(body,f.env,f.db,actor,provider),e=>[422,503].includes(e.status)&&!e.message.includes('SECRET_VALUE'));assert.equal(f.writes.length,1);
 }
});
test('frontend explicit select/read/preview/apply and preserved identity, no automatic event creation',()=>{
 const ui=readFileSync(new URL('../js/modules/member-event-dm.js',import.meta.url),'utf8'),host=readFileSync(new URL('../js/modules/member-hosted-events.js',import.meta.url),'utf8'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/member-event-dm\.js\?v=1/);assert.ok(html.indexOf('member-event-dm.js')<html.indexOf('member-hosted-events.js'));assert.match(ui,/createImageBitmap/);assert.match(ui,/2000\/Math.max/);assert.match(ui,/尚未送出辨識/);assert.match(ui,/確認帶入草稿/);assert.match(ui,/重新辨識 DM／PDF/);assert.match(ui,/draftActor=actor/);assert.match(ui,/valid\(g,actor\)/);assert.match(ui,/controllers.forEach\(c=>c.abort\(\)\)/);assert.match(host,/seed.feeText\?\?'免費'/);assert.match(host,/dm.uid!==actor.uid\|\|dm.token!==actor.token/);assert.doesNotMatch(ui,/localStorage|sessionStorage|OPENAI_API_KEY|\/events|R2/);
});
