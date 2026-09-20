import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleCrmCardPhoneLink,normalizeCrmPhone} from '../worker/crm-card-phone-link.mjs';
import api from '../workerbackup.js';

const actor={userId:'admin',role:'admin',token:'verified-token'};
const worker=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
// Use the real card access resolver without the rest of the Worker runtime.
const accessSource=worker.slice(worker.indexOf('  inferCardAccess(row,'),worker.indexOf('  inferCrmType(row)'));
const access=Function(`return ({${accessSource}})`)();
access.text=(v,f='')=>String(v??'').trim()||f;
access.jsonObject=v=>{try{return JSON.parse(v||'{}');}catch{return {};}};
access.isPublicCardReady=()=>false;
const deps={cardAccess:card=>access.inferCardAccess(card),reservedPhones:['0900000099']};
function fixture() {
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,name TEXT,phone TEXT,legacy_line_id TEXT,point_line_id TEXT,role TEXT,network_id TEXT,points INTEGER);
    CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,name TEXT,company_name TEXT,title TEXT,mobile TEXT,office_phone TEXT,line_id TEXT,profile_user_id TEXT,owner_user_id TEXT,creator_id TEXT,source_type TEXT,custom_config TEXT,created_at TEXT,updated_at TEXT);
    INSERT INTO users VALUES('u1','member','合成會員','','legacy','point','user','original-network',123);
    INSERT INTO card_contacts VALUES('c1','合成名片','測試公司','業務','0912-345-678','','','','collector','collector','private_import','{}','old','old');`);
  sql.exec(readFileSync(new URL('../migrations/0042_crm_card_phone_links.sql',import.meta.url),'utf8'));
  const f={sql,cleared:[],beforeBatch:null,failBatch:false};
  const db={prepare(query){return {bind(...values){return {
    first:async()=>sql.prepare(query).get(...values)||null,
    all:async()=>({results:sql.prepare(query).all(...values)}),
    run:()=>({success:true,meta:{changes:Number(sql.prepare(query).run(...values).changes)}})
  };}};},async batch(statements){
    f.beforeBatch?.();sql.exec('BEGIN');
    try{const result=statements.map((s,i)=>{if(f.failBatch&&i===1)throw Error('synthetic failure');return s.run();});sql.exec('COMMIT');return result;}
    catch(e){sql.exec('ROLLBACK');throw e;}
  }};
  db.withSession=mode=>{assert.equal(mode,'first-primary');return db;};
  f.env={ACTMASTER_DB:db,ACTMASTER_KV:{delete:async key=>f.cleared.push(key)}};
  f.call=(action,payload={},a=actor)=>handleCrmCardPhoneLink(action,{targetUserId:'member',...payload},f.env,a,deps);
  f.search=(query='合成')=>f.call('adminSearchCrmCards',{query});
  f.link=async(extra={})=>{const result=await f.search();return f.call('adminLinkCrmCard',{cardRowId:'c1',fingerprint:result.data.cards[0]?.fingerprint,confirmed:true,...extra});};
  f.logCount=()=>sql.prepare('SELECT count(*) AS n FROM crm_card_phone_links').get().n;
  f.phone=()=>sql.prepare("SELECT phone FROM users WHERE row_id='u1'").get().phone;
  return f;
}
test('search is read-only; explicit confirmation records provenance and only fills phone',async()=>{
 const f=fixture();try{
  const before=f.sql.prepare('SELECT * FROM card_contacts').all();
  const search=await f.search();assert.equal(search.data.cards[0].phone,'0912345678');assert.equal(f.phone(),'');assert.equal(f.logCount(),0);
  const result=await f.link();assert.equal(result.success,true);assert.equal(f.phone(),'0912345678');assert.equal(f.logCount(),1);
  assert.deepEqual(f.sql.prepare('SELECT * FROM card_contacts').all(),before);
  const user=f.sql.prepare('SELECT role,network_id,points FROM users').get();assert.equal(user.role,'user');assert.equal(user.network_id,'original-network');assert.equal(user.points,123);
  assert.equal((await f.search('')).data.reference.card_row_id,'c1');assert.ok(f.cleared.includes('U_PROFILE_member'));
  assert.equal((await f.link()).success,false);assert.equal(f.logCount(),1);
 }finally{f.sql.close();}
});
test('only token-authenticated admin; route policies disallow identity fallback',async()=>{
 const f=fixture();try{
  for(const a of [null,{...actor,role:'store'},{...actor,role:'reward'},{...actor,role:'redeem'},{...actor,role:'user'},{...actor,token:''},{...actor,source:'d1_identity_fallback'}]) {
   assert.equal((await f.call('adminSearchCrmCards',{},a)).success,false);assert.equal((await f.call('adminLinkCrmCard',{confirmed:true},a)).success,false);
  }
  for(const name of ['adminSearchCrmCards','adminLinkCrmCard'])assert.ok(worker.includes(`${name}: { access: 'admin' }`));
  assert.equal(f.logCount(),0);
 }finally{f.sql.close();}
});
test('real dispatcher rejects caller-supplied admin fields without a token',async()=>{
 for(const action of ['adminSearchCrmCards','adminLinkCrmCard']) {
  const response=await api.fetch(new Request('https://unit.test/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:{userId:'admin',authenticatedUserId:'admin',authenticatedRole:'admin',role:'admin',targetUserId:'member',confirmed:true}})}),{});
  const result=await response.json();assert.equal(result.success,false);assert.match(result.error,/Token/);
 }
});
test('never auto-confirms, overwrites phone, changes snapshot, or uses another person card',async()=>{
 for(const mutation of ["UPDATE users SET phone='0999999999'", "UPDATE card_contacts SET line_id='other'", "UPDATE card_contacts SET profile_user_id='other'", "UPDATE card_contacts SET source_type='self_profile',owner_user_id='other'", "UPDATE card_contacts SET source_type='referral_placeholder'", "UPDATE card_contacts SET mobile='not a phone'"]) {
  const f=fixture();try{const card=(await f.search()).data.cards[0];f.sql.exec(mutation);const before=f.phone();
   const res=await f.call('adminLinkCrmCard',{cardRowId:'c1',fingerprint:card.fingerprint,confirmed:true});assert.equal(res.success,false,mutation);assert.equal(f.phone(),before);assert.equal(f.logCount(),0);
  }finally{f.sql.close();}
 }
 const f=fixture();try{assert.equal((await f.link({confirmed:false})).success,false);const c=(await f.search()).data.cards[0];f.sql.exec("UPDATE card_contacts SET company_name='changed'");assert.equal((await f.call('adminLinkCrmCard',{cardRowId:'c1',fingerprint:c.fingerprint,confirmed:true})).success,false);assert.equal(f.logCount(),0);}finally{f.sql.close();}
});
test('phone separators/country code normalize; duplicate and reserved numbers blocked',async()=>{
 assert.equal(normalizeCrmPhone('０９１２－３４５－６７８'),'0912345678');
 for(const phone of ['0912-345-678','+886 912 345 678','０９１２－３４５－６７８']) {
  const f=fixture();try{f.sql.prepare("INSERT INTO users(row_id,line_id,phone) VALUES('other','other',?)").run(phone);assert.equal((await f.link()).success,false);assert.equal(f.logCount(),0);}finally{f.sql.close();}
 }
 const f=fixture();try{f.sql.exec("UPDATE card_contacts SET mobile='0900-000-099'");assert.equal((await f.link()).success,false);}finally{f.sql.close();}
});
test('races at write time cannot overwrite phone, copy changed card, or duplicate another phone',async()=>{
 for(const mutation of ["UPDATE users SET phone='0988888888'", "UPDATE card_contacts SET mobile='0988888888'", "UPDATE card_contacts SET line_id='other'", "INSERT INTO users(row_id,line_id,phone) VALUES('other','other','0912345678')"]) {
  const f=fixture();try{f.beforeBatch=()=>f.sql.exec(mutation);assert.equal((await f.link()).success,false);assert.equal(f.logCount(),0);}finally{f.sql.close();}
 }
});
test('batch failure rolls back provenance and phone; search caps results and handles literal query',async()=>{
 const f=fixture();try{
  f.failBatch=true;assert.equal((await f.link()).success,false);assert.equal(f.phone(),'');assert.equal(f.logCount(),0);
  for(let i=0;i<30;i++)f.sql.prepare("INSERT INTO card_contacts(row_id,name,mobile,source_type) VALUES(?,?,?,'private_import')").run('test'+i,'合成'+i,'0912000000');
  const result=await f.search();assert.equal(result.data.cards.length,25);assert.equal(result.data.hasMore,true);
  assert.equal((await f.search("%' OR 1=1 --")).data.cards.length,0);
 }finally{f.sql.close();}
});
