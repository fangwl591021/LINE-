import test from 'node:test';
import assert from 'node:assert/strict';
import {handSignFixture,partnerFields,fullFields,signing,syntheticTerms,ADMIN,REWARD,OTHER} from './fixtures/hand-sign-applications.mjs';
import {handSignFields,handSignConfirmations,normalizeHandSignApplication,sha256Text} from '../worker/hand-sign-application-definition.mjs';

for(const kind of ['partner','full']){
 test(kind+' private template, immutable handwritten snapshot and owner/admin reads never grant roles or create transactions',async t=>{
  const f=await handSignFixture(t),before=f.sql.prepare('SELECT * FROM users ORDER BY line_id').all();
  const template=await f.call(kind,'/template');assert.equal(template.http,200);assert.deepEqual(template.terms,syntheticTerms(kind));assert.deepEqual(template.fields,handSignFields[kind]);assert.equal(template.template.source_sha256.length,64);assert.equal(template.template.content_sha256,await sha256Text(JSON.stringify(template.terms)));
  const {result,preview}=await f.submit(kind);assert.equal(result.http,200,JSON.stringify(result));const record=result.application;
  assert.equal(record.status,'pending');assert.equal(record.snapshot.form_kind,kind);assert.deepEqual(record.snapshot.terms,template.terms);assert.deepEqual(record.snapshot.template,template.template);assert.deepEqual(record.snapshot.confirmations,handSignConfirmations[kind]);assert.equal(record.snapshot.signer_uid,OTHER);assert.deepEqual(record.snapshot.field_labels,template.field_labels);
  const row=f.sql.prepare('SELECT * FROM '+kind+'_applications').get();assert.equal(row.content_sha256,await sha256Text(row.snapshot_json));
  assert.equal((await f.call(kind,'?id='+preview.preview_id)).http,200);assert.equal((await f.call(kind,'?id='+preview.preview_id,undefined,'reward')).http,404);assert.equal((await f.call(kind,'/admin?id='+preview.preview_id,undefined,'admin')).http,200);
  for(const path of ['', '/template','/admin'])assert.equal((await f.call(kind,path,undefined,'bad')).http,401);
  assert.equal((await f.call(kind,'/admin?id='+preview.preview_id)).http,403);
  assert.deepEqual(f.sql.prepare('SELECT * FROM users ORDER BY line_id').all(),before);assert.equal(f.sql.prepare('SELECT count(*) n FROM reward_unit_publications').get().n,0);
  for(const other of ['reward','discount',kind==='partner'?'full':'partner'])assert.equal((await f.call(other,'?id='+preview.preview_id)).http,404);
 });
 test(kind+' exact retries, cross-type isolation, invalid consent and strokes preserve a single signed record',async t=>{
  const f=await handSignFixture(t),fields=kind==='partner'?partnerFields():fullFields(),preview=await f.call(kind,'/preview',{fields}),payload=signing(preview.preview_id,kind);
  for(const consent of Object.keys(handSignConfirmations[kind]))assert.equal((await f.call(kind,'/submit',{...payload,[consent]:false})).http,400);
  assert.equal((await f.call(kind,'/submit',{...payload,strokes:[[[0,0],[1,1]]]})).http,400);
  const copies=await Promise.all(Array.from({length:5},()=>f.call(kind,'/submit',payload)));assert(copies.every(result=>result.http===200));assert.equal(f.sql.prepare('SELECT count(*) n FROM '+kind+'_applications').get().n,1);
  const changed=structuredClone(payload);changed.strokes[0][0][0]++;assert.equal((await f.call(kind,'/submit',changed)).http,409);assert.equal((await f.call(kind,'/submit',payload,'reward')).http,409);
  const foreign=kind==='partner'?'full':'partner';assert.equal((await f.call(foreign,'/submit',signing(preview.preview_id,foreign))).http,409);
 });
 test(kind+' template revocation, corruption and replacement invalidate unsigned previews while old signed records stay readable',async t=>{
  const f=await handSignFixture(t),{result}=await f.submit(kind),id=result.application.id;
  const preview=await f.call(kind,'/preview',{fields:kind==='partner'?partnerFields():fullFields()});
  f.sql.prepare('UPDATE signing_application_templates SET active=0 WHERE kind=?').run(kind);
  assert.equal((await f.call(kind,'/template')).http,503);assert.equal((await f.call(kind,'/submit',signing(preview.preview_id,kind))).http,503);
  assert.equal((await f.call(kind,'?id='+id)).http,200);assert.equal((await f.call(kind,'/submit',signing(id,kind))).http,200);
  f.sql.prepare("UPDATE signing_application_templates SET active=1,terms_json='{}' WHERE kind=?").run(kind);assert.equal((await f.call(kind,'/template')).http,503);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM '+kind+'_applications').get().n,1);
 });
 test(kind+' template revoked at INSERT cannot create a signed record',async t=>{
  const f=await handSignFixture(t),preview=await f.call(kind,'/preview',{fields:kind==='partner'?partnerFields():fullFields()}),original=f.db.prepare.bind(f.db);let changed=false;
  f.db.prepare=query=>{const statement=original(query);if(!query.includes('INSERT INTO '+kind+'_applications('))return statement;const bind=statement.bind.bind(statement);statement.bind=(...args)=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{changed=true;f.sql.prepare('UPDATE signing_application_templates SET active=0 WHERE kind=?').run(kind);return run();};return bound;};return statement;};
  assert.equal((await f.call(kind,'/submit',signing(preview.preview_id,kind))).http,409);assert.equal(changed,true);assert.equal(f.sql.prepare('SELECT count(*) n FROM '+kind+'_applications').get().n,0);
 });
 test(kind+' owner-only preview expiry and admin immutable review preserve signed evidence',async t=>{
  const f=await handSignFixture(t),fields=kind==='partner'?partnerFields():fullFields(),preview=await f.call(kind,'/preview',{fields});
  await f.call(kind,'/preview',{fields:{...fields,unit_name:'新版合成名稱'}});assert.equal((await f.call(kind,'/submit',signing(preview.preview_id,kind))).http,409);
  const {result}=await f.submit(kind),id=result.application.id,row=f.sql.prepare('SELECT * FROM '+kind+'_applications').get();
  const decisions=await Promise.all(['accepted','rejected'].map(decision=>f.call(kind,'/review',{id,decision,note:'合成審核說明'},'admin')));assert.deepEqual(decisions.map(result=>result.http).sort(),[200,409]);assert.equal(f.sql.prepare('SELECT count(*) n FROM '+kind+'_application_reviews').get().n,1);
  assert.deepEqual(f.sql.prepare('SELECT * FROM '+kind+'_applications').get(),row);assert.equal(f.sql.prepare('SELECT role FROM users WHERE line_id=?').get(OTHER).role,'user');
 });
}

