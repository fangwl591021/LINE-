import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN,REWARD,OTHER,mapper} from './fixtures/reward-unit-directory.mjs';
import {handleRewardApplications,normalizeApplication,normalizeSigning,rewardTerms} from '../worker/reward-applications.mjs';
export const fields=()=>({unit_name:'合成測試單位',applicant_name:'測試申請人',phone:'0912345678',line_contact:'',unit_types:['企業'],unit_types_other:'',recipients:['員工'],recipients_other:'',scenarios:['員工福利'],scenarios_other:''});
export const signature=id=>({preview_id:id,strokes:[Array.from({length:15},(_,i)=>[100+i*30,100+(i%2)*90])],electronic:true,terms:true,authority:true});
function fixture(t){const s=rewardFixture();t.after(()=>s.sql.close());s.sql.exec("ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT '';"+readFileSync(new URL('../migrations/0068_reward_applications.sql',import.meta.url),'utf8'));
 const fetcher=async(url,opts)=>{assert.equal(url,'https://api.line.me/v2/profile');const uid={admin:ADMIN,reward:REWARD,user:OTHER}[opts.headers.Authorization.slice(7)];return uid?Response.json({userId:uid}):new Response('',{status:401});};
 s.call=async(path='',data,token='user')=>{const response=await handleRewardApplications(new Request('https://test/v1/reward-applications'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),s.env,mapper,fetcher);return {http:response.status,...await response.json()};};
 return s;
}
const submit=async s=>{const preview=await s.call('/preview',{fields:fields()});assert.equal(preview.http,200,JSON.stringify(preview));const payload=signature(preview.preview_id);return {preview,payload,result:await s.call('/submit',payload)};};
test('preview and reads never grant roles or points; explicit submit preserves complete snapshot',async t=>{
 const s=fixture(t),before=s.sql.prepare('SELECT * FROM users').all();assert.equal((await s.call('/template')).terms.version,rewardTerms.version);assert.deepEqual((await s.call()).applications,[]);
 const {result}=await submit(s);assert.equal(result.http,200,JSON.stringify(result));assert.equal(result.application.status,'pending');assert.equal(result.application.snapshot.signer_uid,OTHER);assert.deepEqual(result.application.snapshot.terms,rewardTerms);assert.equal(result.application.content_sha256.length,64);
 const stored=s.sql.prepare('SELECT * FROM reward_applications').get();const expected=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stored.snapshot_json))).toString('hex');assert.equal(stored.content_sha256,expected);
 assert.deepEqual(s.sql.prepare('SELECT * FROM users').all(),before);assert.equal(s.sql.prepare('SELECT COUNT(*) n FROM reward_unit_publications').get().n,0);
});
test('private signatures deny anonymous, different member and forged admin',async t=>{
 const s=fixture(t),{result}=await submit(s),id=result.application.id;
 assert.equal((await s.call('?id='+id,undefined,'reward')).http,404);assert.equal((await s.call('/admin?id='+id,undefined,'reward')).http,403);assert.equal((await s.call('/admin?id='+id,undefined,'admin')).http,200);
 for(const route of ['', '/template','/admin'])assert.equal((await s.call(route,undefined,'bad')).http,401);
 assert.equal((await s.call('?owner_uid='+OTHER,undefined,'reward')).http,400);assert.equal((await s.call('/preview',{fields:fields(),role:'admin'})).http,400);
 assert.equal((await s.call(undefined,undefined,'reward')).applications.length,0);
});
test('same retry is idempotent; changed signature and other owner cannot reuse ID',async t=>{
 const s=fixture(t),{payload,result}=await submit(s);assert.equal((await s.call('/submit',payload)).application.id,result.application.id);
 const changed=structuredClone(payload);changed.strokes[0][0][0]++;assert.equal((await s.call('/submit',changed)).http,409);assert.equal((await s.call('/submit',payload,'reward')).http,409);
 assert.equal(s.sql.prepare('SELECT COUNT(*) n FROM reward_applications').get().n,1);
});
test('expired and superseded previews fail closed',async t=>{
 const s=fixture(t),a=await s.call('/preview',{fields:fields()});await s.call('/preview',{fields:{...fields(),unit_name:'另一個名稱'}});assert.equal((await s.call('/submit',signature(a.preview_id))).http,409);
 const b=await s.call('/preview',{fields:fields()});s.sql.prepare("UPDATE reward_application_previews SET expires_at='2000-01-01'").run();assert.equal((await s.call('/submit',signature(b.preview_id))).http,409);
});
test('unknown fields, consent, oversized or invalid signature are rejected',()=>{
 for(const value of [{...fields(),owner_uid:OTHER},{...fields(),phone:'123'},{...fields(),unit_types:[]},{...fields(),unit_types:['其他']},{...fields(),unit_types:['企業','企業']}])assert.throws(()=>normalizeApplication(value));
 const valid=signature(crypto.randomUUID());assert.deepEqual(normalizeSigning(valid),valid);
 for(const value of [{...valid,terms:false},{...valid,strokes:[]},{...valid,strokes:[[[0,0],[1,1]]]},{...valid,strokes:[[[Infinity,0],[2,2]]]},{...valid,role:'admin'},{...valid,strokes:[Array.from({length:2501},()=>[1,1])]}])assert.throws(()=>normalizeSigning(value));
});
test('review is admin-only, immutable, idempotent and never changes authority or signed snapshot',async t=>{
 const s=fixture(t),{result}=await submit(s),id=result.application.id,before=s.sql.prepare('SELECT * FROM users').all(),json=s.sql.prepare('SELECT snapshot_json FROM reward_applications').get().snapshot_json;
 const proposal={id,decision:'accepted',note:'合成測試，確認資料'};assert.equal((await s.call('/review',proposal)).http,403);assert.equal((await s.call('/review',{...proposal,note:''},'admin')).http,400);
 assert.equal((await s.call('/review',proposal,'admin')).application.status,'accepted');assert.equal((await s.call('/review',proposal,'admin')).http,200);assert.equal((await s.call('/review',{...proposal,decision:'rejected'},'admin')).http,409);
 assert.equal(s.sql.prepare('SELECT COUNT(*) n FROM reward_application_reviews').get().n,1);assert.equal(s.sql.prepare('SELECT snapshot_json FROM reward_applications').get().snapshot_json,json);assert.deepEqual(s.sql.prepare('SELECT * FROM users').all(),before);
});
test('admin authority changed between read and review write prevents review',async t=>{
 const s=fixture(t),{result}=await submit(s),original=s.db.prepare.bind(s.db);s.db.prepare=query=>{const st=original(query);if(!query.includes('INSERT INTO reward_application_reviews'))return st;const bind=st.bind.bind(st);st.bind=(...args)=>{const bound=bind(...args);const run=bound.run.bind(bound);bound.run=async()=>{s.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN);return run();};return bound;};return st;};
 assert.equal((await s.call('/review',{id:result.application.id,decision:'accepted',note:'合成'},'admin')).http,409);assert.equal(s.sql.prepare('SELECT COUNT(*) n FROM reward_application_reviews').get().n,0);
});
test('malformed, unsupported and oversized requests fail without writes',async t=>{
 const s=fixture(t);assert.equal((await s.call('/preview',{fields:{...fields(),unit_name:'x'.repeat(100001)}})).http,413);assert.equal((await s.call('?id=x')).http,400);assert.equal((await s.call('?after=x')).http,400);assert.equal((await s.call('?id=a&id=b')).http,400);assert.equal((await s.call('/submit')).http,405);
});


