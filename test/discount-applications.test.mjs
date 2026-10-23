import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN,REWARD,OTHER,mapper} from './fixtures/reward-unit-directory.mjs';
import {handleRewardApplications,normalizeSigning} from '../worker/reward-applications.mjs';
import {discountTerms,discountConfirmations,normalizeDiscountApplication} from '../worker/discount-application-definition.mjs';
const fields=()=>({unit_name:'合成折抵店家',services:'生活用品與維修服務',applicant_name:'合成申請人',phone:'0912345678',line_contact:'test',business_types:['實體店面','專業服務'],business_types_other:'',assisted_partner:'合成協助者'});
const signature=id=>({preview_id:id,strokes:[Array.from({length:15},(_,i)=>[100+i*30,100+i%2*90])],electronic:true,terms:true,authority:true,discount:true,publication:true});
function fixture(t){
 const s=rewardFixture();t.after(()=>s.sql.close());
 s.sql.exec("ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT '';"+['0068_reward_applications.sql','0069_discount_applications.sql'].map(f=>readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8')).join('\n'));
 s.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(REWARD,OTHER);
 const fetcher=async(url,opts)=>{assert.equal(url,'https://api.line.me/v2/profile');const uid={admin:ADMIN,reward:REWARD,user:OTHER}[opts.headers.Authorization.slice(7)];return uid?Response.json({userId:uid}):new Response('',{status:401});};
 s.call=async(path='',data,token='user',kind='discount')=>{const r=await handleRewardApplications(new Request('https://test/v1/'+kind+'-applications'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),s.env,mapper,fetcher);return {http:r.status,...await r.json()};};
 return s;
}
async function submit(s){const p=await s.call('/preview',{fields:fields()});assert.equal(p.http,200,JSON.stringify(p));const signing=signature(p.preview_id);const result=await s.call('/submit',signing);assert.equal(result.http,200,JSON.stringify(result));return {id:p.preview_id,signing,result};}

test('discount source terms, fields, declared helper and canonical referrer freeze without authority writes',async t=>{
 const s=fixture(t),before=s.sql.prepare('SELECT * FROM users').all();
 const template=await s.call('/template');assert.deepEqual(template.terms,discountTerms);assert.ok(template.terms.paragraphs.some(p=>p.includes('10%～50%')));assert.ok(template.terms.paragraphs.some(p=>p.includes('退換貨')));assert.equal(template.options.business_types.length,6);
 const {result}=await submit(s),snapshot=result.application.snapshot;assert.equal(snapshot.form_kind,'discount');assert.equal(snapshot.referrer_uid,REWARD);assert.equal(snapshot.fields.assisted_partner,'合成協助者');assert.deepEqual(snapshot.fields,normalizeDiscountApplication(fields()));assert.deepEqual(snapshot.terms,discountTerms);assert.deepEqual(snapshot.confirmations,discountConfirmations);
 const row=s.sql.prepare('SELECT * FROM discount_applications').get();assert.equal(row.content_sha256,Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.snapshot_json))).toString('hex'));
 assert.deepEqual(s.sql.prepare('SELECT * FROM users').all(),before);assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publications').get().n,0);assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_applications').get().n,0);
});
test('private records and review reject different members, unauthenticated, malformed and forged roles',async t=>{
 const s=fixture(t),{id}=await submit(s);
 for(const route of ['', '/template','/admin'])assert.equal((await s.call(route,undefined,'bad')).http,401);
 assert.equal((await s.call('?id='+id,undefined,'reward')).http,404);assert.equal((await s.call('/admin?id='+id,undefined,'reward')).http,403);
 assert.equal((await s.call('/admin?id='+id,undefined,'admin')).http,200);assert.equal((await s.call('/admin?id='+id+'&target='+REWARD,undefined,'admin')).http,404);
 assert.equal((await s.call('?owner_uid='+OTHER)).http,400);assert.equal((await s.call('/preview',{fields:fields(),role:'admin'})).http,400);
});
test('all five explicit confirmations required; discount cannot use reward signatures',async t=>{
 const s=fixture(t),p=await s.call('/preview',{fields:fields()}),valid=signature(p.preview_id);
 for(const k of Object.keys(discountConfirmations)){for(const v of [false,'true',undefined]){const wrong={...valid,[k]:v};assert.equal((await s.call('/submit',wrong)).http,400);}}
 assert.deepEqual(normalizeSigning(valid,discountConfirmations),valid);assert.equal(s.sql.prepare('SELECT count(*) n FROM discount_applications').get().n,0);
});
test('fields require service and business type; reject hidden fees/limits/referrals and oversized bodies',async t=>{
 for(const value of [{...fields(),services:''},{...fields(),business_types:[]},{...fields(),business_types:['企業']},{...fields(),business_types:['其他']},{...fields(),business_types:['實體店面','實體店面']},{...fields(),services:'a'.repeat(601)},{...fields(),referrer_uid:OTHER},{...fields(),discount_percent:99},{...fields(),phone:'03-1234567'},{...fields(),unit_name:'x\n'}])assert.throws(()=>normalizeDiscountApplication(value));
 const s=fixture(t);assert.equal((await s.call('/preview',{fields:{...fields(),services:'x'.repeat(100001)}})).http,413);
});
test('independent previews and IDs prevent cross-kind submission, reads and review',async t=>{
 const s=fixture(t),discount=await s.call('/preview',{fields:fields()}),reward=await s.call('/preview',{fields:{unit_name:'合成贈點',applicant_name:'測試',phone:'0912345678',unit_types:['企業'],recipients:['員工'],scenarios:['員工福利']}},'user','reward');
 const rewardSigning=signature(reward.preview_id);delete rewardSigning.discount;delete rewardSigning.publication;
 assert.equal((await s.call('/submit',signature(reward.preview_id))).http,409);
 assert.equal((await s.call('/submit',{...rewardSigning,preview_id:discount.preview_id},'user','reward')).http,409);
 assert.equal((await s.call('/submit',signature(discount.preview_id))).http,200);assert.equal((await s.call('/submit',rewardSigning,'user','reward')).http,200);
 assert.equal((await s.call('?id='+reward.preview_id)).http,404);assert.equal((await s.call('?id='+discount.preview_id,undefined,'user','reward')).http,404);
 assert.equal((await s.call('/review',{id:reward.preview_id,decision:'accepted',note:'錯誤類別'},'admin')).http,404);
 assert.equal((await s.call()).applications.length,1);assert.equal((await s.call('',undefined,'user','reward')).applications.length,1);
});
test('same submission retries once; changed signature and owner cannot overwrite',async t=>{
 const s=fixture(t),{id,signing}=await submit(s);assert.equal((await s.call('/submit',signing)).application.id,id);
 const changed=structuredClone(signing);changed.strokes[0][0][0]++;assert.equal((await s.call('/submit',changed)).http,409);assert.equal((await s.call('/submit',signing,'reward')).http,409);
 assert.equal(s.sql.prepare('SELECT count(*) n FROM discount_applications').get().n,1);
});
test('expired/superseded preview and invalid signature never create application',async t=>{
 const s=fixture(t),p=await s.call('/preview',{fields:fields()});await s.call('/preview',{fields:{...fields(),services:'新服務'}});assert.equal((await s.call('/submit',signature(p.preview_id))).http,409);
 const q=await s.call('/preview',{fields:fields()});s.sql.exec("UPDATE discount_application_previews SET expires_at='2000-01-01'");assert.equal((await s.call('/submit',signature(q.preview_id))).http,409);
 const fresh=await s.call('/preview',{fields:fields()});for(const strokes of [[],[[[0,0],[1,1]]],[[[Infinity,0],[2,2]]],[Array.from({length:2501},()=>[1,1])]])assert.equal((await s.call('/submit',{...signature(fresh.preview_id),strokes})).http,400);
});
test('admin review is immutable/idempotent; no role, catalog, referral or signed snapshot mutation',async t=>{
 const s=fixture(t),{id}=await submit(s),before=s.sql.prepare('SELECT * FROM users').all(),row=s.sql.prepare('SELECT * FROM discount_applications').get();
 const proposal={id,decision:'accepted',note:'合成審核，未開通折抵'};
 assert.equal((await s.call('/review',proposal)).http,403);assert.equal((await s.call('/review',{...proposal,note:''},'admin')).http,400);
 assert.equal((await s.call('/review',proposal,'admin')).application.status,'accepted');assert.equal((await s.call('/review',proposal,'admin')).http,200);assert.equal((await s.call('/review',{...proposal,decision:'rejected'},'admin')).http,409);
 assert.deepEqual(s.sql.prepare('SELECT * FROM discount_applications').get(),row);assert.deepEqual(s.sql.prepare('SELECT * FROM users').all(),before);assert.equal(s.sql.prepare('SELECT count(*) n FROM discount_application_reviews').get().n,1);
});
test('revoked admin cannot review even after read authorization',async t=>{
 const s=fixture(t),{id}=await submit(s),original=s.db.prepare.bind(s.db);
 s.db.prepare=query=>{const st=original(query);if(!query.includes('INSERT INTO discount_application_reviews'))return st;const bind=st.bind.bind(st);st.bind=(...args)=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{s.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN);return run();};return bound;};return st;};
 assert.equal((await s.call('/review',{id,decision:'accepted',note:'合成'},'admin')).http,409);assert.equal(s.sql.prepare('SELECT count(*) n FROM discount_application_reviews').get().n,0);
});