test('partner referrer is server-sourced, cannot be reassigned, and changes require a fresh signature preview',async t=>{
 const f=await handSignFixture(t);f.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(REWARD,OTHER);f.sql.prepare('UPDATE users SET name=?,member_number=? WHERE line_id=?').run('核對推薦人','20261021001',REWARD);
 const template=await f.call('partner','/template');assert.deepEqual(template.referral,{required:true,name:'核對推薦人',memberNumber:'20261021001'});
 assert.equal((await f.call('partner','/preview',{fields:partnerFields()})).http,409);
 const fields={...partnerFields(),referrer_name:template.referral.name,referrer_member_number:template.referral.memberNumber},preview=await f.call('partner','/preview',{fields});assert.equal(preview.http,200);
 f.sql.prepare('UPDATE users SET member_number=? WHERE line_id=?').run('20261021002',REWARD);assert.equal((await f.call('partner','/submit',signing(preview.preview_id,'partner'))).http,409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_applications').get().n,0);
 const fresh=await f.call('partner','/preview',{fields:{...fields,referrer_member_number:'20261021002'}});assert.equal(fresh.http,200);assert.equal((await f.call('partner','/submit',signing(fresh.preview_id,'partner'))).http,200);
 assert.equal(f.sql.prepare('SELECT referrer_id FROM users WHERE line_id=?').get(OTHER).referrer_id,REWARD);
});

test('full and partner forms reject unknown fields, wrong parties and invalid banking without business writes',()=>{
 for(const fields of [{...partnerFields(),party_type:'admin'},{...partnerFields(),representative_name:''},{...partnerFields(),bank_account:'evil'},{...partnerFields(),bank_code:'abc'},{...partnerFields(),bank_code:'1234'},{...partnerFields(),role:'admin'},{...partnerFields(),phone:'02-12345678'}])assert.throws(()=>normalizeHandSignApplication('partner',fields));
 for(const fields of [{...fullFields(),address:''},{...fullFields(),services:''},{...fullFields(),payment_status:'paid'},{...fullFields(),phone:'invalid'},{...fullFields(),unit_name:'bad\n'}])assert.throws(()=>normalizeHandSignApplication('full',fields));
 assert.equal(normalizeHandSignApplication('partner',{...partnerFields(),party_type:'natural_person',representative_name:'',bank_account:'123 456-7890'}).bank_account,'1234567890');
});

test('NULL CRM referral remains unassigned and valid without manufacturing a sponsor',async t=>{
 const f=await handSignFixture(t);f.sql.prepare('UPDATE users SET referrer_id=NULL WHERE line_id=?').run(OTHER);
 for(const kind of ['full','partner']){const {result}=await f.submit(kind);assert.equal(result.http,200);assert.equal(result.application.snapshot.referrer_uid,'');}
});

test('partner CRM row references follow only a unique explicit canonical identity and preserve the original relationship',async t=>{
 const f=await handSignFixture(t),old='U'+'d'.repeat(32);
 f.sql.prepare('INSERT INTO users(row_id,line_id,role,name,member_number) VALUES(?,?,?,?,?)').run('retired-referrer-row',old,'user','退休舊姓名','20261019001');
 f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(old,REWARD);
 f.sql.prepare('UPDATE users SET name=?,member_number=? WHERE line_id=?').run('目前推薦人','202610211000',REWARD);
 f.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run('retired-referrer-row',OTHER);
 const template=await f.call('partner','/template');assert.equal(template.http,200);assert.deepEqual(template.referral,{required:true,name:'目前推薦人',memberNumber:'202610211000'});assert.equal(template.referral.proof,undefined);
 const fields={...partnerFields(),referrer_name:template.referral.name,referrer_member_number:template.referral.memberNumber},preview=await f.call('partner','/preview',{fields});assert.equal(preview.http,200);
 const snapshot=preview.snapshot;assert.equal(snapshot.referrer_uid,'retired-referrer-row');assert.equal(snapshot.referral_proof.memberUid,REWARD);assert.equal(snapshot.fields.referrer_name,'目前推薦人');
 assert.equal((await f.call('partner','/submit',signing(preview.preview_id,'partner'))).http,200);
 assert.equal(f.sql.prepare('SELECT referrer_id FROM users WHERE line_id=?').get(OTHER).referrer_id,'retired-referrer-row');
});

test('a CRM referrer identity link changed at the signing INSERT is rejected atomically',async t=>{
 const f=await handSignFixture(t);f.sql.prepare('UPDATE users SET name=?,member_number=? WHERE line_id=?').run('目前推薦人','20261021001',REWARD);f.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(REWARD,OTHER);
 const fields={...partnerFields(),referrer_name:'目前推薦人',referrer_member_number:'20261021001'},preview=await f.call('partner','/preview',{fields}),original=f.db.prepare.bind(f.db);assert.equal(preview.http,200);
 f.db.prepare=query=>{const statement=original(query);if(!query.includes('INSERT INTO partner_applications('))return statement;const bind=statement.bind.bind(statement);statement.bind=(...args)=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(REWARD,ADMIN);return run();};return bound;};return statement;};
 assert.equal((await f.call('partner','/submit',signing(preview.preview_id,'partner'))).http,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_applications').get().n,0);
});

