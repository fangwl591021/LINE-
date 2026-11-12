import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreAdminPins} from '../worker/store-admin-pins.mjs';

const ADMIN='U'+'a'.repeat(32),MEMBER='U'+'b'.repeat(32),ALIAS='U'+'c'.repeat(32);
const SHOP='00000001-1111-4111-8111-111111111111',PARTNER='00000002-1111-4111-8111-111111111111';
const KEY=n=>String(n).padStart(8,'0')+'-2222-4222-8222-222222222222';
const data=(extra={})=>({source:'shop',id:SHOP,pinned:true,version:0,request_key:KEY(1),...extra});

function fixture(t,{hardGroup=null}={}){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT,phone TEXT,points INTEGER DEFAULT 0);
 CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
 CREATE TABLE store_shop_stores(id TEXT PRIMARY KEY,name TEXT,status TEXT,version INTEGER,updated_at TEXT);
 CREATE TABLE point_redemption_partners(partner_handle TEXT PRIMARY KEY,name TEXT,status TEXT);
 CREATE TABLE point_ledger(id TEXT PRIMARY KEY,points INTEGER);INSERT INTO point_ledger VALUES('keep',321);
 CREATE TABLE store_publication_order(source TEXT,entity_id TEXT,published_at TEXT);INSERT INTO store_publication_order VALUES('shop','${SHOP}','2026-11-01');`);
 sql.exec(readFileSync(new URL('../migrations/0085_store_catalog_pins.sql',import.meta.url),'utf8'));
 sql.prepare('INSERT INTO users(row_id,line_id,role,name,phone,points) VALUES(?,?,?,?,?,?)').run(ADMIN,ADMIN,'admin','管理員','0911000000',100);
 sql.prepare('INSERT INTO users(row_id,line_id,role,name,phone,points) VALUES(?,?,?,?,?,?)').run(MEMBER,MEMBER,'user','會員','0922000000',200);
 sql.prepare('INSERT INTO store_shop_stores VALUES(?,?,?,?,?)').run(SHOP,'測試店','active',4,'2026-11-01');
 sql.prepare('INSERT INTO point_redemption_partners VALUES(?,?,?)').run('partner_'+PARTNER.replaceAll('-',''),'代建店','active');
 let beforeBatch=null,failAudit=false;
 const db={withSession(){return this;},prepare(query){
  const statement=(args=[])=>({bind(...values){return statement(values);},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async run(){if(failAudit&&query.includes('INSERT INTO store_catalog_pin_audit'))throw Error('synthetic audit failure');return {success:true,meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}});return statement();
 },async batch(statements){if(beforeBatch)await beforeBatch();sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const env={ACTMASTER_DB:db,STORE_DIRECTORY_PINNING_ENABLED:'true'};
 const fetcher=async(_url,init)=>{const token=init.headers.Authorization.slice(7);const id={admin:ADMIN,member:MEMBER,alias:ALIAS}[token];return id?Response.json({userId:id}):new Response('',{status:401});};
 const mapper=row=>({role:row.role});
 if(hardGroup)mapper.exactHardAdminIdentity=(uid,row)=>!hardGroup.includes(uid)?(row?false:[]):!row?[...hardGroup]:(hardGroup.includes(row.line_id)&&row.role==='admin'&&row.name==='管理員'&&row.phone==='0911000000');
 const call=async(body,token='admin',method='POST',query='')=>{const request=new Request('https://fixture.invalid/v1/store-shop/admin/stores/pin'+query,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});const response=await handleStoreAdminPins(request,env,mapper,fetcher);return {http:response.status,...(response.status===204?{}:await response.json())};};
 const protectedState=()=>JSON.stringify(['users','store_shop_stores','point_redemption_partners','point_ledger','store_publication_order'].map(table=>sql.prepare('SELECT * FROM '+table).all()));
 const pins=()=>sql.prepare('SELECT source,entity_id,pinned,version FROM store_catalog_pins ORDER BY source,entity_id').all();
 const audits=()=>sql.prepare('SELECT * FROM store_catalog_pin_audit ORDER BY request_key').all();
 return {sql,env,call,pins,audits,protectedState,setBeforeBatch(fn){beforeBatch=fn;},setFailAudit(v){failAudit=v;}};
}

test('admin pins and unpins both sources with CAS, independent audit and unchanged catalog/points',async t=>{
 const f=fixture(t),before=f.protectedState();
 let result=await f.call(data());assert.equal(result.http,200);assert.equal(result.pinned,true);assert.equal(result.pin_version,1);assert.equal(result.replayed,false);
 result=await f.call(data());assert.equal(result.http,200);assert.equal(result.replayed,true);assert.equal(f.audits().length,1);
 assert.equal((await f.call(data({pinned:false}))).code,'REQUEST_CONFLICT');
 assert.equal((await f.call(data({pinned:false,request_key:KEY(2)}))).code,'VERSION_CONFLICT');
 result=await f.call(data({pinned:false,version:1,request_key:KEY(3)}));assert.equal(result.http,200);assert.equal(result.pin_version,2);assert.equal(result.pinned,false);
 result=await f.call(data({source:'partner',id:PARTNER,request_key:KEY(4)}));assert.equal(result.http,200);assert.equal(result.pinned,true);
 assert.deepEqual(f.pins().map(row=>[row.source,row.entity_id,row.pinned,row.version]),[['partner','partner_'+PARTNER.replaceAll('-',''),1,1],['shop',SHOP,0,2]]);
 assert.equal(f.audits().length,3);assert.equal(f.protectedState(),before);
});

test('authentication, strict payload, source and missing target cannot write pins',async t=>{
 const f=fixture(t),before=f.protectedState();
 assert.equal((await f.call(data(),'')).http,401);assert.equal((await f.call(data(),'member')).http,403);
 for(const bad of [data({role:'admin'}),data({pinned:'true'}),data({version:-1}),data({source:'other'}),data({request_key:'invalid'}),data({id:KEY(88)})])assert.ok((await f.call(bad)).http>=400);
 assert.equal((await f.call(data(),'admin','POST','?role=admin')).http,400);assert.equal((await f.call({},'admin','GET')).http,405);assert.equal((await f.call({},'admin','OPTIONS')).http,204);
 f.env.STORE_DIRECTORY_PINNING_ENABLED='false';assert.equal((await f.call(data())).http,503);
 assert.equal(f.audits().length,0);assert.equal(f.pins().length,0);assert.equal(f.protectedState(),before);
});

test('write-time role, identity and target changes reject without pin or audit',async t=>{
 for(const scenario of ['role','alias-conflict','target']){
  const f=fixture(t);f.setBeforeBatch(()=>{
   if(scenario==='role')f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run('user',ADMIN);
   if(scenario==='alias-conflict')f.sql.prepare('INSERT INTO user_identity_links VALUES(?,?,?)').run(ADMIN,ALIAS,'active');
   if(scenario==='target')f.sql.prepare('DELETE FROM store_shop_stores WHERE id=?').run(SHOP);
  });
  const result=await f.call(data());assert.equal(result.http,409,scenario);assert.equal(result.code,'STORE_CHANGED');assert.equal(f.audits().length,0);assert.equal(f.pins().length,0);
 }
});

test('failed audit rolls back pin update and the same request can safely retry',async t=>{
 const f=fixture(t),before=f.protectedState();f.setFailAudit(true);
 assert.equal((await f.call(data())).http,503);assert.equal(f.audits().length,0);assert.equal(f.pins().length,0);assert.equal(f.protectedState(),before);
 f.setFailAudit(false);const result=await f.call(data());assert.equal(result.http,200);assert.equal(result.pin_version,1);assert.equal(f.audits().length,1);assert.equal(f.protectedState(),before);
});

test('hard admin can pin via a verified direct legacy link despite another user sharing the wallet',async t=>{
 const f=fixture(t,{hardGroup:[ALIAS,ADMIN]});
 f.sql.prepare('UPDATE users SET legacy_line_id=? WHERE line_id=?').run(ALIAS,ADMIN);
 f.sql.prepare('UPDATE users SET point_line_id=? WHERE line_id=?').run(ADMIN,MEMBER);
 f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(ALIAS,ADMIN);
 assert.equal((await f.call(data(),'member')).http,409);
 assert.equal((await f.call(data(),'alias')).http,200);
 assert.equal(f.audits().length,1);
});

test('hard-admin pin rechecks the full trusted account group and actor immediately before writing',async t=>{
 for(const scenario of ['role','missing-link','extra-link','other-group-row','no-link-other-row','no-link-other-link']){
  const f=fixture(t,{hardGroup:[ALIAS,ADMIN]});
  f.sql.prepare('UPDATE users SET point_line_id=? WHERE line_id=?').run(ADMIN,MEMBER);
  if(!scenario.startsWith('no-link')){
   f.sql.prepare('UPDATE users SET legacy_line_id=? WHERE line_id=?').run(ALIAS,ADMIN);
   f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(ALIAS,ADMIN);
  }
  f.setBeforeBatch(()=>{
   if(scenario==='role')f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN);
   if(scenario==='missing-link')f.sql.prepare("UPDATE user_identity_links SET status='inactive' WHERE old_line_id=?").run(ALIAS);
   if(scenario==='extra-link')f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(ADMIN,MEMBER);
   if(scenario==='other-group-row'||scenario==='no-link-other-row')f.sql.prepare('INSERT INTO users(row_id,line_id,role) VALUES(?,?,?)').run(ALIAS,ALIAS,'user');
   if(scenario==='no-link-other-link')f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(ALIAS,MEMBER);
  });
  const result=await f.call(data(),'admin');
  assert.equal(result.http,409,scenario);assert.equal(f.audits().length,0,scenario);assert.equal(f.pins().length,0,scenario);
 }
});