test('reward declared referrer survives preview, signing, admin read and retry without changing CRM',async t=>{
 const s=fixture(t);s.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(REWARD,OTHER);
 const before=s.sql.prepare('SELECT * FROM users').all();
 const declared={...fields(),performance_owner_name:'合成合作推薦人',performance_owner_member_number:'20261030001'};
 const preview=await s.call('/preview',{fields:declared});assert.equal(preview.http,200);assert.equal(preview.snapshot.fields.performance_owner_name,declared.performance_owner_name);assert.equal(preview.snapshot.referrer_uid,REWARD);
 const payload=signature(preview.preview_id),signed=await s.call('/submit',payload);assert.equal(signed.http,200);
 assert.equal(signed.application.snapshot.fields.performance_owner_member_number,'20261030001');assert.equal(signed.application.snapshot.field_labels.performance_owner_name,'推薦人姓名');
 assert.deepEqual((await s.call('/admin?id='+signed.application.id,undefined,'admin')).application,signed.application);
 assert.deepEqual((await s.call('/submit',payload)).application,signed.application);assert.deepEqual(s.sql.prepare('SELECT * FROM users').all(),before);
 const {labelsFor}=await import('../js/modules/reward-application-pdf.mjs');assert.equal(labelsFor(signed.application.snapshot).performance_owner_member_number,'推薦人會員編號');
});

test('reward optional referrer requires a complete valid pair; prior signed snapshots remain unchanged',async t=>{
 const s=fixture(t);
 for(const extra of [{performance_owner_name:'只有姓名'},{performance_owner_member_number:'20261030001'},{performance_owner_name:'測試',performance_owner_member_number:'abc'},{performance_owner_name:'x'.repeat(151),performance_owner_member_number:'20261030001'}])assert.equal((await s.call('/preview',{fields:{...fields(),...extra}})).http,400);
 assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_application_previews').get().n,0);
 const {payload,result}=await submit(s),legacy=structuredClone(result.application.snapshot);
 delete legacy.fields.performance_owner_name;delete legacy.fields.performance_owner_member_number;delete legacy.field_labels;
 const json=JSON.stringify(legacy),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json))).toString('hex');
 s.sql.prepare('UPDATE reward_applications SET snapshot_json=?,content_sha256=? WHERE id=?').run(json,hash,result.application.id);
 const read=await s.call('?id='+result.application.id);assert.deepEqual(read.application.snapshot,legacy);
 assert.deepEqual((await s.call('/submit',payload)).application,read.application);
});