for(const kind of ['partner','full'])test(kind+' admin name/phone authority snapshot cannot change before a review write',async t=>{
 const f=await handSignFixture(t),{result}=await f.submit(kind),original=f.db.prepare.bind(f.db),id=result.application.id;
 f.db.prepare=query=>{const statement=original(query);if(!query.includes('INSERT INTO '+kind+'_application_reviews'))return statement;const bind=statement.bind.bind(statement);statement.bind=(...args)=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{f.sql.prepare("UPDATE users SET phone='',name='不同管理人' WHERE line_id=?").run(ADMIN);return run();};return bound;};return statement;};
 assert.equal((await f.call(kind,'/review',{id,decision:'accepted',note:'合成審核'},'admin')).http,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM '+kind+'_application_reviews').get().n,0);
});

for(const kind of ['reward','discount'])test(kind+' legacy review also pins the administrators name and phone at the write boundary',async t=>{
 const f=await handSignFixture(t),fields={unit_name:'合成舊表單',applicant_name:'合成申請人',phone:'0912345678',...(kind==='reward'?{unit_types:['企業'],recipients:['員工'],scenarios:['員工福利']}:{services:'合成商品',business_types:['品牌商品']})};
 const preview=await f.call(kind,'/preview',{fields}),payload={preview_id:preview.preview_id,strokes:signing(preview.preview_id,'partner').strokes,electronic:true,terms:true,authority:true,...(kind==='discount'?{discount:true,publication:true}:{})};
 assert.equal((await f.call(kind,'/submit',payload)).http,200);const original=f.db.prepare.bind(f.db);
 f.db.prepare=query=>{const statement=original(query);if(!query.includes('INSERT INTO '+kind+'_application_reviews'))return statement;const bind=statement.bind.bind(statement);statement.bind=(...args)=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{f.sql.prepare("UPDATE users SET phone='',name='已變更管理員資料' WHERE line_id=?").run(ADMIN);return run();};return bound;};return statement;};
 assert.equal((await f.call(kind,'/review',{id:preview.preview_id,decision:'accepted',note:'合成舊表單審核'},'admin')).http,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM '+kind+'_application_reviews').get().n,0);
});

