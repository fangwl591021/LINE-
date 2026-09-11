import {test} from 'node:test';
test('product QR and redemption reject owners outside admin or store roles before point execution',async()=>{
 const {sql,env}=fixture();
 try{
  const qr=(await issueMemberProductQr({authenticatedUserId:C,productId:P},env,resolve)).data;
  for(const role of ['tenant','租戶','user','staff','manager','',null]){
   sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role,A);
   assert.equal((await getRedemptionProduct({authenticatedUserId:A,productId:P},env)).success,false);
   assert.equal((await issueMemberProductQr({authenticatedUserId:C,productId:P},env,resolve)).success,false);
   assert.equal((await resolveMemberProductQr({authenticatedUserId:A,qrToken:qr.qrToken},env,resolve)).success,false);
   let calls=0;
   assert.equal((await runCashierRequest(payload({productId:P}),env,resolve,async()=>{calls++;return {success:true};})).success,false);
   assert.equal(calls,0,role);
  }
  assert.equal(sql.prepare('SELECT count(*) n FROM store_cashier_requests').get().n,0);
 }finally{sql.close();}
});
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {runCashierRequest,getCashierRequest,getRedemptionProduct,resolveMemberProductQr} from '../worker/store-cashier-requests.mjs';
import {issueMemberProductQr,readMemberProductQr} from '../worker/store-member-product-qr.mjs';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32),P=crypto.randomUUID(),S=crypto.randomUUID();
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT);');
 for(const f of ['0029_store_shop_catalog.sql','0030_store_cashier_requests.sql','0031_store_product_category.sql','0032_store_member_product_qr.sql'])sql.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 sql.prepare('INSERT INTO users VALUES(?,?)').run(A,'store');
 sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,status,updated_at) VALUES(?,?,?,'active','now')").run(S,A,'Shop');
 sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,redeem_type,redeem_value,status,updated_at,request_key) VALUES(?,?,?,880000,'fixed',800,'active','now',?)").run(P,S,'Glasses',crypto.randomUUID());
 const db={prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)||null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}};}};}};}};
 return {sql,env:{ACTMASTER_DB:db}};
}
const payload=(extra={})=>({authenticatedUserId:A,requestId:crypto.randomUUID(),customerUserId:C,mode:'redeem',amount:8800,deductPoints:800,...extra});
const resolve=async()=>({customerPointUserId:C});
test('member QR is opaque, uses authenticated issuer only, rotates and is store scoped',async()=>{
 const {env,sql}=fixture();let identity;
 const issue=()=>issueMemberProductQr({authenticatedUserId:C,productId:P,customerUserId:B,userId:B},env,async raw=>{identity=raw;return resolve();});
 const first=await issue();assert.equal(first.success,true);assert.equal(identity,C);
 assert.match(first.data.qrToken,/^[0-9a-f]{64}$/);assert(!JSON.stringify(first.data).includes(C));
 assert(!JSON.stringify(sql.prepare('SELECT * FROM store_member_product_qr').get()).includes(first.data.qrToken));
 assert.equal((await resolveMemberProductQr({authenticatedUserId:B,qrToken:first.data.qrToken},env,resolve)).success,false);
 const found=await resolveMemberProductQr({authenticatedUserId:A,qrToken:first.data.qrToken},env,resolve);
 assert.equal(found.data.customerUserId,C);assert.equal(found.data.productId,P);
 const second=await issue();assert.notEqual(first.data.qrToken,second.data.qrToken);
 await assert.rejects(readMemberProductQr(first.data.qrToken,env));
 assert.equal((await issueMemberProductQr({productId:P},env,resolve)).success,false);
 sql.prepare('UPDATE store_member_product_qr SET expires_at=0').run();
 assert.equal((await resolveMemberProductQr({authenticatedUserId:A,qrToken:second.data.qrToken},env,resolve)).success,false);
});
test('member QR binds customer and product and can debit only once, same request replays receipt',async()=>{
 const {env}=fixture();const qr=(await issueMemberProductQr({authenticatedUserId:C,productId:P},env,resolve)).data;
 const product=(await getRedemptionProduct({authenticatedUserId:A,productId:P},env)).data;
 const p=payload({...product,qrToken:qr.qrToken});let writes=0;
 const exec=async(...args)=>{const r=await success(...args);writes++;return r;};
 assert.equal((await runCashierRequest({...p,customerUserId:B},env,resolve,exec)).success,false);
 assert.equal((await runCashierRequest({...p,productId:crypto.randomUUID()},env,resolve,exec)).success,false);
 const r=await runCashierRequest(p,env,resolve,exec);assert.equal(r.success,true);assert.equal(writes,1);
 assert.deepEqual(await runCashierRequest(p,env,resolve,exec),r);
 assert.equal((await runCashierRequest({...p,requestId:crypto.randomUUID()},env,resolve,exec)).success,false);assert.equal(writes,1);
});
test('QR expiry at write boundary, changed identity and unknown writes fail closed',async()=>{
 for(const mode of ['expiry','identity','unknown']) {
  const {env,sql}=fixture();const qr=(await issueMemberProductQr({authenticatedUserId:C,productId:P},env,resolve)).data;
  const product=(await getRedemptionProduct({authenticatedUserId:A,productId:P},env)).data;
  const p=payload({...product,qrToken:qr.qrToken});let writes=0;
  const result=await runCashierRequest(p,env,mode==='identity'?async()=>({customerPointUserId:B}):resolve,async(safe,before)=>{
   if(mode==='expiry')sql.prepare('UPDATE store_member_product_qr SET expires_at=0').run();
   await before();writes++;throw Error('timeout');
  });
  assert.equal(result.success,false);assert.equal(writes,mode==='unknown'?1:0);
  if(mode==='unknown'){assert.equal(result.transactionStatus,'unknown');await assert.rejects(readMemberProductQr(qr.qrToken,env));}
 }
});
const success=async(p,before)=>{await before(p.customerUserId);return {success:true,data:{ledgerId:'SPC_'+p.transactionId,changedPoints:p.deductPoints,payableAmount:p.amount-p.deductPoints}};};
test('same request is executed once, changed payload rejected, status only owner',async()=>{
 const {env}=fixture(),p=payload();let calls=0;
 const exec=async(...args)=>{calls++;return success(...args);};
 const r=await runCashierRequest(p,env,resolve,exec);
 assert.equal(r.transactionStatus,'succeeded');
 assert.deepEqual(await runCashierRequest(p,env,resolve,exec),r);assert.equal(calls,1);
 assert.equal((await runCashierRequest({...p,deductPoints:700},env,resolve,exec)).success,false);
 assert.deepEqual(await getCashierRequest(p,env),r);
 assert.equal((await getCashierRequest({...p,authenticatedUserId:B},env)).transactionStatus,'not_found');
});
test('concurrent requests and different operator share a canonical customer lock',async()=>{
 const {env}=fixture(),p=payload();let release,started;const ready=new Promise(r=>started=r),wait=new Promise(r=>release=r);let writes=0;
 const first=runCashierRequest(p,env,resolve,async(x,before)=>{await before();writes++;started();await wait;return {success:true};});
 await ready;
 const same=await runCashierRequest(p,env,resolve,success);
 assert.equal(same.transactionStatus,'unknown');
 const second=await runCashierRequest(payload({authenticatedUserId:B,customerUserId:'alias'}),env,resolve,success);
 assert.match(second.error,/未完成交易/);assert.equal(writes,1);release();await first;
});
test('timeout/ambiguous result never retries or releases customer lock',async()=>{
 const {env}=fixture(),p=payload();let writes=0;
 const r=await runCashierRequest(p,env,resolve,async(x,before)=>{await before();writes++;throw Error('lost response');});
 assert.equal(r.transactionStatus,'unknown');
 await runCashierRequest(p,env,resolve,success);assert.equal(writes,1);
 assert.match((await runCashierRequest(payload(),env,resolve,success)).error,/未完成/);
 assert.equal((await getCashierRequest(p,env)).transactionStatus,'unknown');
});
test('pre-write failure releases lock; invalid/missing IDs never execute',async()=>{
 const {env}=fixture();
 const r=await runCashierRequest(payload(),env,resolve,async()=>({success:false,error:'insufficient'}));
 assert.equal(r.transactionStatus,'failed');assert.equal((await runCashierRequest(payload(),env,resolve,success)).success,true);
 for(const extra of [{requestId:''},{authenticatedUserId:''},{amount:-1},{deductPoints:9000},{deductPoints:1.5},{mode:'evil'}]) {
  const result=await runCashierRequest(payload(extra),env,resolve,()=>{throw Error('must not execute');});assert.equal(result.transactionStatus,'rejected');
 }
});
test('product ownership, active state, snapshot and server limit enforced',async()=>{
 const {env,sql}=fixture();
 const quote=await getRedemptionProduct({authenticatedUserId:A,productId:P},env);assert.equal(quote.data.maxPoints,800);
 assert.equal((await getRedemptionProduct({authenticatedUserId:B,productId:P},env)).success,false);
 const base={productId:P,productVersion:1,shopVersion:1};
 for(const extra of [{deductPoints:801},{amount:1},{productVersion:2},{shopVersion:2},{mode:'reward'}])assert.equal((await runCashierRequest(payload({...base,...extra}),env,resolve,success)).success,false);
 const ok=await runCashierRequest(payload(base),env,resolve,success);assert.equal(ok.success,true);
 const changed=await runCashierRequest(payload(base),env,resolve,async(p,before)=>{sql.prepare('UPDATE store_shop_products SET version=2 WHERE id=?').run(P);await before();throw Error('must not write');});
 assert.equal(changed.transactionStatus,'failed');
 sql.prepare("UPDATE store_shop_products SET status='archived' WHERE id=?").run(P);
 assert.equal((await getRedemptionProduct({authenticatedUserId:A,productId:P},env)).success,false);
});
test('policy math and role revocation do not trust browser',async()=>{
 const {env,sql}=fixture();
 for(const [type,value,expected] of [['percent',10,880],['full',0,8800],['none',0,0]]){
  sql.prepare('UPDATE store_shop_products SET redeem_type=?,redeem_value=?').run(type,value);
  assert.equal((await getRedemptionProduct({authenticatedUserId:A,productId:P},env)).data.maxPoints,expected);
 }
 sql.prepare('UPDATE store_shop_products SET price_cents=880050').run();
 assert.equal((await getRedemptionProduct({authenticatedUserId:A,productId:P},env)).success,false);
 sql.prepare("UPDATE users SET role='user'").run();assert.equal((await getRedemptionProduct({authenticatedUserId:A,productId:P},env)).success,false);
});
test('identity changes at the write boundary fail before outbound call',async()=>{
 const {env}=fixture();const r=await runCashierRequest(payload(),env,resolve,async(p,before)=>{await before(B);throw Error('unreachable');});
 assert.equal(r.transactionStatus,'failed');assert.match(r.error,/身分/);
});
test('database outage fails closed before any external execution',async()=>{
 const {env}=fixture();env.ACTMASTER_DB.prepare=()=>{throw Error('db down');};let calls=0;
 await assert.rejects(runCashierRequest(payload(),env,resolve,async()=>{calls++;}),/db down/);assert.equal(calls,0);
});
test('real shared point insertion requires explicit success for cashier only and never retries',async()=>{
 const source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
 const method=source.slice(source.indexOf('  async insertUserPoint('),source.indexOf('  async enrichPointRowsWithCashierLogs('));
 for(const body of [{},{success:false},{success:true}]){
  let calls=0;const object=vm.runInNewContext('({'+method+'})',{AbortSignal,fetch:async()=>{calls++;return Response.json(body);}});
  const self={...object,pointApiKey:()=> 'test-only',resolvePointUserId:async()=>C,insertApiUrl:'https://example.test/points'};
  const r=await self.insertUserPoint({userId:C,points:-1,skipMotherMemberSetup:true,requireConfirmedResult:true},{});
  assert.equal(r.success,body.success===true);assert.equal(calls,1);
 }
});