async function signedReviewApplication(f,kind){
 if(['partner','full'].includes(kind))return (await f.submit(kind)).result.application.id;
 const fields={unit_name:'合成舊表單',applicant_name:'合成申請人',phone:'0912345678',...(kind==='reward'?{unit_types:['企業'],recipients:['員工'],scenarios:['員工福利']}:{services:'合成商品',business_types:['品牌商品']})};
 const preview=await f.call(kind,'/preview',{fields}),payload={preview_id:preview.preview_id,strokes:signing(preview.preview_id,'partner').strokes,electronic:true,terms:true,authority:true,...(kind==='discount'?{discount:true,publication:true}:{})};
 assert.equal((await f.call(kind,'/submit',payload)).http,200);return preview.preview_id;
}
for(const kind of ['reward','discount','partner','full']){
 for(const change of ['foreign-alias','active-link'])test(kind+' review atomically rejects a new '+change+' outside the unchanged administrator row',async t=>{
  const f=await handSignFixture(t),id=await signedReviewApplication(f,kind),original=f.db.prepare.bind(f.db);
  const before=f.sql.prepare('SELECT * FROM users WHERE line_id=?').get(ADMIN);let changed=false;
  f.db.prepare=query=>{const statement=original(query);if(!query.includes('INSERT INTO '+kind+'_application_reviews'))return statement;const bind=statement.bind.bind(statement);statement.bind=(...args)=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{
   if(!changed){changed=true;if(change==='foreign-alias')f.sql.prepare('UPDATE users SET point_line_id=? WHERE line_id=?').run(ADMIN,OTHER);else f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(ADMIN,REWARD);}
   return run();
  };return bound;};return statement;};
  assert.equal((await f.call(kind,'/review',{id,decision:'accepted',note:'合成身分競態審核'},'admin')).http,409);
  assert.equal(changed,true);assert.equal(f.sql.prepare('SELECT count(*) n FROM '+kind+'_application_reviews').get().n,0);
  assert.deepEqual(f.sql.prepare('SELECT * FROM users WHERE line_id=?').get(ADMIN),before);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM '+kind+'_applications WHERE id=?').get(id).n,1);
 });
 test(kind+' review permits an unchanged canonical administrator with one verified old/new identity link',async t=>{
  const f=await handSignFixture(t),id=await signedReviewApplication(f,kind),old='U'+'d'.repeat(32);
  f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(old,ADMIN);
  const before=f.sql.prepare('SELECT * FROM users ORDER BY line_id').all();
  const result=await f.call(kind,'/review',{id,decision:'accepted',note:'合成已核對身分審核'},'admin');assert.equal(result.http,200);
  assert.doesNotMatch(JSON.stringify(result),/identityProof|legacy_line_id|point_line_id/);
  assert.deepEqual(f.sql.prepare('SELECT * FROM users ORDER BY line_id').all(),before);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM '+kind+'_application_reviews').get().n,1);
 });
}
