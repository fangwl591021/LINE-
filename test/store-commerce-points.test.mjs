import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {commerceMarker} from '../worker/store-commerce-mother.mjs';
import {handleStoreCommerce} from '../worker/store-commerce.mjs';
import {confirmedCommercePointReceipt} from '../worker/store-commerce-points.mjs';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32),P='U'+'d'.repeat(32);
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON;CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT,name TEXT);');
 for(const [id,role] of [[A,'store'],[B,'user'],[C,'store']])sql.prepare('INSERT INTO users VALUES(?,?,?)').run(id,role,role);
 for(const name of ['0029_store_shop_catalog.sql','0030_store_cashier_requests.sql','0031_store_product_category.sql','0034_store_commerce.sql','0035_store_product_purchase_mode.sql','0037_store_buyer_profiles.sql','0038_store_buyer_delivery.sql','0062_store_commerce_points.sql'])sql.exec('BEGIN;'+readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8')+';COMMIT;');
 sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,status,updated_at) VALUES('shop',?,'測試商店','active','now')").run(A);
 sql.exec("INSERT INTO store_shop_products(id,shop_id,title,price_cents,redeem_type,redeem_value,status,purchase_mode,updated_at,request_key) VALUES('p','shop','測試商品',10000,'full',0,'active','online','now','p');INSERT INTO store_commerce_settings(shop_id,enabled,bank_name,bank_code,bank_account,bank_holder,shipping_fee_cents,free_shipping_cents,updated_at) VALUES('shop',1,'測試','004','123456','測試',6000,0,'now');");
 const state={balance:500,identity:P,reads:0,writes:[],ledger:new Map(),failure:'',failFinalize:false};
 const db={prepare(s){return {bind(...args){return {sync(){if(state.failFinalize&&s.startsWith('UPDATE store_commerce_point_operations SET status=')){state.failFinalize=false;throw Error('simulated finalize failure');}return {meta:{changes:Number(sql.prepare(s).run(...args).changes)}};},async run(){return this.sync();},async first(){return sql.prepare(s).get(...args)||null;},async all(){return {results:sql.prepare(s).all(...args)};}};}};},async batch(items){sql.exec('BEGIN');try{const out=items.map(x=>x.sync());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const env={ACTMASTER_DB:db,STORE_COMMERCE_ENABLED:'true',STORE_COMMERCE_POINTS_ENABLED:'true'};
 const points={contract:{version:'commerce-ledger-v1',rawLedgerVerification:true,atMostOnceCallerRequired:true},async read(uid){assert.equal(uid,B);state.reads++;if(state.readHook)await state.readHook();if(state.failure==='read')throw Error('offline');return {identity:state.identity,balance:state.balance};},async lookup(o){return state.ledger.get(o.id)||null;},async adjust(o){state.writes.push(o);if(state.adjustHook)await state.adjustHook();if(state.failure==='throw')throw Error('lost response');if(state.failure==='false')return {success:false};const before=state.balance;state.balance+=o.points;const receipt={success:true,source:'mother',mother_receipt_id:String(1000+state.writes.length),event_content:commerceMarker(o),operation_id:o.id,order_id:o.order_id,point_identity:o.point_identity,point_type:'gift_money',kind:o.kind,points:o.points,balance_before:before,balance_after:state.balance,...(o.kind==='refund'?{original_operation_id:o.original_operation_id}:{})};state.ledger.set(o.id,receipt);return state.receiptHook?state.receiptHook(receipt):receipt;}};
 async function call(path,data,uid=B){const r=await handleStoreCommerce(new Request('https://test.invalid/v1/store-commerce'+path,{method:data?'POST':'GET',headers:uid?{Authorization:'Bearer '+uid}:{},body:data?JSON.stringify(data):undefined}),env,async()=>Response.json({userId:uid}),points);return {status:r.status,...await r.json()};}
 const cart=(extra={})=>({shop_id:'shop',payment_method:'REMITTANCE',points_used:50,items:[{id:'p',quantity:1}],buyer:{name:'甲',phone:'0912345678',email:''},customer:{name:'甲',phone:'0912345678',carrier:'POST',city:'台北市',district:'中正區',address:'測試路1號'},...extra});
 async function data(extra={}){const input=cart(extra),r=await call('/quote',input);assert.equal(r.status,200,r.error);return {...input,quote_hash:r.quote_hash,request_key:crypto.randomUUID()};}
 async function order(extra={}){const input=await data(extra),r=await call('/orders',input);assert.equal(r.status,200,r.error);return {...r,input};}
 const action=(o,a,extra={},uid=B)=>call('/orders/action',{order_id:o.id,version:o.version,action:a,request_key:crypto.randomUUID(),...extra},uid);
 return {sql,db,state,env,points,call,cart,data,order,action};
}
test('gate, verified own wallet, product policy and shipping cannot be spoofed',async t=>{
 const f=fixture(t);delete f.env.STORE_COMMERCE_POINTS_ENABLED;assert.equal((await f.call('/capabilities',null,null)).points_enabled,false);assert.equal((await f.call('/quote',f.cart())).status,400);assert.equal((await f.call('/wallet')).status,503);
 f.env.STORE_COMMERCE_POINTS_ENABLED='true';assert.equal((await f.call('/wallet')).balance,500);assert.equal((await f.call('/wallet',null,null)).status,401);
 for(const v of [-1,1.5,'50',1000001,101])assert.notEqual((await f.call('/quote',f.cart({points_used:v,customerUserId:P,balance:999999}))).status,200);
 for(const [type,value,expected] of [['none',0,0],['fixed',30,60],['percent',25,50],['full',0,200]]){f.sql.prepare('UPDATE store_shop_products SET redeem_type=?,redeem_value=?,version=version+1').run(type,value);const r=await f.call('/quote',f.cart({points_used:0,items:[{id:'p',quantity:2}]}));assert.equal(r.snapshot.max_points,expected);}
 const q=await f.call('/quote',f.cart({points_used:100}));assert.equal(q.snapshot.total_cents,6000);assert.equal(q.snapshot.shipping_fee_cents,6000);assert.equal(f.state.writes.length,0);assert(!JSON.stringify(q).includes(P));
});
test('confirmation debits once, returns the original order after lost response, and snapshots net cash',async t=>{
 const f=fixture(t),input=await f.data();const responses=await Promise.all([f.call('/orders',input),f.call('/orders',input)]);
 assert.equal(f.state.writes.length,1);assert.equal(f.state.balance,450);assert.equal(responses[0].order.id,responses[1].order.id);
 const again=await f.call('/orders',input);assert.equal(again.order.points_status,'debited');assert.equal(again.order.total_cents,11000);assert.equal(again.order.snapshot.discount_cents,5000);assert.equal(f.state.writes.length,1);
 assert.equal((await f.call('/orders',{...input,points_used:40})).status,409);
 assert.equal((await f.call('/orders/lookup?request_key='+input.request_key)).order.id,again.order.id);
 assert.equal((await f.call('/orders/lookup?request_key='+input.request_key,null,C)).order,null);assert(!JSON.stringify(again).includes(P));
});
test('full points and free shipping are paid without requesting bank remittance',async t=>{
 const f=fixture(t);f.sql.exec('UPDATE store_commerce_settings SET shipping_fee_cents=0');const {order}=await f.order({points_used:100});
 assert.equal(order.total_cents,0);assert.equal(order.payment_status,'paid');assert.equal(order.received_cents,0);assert.equal(order.points_status,'debited');
 assert.equal((await f.action(order,'report_remittance',{last5:'12345'})).status,409);
});
test('unknown external debit is locked, cannot retry, cancel, pay or create another order',async t=>{
 for(const failure of ['throw','false']){const f=fixture(t);f.state.failure=failure;const {order,input}=await f.order();assert.equal(order.points_status,'unknown');
 assert.equal((await f.call('/orders',input)).order.points_status,'unknown');assert.equal(f.state.writes.length,1);
 assert.equal((await f.call('/orders',await f.data())).status,409);
 assert.equal((await f.action(order,'cancel')).status,409);assert.equal((await f.action(order,'report_remittance',{last5:'12345'})).status,409);
 assert.equal(f.sql.prepare('SELECT status FROM store_cashier_requests').get().status,'unknown');}
});
test('external success followed by database failure never reissues a debit',async t=>{
 const f=fixture(t),data=await f.data();f.state.adjustHook=()=>{f.state.failFinalize=true;};assert.equal((await f.call('/orders',data)).status,503);
 assert.equal((await f.call('/orders',data)).order.points_status,'pending');assert.equal(f.state.writes.length,1);
 assert.equal(f.sql.prepare('SELECT status FROM store_commerce_point_operations').get().status,'sending');
});

test('a mismatched final order state retains the shared lock rather than releasing it',async t=>{
 const f=fixture(t),data=await f.data();f.state.adjustHook=()=>{f.sql.exec("UPDATE store_commerce_orders SET points_status='refunding'");};
 assert.equal((await f.call('/orders',data)).status,503);assert.equal((await f.call('/orders',data)).order.points_status,'refunding');
 assert.equal(f.state.writes.length,1);assert.equal(f.sql.prepare('SELECT status FROM store_cashier_requests').get().status,'sending');
 assert.equal((await f.call('/orders',await f.data())).status,409);
});

test('different order keys cannot both debit while the first external write is in progress',async t=>{
 const f=fixture(t),first=await f.data(),second=await f.data();let release,entered;
 const externalStarted=new Promise(resolve=>{entered=resolve;});const resume=new Promise(resolve=>{release=resolve;});
 f.state.adjustHook=async()=>{entered();await resume;};const active=f.call('/orders',first);await externalStarted;
 try{assert.equal((await f.call('/orders',second)).status,409);assert.equal(f.state.writes.length,1);}finally{release();}
 assert.equal((await active).order.points_status,'debited');assert.equal(f.state.balance,450);
});

test('refund confirmed externally but final persistence fails never reissues a refund',async t=>{
 const f=fixture(t),{order}=await f.order();const body={order_id:order.id,version:order.version,action:'cancel',request_key:crypto.randomUUID()};
 f.state.adjustHook=()=>{f.state.failFinalize=true;};assert.equal((await f.call('/orders/action',body)).status,503);
 assert.equal((await f.call('/orders/action',body)).order.points_status,'refunding');assert.deepEqual(f.state.writes.map(o=>o.points),[-50,50]);
 assert.equal(f.sql.prepare("SELECT status FROM store_commerce_point_operations WHERE kind='refund'").get().status,'sending');
 assert.equal((await f.action((await f.call('/orders')).orders[0],'report_remittance',{last5:'12345'})).status,409);
});
test('recheck after lock rejects insufficient balance or changed identity before any write',async t=>{
 for(const kind of ['balance','identity','role','read']){const f=fixture(t),data=await f.data();let reads=0;f.state.readHook=()=>{if(++reads===2){if(kind==='balance')f.state.balance=1;if(kind==='identity')f.state.identity=C;if(kind==='role')f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(A);if(kind==='read')f.state.failure='read';}};
 const r=await f.call('/orders',data);assert.equal(r.order.points_status,'failed',kind);assert.equal(r.order.payment_status,'cancelled');assert.equal(f.state.writes.length,0);assert.equal(f.sql.prepare('SELECT status FROM store_cashier_requests').get().status,'failed');}
});
test('shared cashier lock rejects online checkout atomically without changing cashier behavior',async t=>{
 const f=fixture(t),data=await f.data();f.sql.prepare("INSERT INTO store_cashier_requests(actor_id,request_id,customer_id,fingerprint,status) VALUES(?,?,?,'{}','pending')").run(A,crypto.randomUUID(),P);
 assert.equal((await f.call('/orders',data)).status,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM store_commerce_orders').get().n,0);assert.equal(f.state.writes.length,0);
 f.sql.exec("UPDATE store_cashier_requests SET status='succeeded'");assert.equal((await f.call('/orders',data)).status,200);
});
test('unreported cancellation refunds exactly original points once, including concurrent cancellation',async t=>{
 const f=fixture(t),{order}=await f.order();const body={order_id:order.id,version:order.version,action:'cancel',request_key:crypto.randomUUID()};
 const results=await Promise.all([f.call('/orders/action',body),f.call('/orders/action',body)]);assert(results.every(r=>r.status===200));
 assert.equal((await f.call('/orders/action',body)).order.points_status,'refunded');assert.equal(f.state.writes.length,2);assert.deepEqual(f.state.writes.map(o=>o.points),[-50,50]);assert.equal(f.state.balance,500);
 assert.equal((await f.call('/orders')).orders[0].payment_status,'cancelled');assert.equal((await f.call('/orders/action',{...body,request_key:crypto.randomUUID()})).status,409);
});
test('refund failure stays locked and cannot be mistaken for cancelled or retried',async t=>{
 const f=fixture(t),{order}=await f.order();f.state.failure='throw';const r=await f.action(order,'cancel');assert.equal(r.order.points_status,'refund_unknown');assert.equal(r.order.payment_status,'pending');
 assert.equal((await f.action(r.order,'cancel')).status,409);assert.equal((await f.call('/orders',await f.data())).status,409);assert.equal(f.state.writes.length,2);
});
test('merchant-only full refund requires paid, unshipped order and explicit cash confirmation',async t=>{
 const f=fixture(t);let {order}=await f.order();order=(await f.action(order,'report_remittance',{last5:'12345'})).order;assert.equal((await f.action(order,'cancel')).status,409);
 order=(await f.action(order,'verify_remittance',{received_cents:order.total_cents,confirmed:true},A)).order;
 const extra={confirmed:true,returned_cash_cents:order.received_cents};assert.equal((await f.action(order,'refund',extra,C)).status,404);assert.equal((await f.action(order,'refund',extra)).status,403);
 assert.equal((await f.action(order,'refund',{...extra,confirmed:false},A)).status,400);assert.equal((await f.action(order,'refund',{...extra,returned_cash_cents:1},A)).status,409);
 const refund=await f.action(order,'refund',extra,A);assert.equal(refund.order.points_status,'refunded');assert.equal(refund.order.payment_status,'cancelled');assert.equal(f.state.balance,500);
});
test('new point gate closes new debits but does not strand an existing pending refund',async t=>{
 const f=fixture(t),{order}=await f.order();delete f.env.STORE_COMMERCE_POINTS_ENABLED;assert.equal((await f.call('/quote',f.cart())).status,400);assert.equal((await f.action(order,'cancel')).order.points_status,'refunded');
});
test('an enabled dashboard flag alone cannot advertise, query or debit an unverified mother service',async t=>{
 for(const contract of [null,{}, {version:'commerce-ledger-v1',rawLedgerVerification:true}, {version:'wrong',rawLedgerVerification:true,atMostOnceCallerRequired:true}, {version:'commerce-ledger-v1',rawLedgerVerification:'true',atMostOnceCallerRequired:true}]){
  const f=fixture(t);f.points.contract=contract;
  assert.equal((await f.call('/capabilities',null,null)).points_enabled,false);
  assert.equal((await f.call('/wallet')).status,503);
  assert.equal((await f.call('/quote',f.cart())).status,400);
  const plain=await f.order({points_used:0});assert.equal(plain.order.points_status,'none');
  assert.equal(f.state.reads,0);assert.equal(f.state.writes.length,0);
 }
});

test('receipt validation refuses mismatched transactions, identities, types, directions and unsafe balances',()=>{
 const op={id:'operation',order_id:'order',point_identity:P,kind:'debit',points:-50};
 const receipt={success:true,source:'mother',mother_receipt_id:'1',event_content:commerceMarker(op),operation_id:op.id,order_id:op.order_id,point_identity:P,point_type:'gift_money',kind:'debit',points:-50,balance_before:100,balance_after:50};
 assert.equal(confirmedCommercePointReceipt(receipt,op),true);
 for(const bad of [{success:true},{operation_id:'other'},{order_id:'other'},{point_identity:C},{point_type:'system_point'},{kind:'refund'},{points:50},{balance_before:'100'},{balance_after:51},{balance_before:49,balance_after:-1},{balance_before:Number.MAX_SAFE_INTEGER+1,balance_after:50},{balance_after:null}]){
  const value=Object.keys(bad).length===1&&bad.success===true?bad:{...receipt,...bad};
  assert.equal(confirmedCommercePointReceipt(value,op),false,JSON.stringify(bad));
 }
 const refund={...op,kind:'refund',points:50,original_operation_id:'debit-1'};
 const refunded={...receipt,kind:'refund',event_content:commerceMarker(refund),points:50,balance_before:50,balance_after:100,original_operation_id:'debit-1'};
 assert.equal(confirmedCommercePointReceipt(refunded,refund),true);
 assert.equal(confirmedCommercePointReceipt({...refunded,original_operation_id:'other'},refund),false);
 assert.equal(confirmedCommercePointReceipt(refunded,{...refund,original_operation_id:undefined}),false);
});

test('bare success or a wrong receipt leaves debit unknown and never reissues it',async t=>{
 for(const change of [()=>({success:true}),r=>({...r,operation_id:'other'}),r=>({...r,point_identity:C}),r=>({...r,points:999}),r=>({...r,balance_after:r.balance_after+1})]){
  const f=fixture(t);f.state.receiptHook=change;const {order,input}=await f.order();
  assert.equal(order.points_status,'unknown');assert.equal(order.payment_status,'pending');
  assert.equal((await f.call('/orders',input)).order.points_status,'unknown');assert.equal(f.state.writes.length,1);
  assert.equal(f.sql.prepare('SELECT status FROM store_cashier_requests').get().status,'unknown');
  assert.equal((await f.action(order,'cancel')).status,409);
 }
});

test('refund must link the confirmed debit; unrelated mother success stays locked',async t=>{
 const f=fixture(t),{order}=await f.order();f.state.receiptHook=r=>({...r,original_operation_id:'unrelated'});
 const result=await f.action(order,'cancel');assert.equal(result.order.points_status,'refund_unknown');
 const [debit,refund]=f.state.writes;assert.equal(refund.original_operation_id,debit.id);
 assert.equal((await f.action(result.order,'cancel')).status,409);assert.equal(f.state.writes.length,2);
 assert.equal(f.sql.prepare("SELECT status FROM store_cashier_requests WHERE request_id=?").get(refund.id).status,'unknown');
});

test('refund with an unavailable safety contract rejects before creating an operation and never uses the legacy writer',async t=>{
 const f=fixture(t),{order}=await f.order();f.points.contract=null;
 assert.equal((await f.action(order,'cancel')).status,503);
 assert.equal((await f.call('/orders')).orders[0].points_status,'debited');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM store_commerce_point_operations').get().n,1);
 assert.equal(f.state.writes.length,1);
});

test('ledger uses the verified mother receipt balance rather than its earlier read estimate',async t=>{
 const f=fixture(t);f.state.adjustHook=()=>{f.state.balance+=25;};const {order}=await f.order();
 assert.equal(order.points_status,'debited');
 const op=f.sql.prepare('SELECT * FROM store_commerce_point_operations').get();
 assert.equal(op.balance_before,525);assert.equal(op.balance_after_estimate,475);
});
test('migration preserves old snapshots, foreign-key events, pagination indexes and checks',()=>{
 const sql=new DatabaseSync(':memory:');try{sql.exec('PRAGMA foreign_keys=ON;');for(const n of ['0029_store_shop_catalog.sql','0034_store_commerce.sql'])sql.exec(readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8'));
 sql.exec("INSERT INTO store_shop_stores(id,owner_uid,name,updated_at) VALUES('s','owner','店','now');INSERT INTO store_commerce_orders(id,shop_id,buyer_uid,request_key,request_hash,snapshot_json,total_cents,created_at,updated_at) VALUES('old','s','buyer','key','hash','{}',100,'now','now');INSERT INTO store_commerce_events VALUES('e','old','buyer','event-key','hash','cancel',2,'now');");
 const before={...sql.prepare('SELECT * FROM store_commerce_orders').get()};sql.exec('BEGIN;'+readFileSync(new URL('../migrations/0062_store_commerce_points.sql',import.meta.url),'utf8')+';COMMIT;');const {points_status,...after}=sql.prepare('SELECT * FROM store_commerce_orders').get();assert.deepEqual(after,before);assert.equal(points_status,'none');assert.equal(sql.prepare('SELECT count(*) n FROM store_commerce_events').get().n,1);assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(sql.prepare("SELECT count(*) n FROM sqlite_master WHERE type='index' AND name LIKE 'store_commerce_orders_%'").get().n,2);assert.throws(()=>sql.exec("UPDATE store_commerce_orders SET total_cents=-1"));}finally{sql.close();}
});

test('a lost debit finalization recovers only by exact read-only receipt, even with checkout paused',async t=>{
 const f=fixture(t),data=await f.data();f.state.adjustHook=()=>{f.state.failFinalize=true;};assert.equal((await f.call('/orders',data)).status,503);
 delete f.env.STORE_COMMERCE_ENABLED;delete f.env.STORE_COMMERCE_POINTS_ENABLED;
 const r=await f.call('/orders/lookup?request_key='+data.request_key);assert.equal(r.order.points_status,'debited');
 assert.equal(f.state.writes.length,1);assert.equal(f.sql.prepare('SELECT status FROM store_cashier_requests').get().status,'succeeded');
 assert.equal(f.sql.prepare('SELECT mother_receipt_id FROM store_commerce_point_operations').get().mother_receipt_id,'1001');
 const again=await f.call('/orders/reconcile',{order_id:r.order.id});assert.equal(again.order.points_status,'debited');assert.equal(f.state.writes.length,1);
});
test('lost refund finalization recovers without a second return or permission to ship',async t=>{
 const f=fixture(t),{order}=await f.order();f.state.adjustHook=()=>{f.state.failFinalize=true;};assert.equal((await f.action(order,'cancel')).status,503);
 const r=await f.call('/orders/reconcile',{order_id:order.id});assert.equal(r.order.points_status,'refunded');assert.equal(r.order.payment_status,'cancelled');
 assert.deepEqual(f.state.writes.map(o=>o.points),[-50,50]);assert.equal(f.state.balance,500);
 assert.equal((await f.action(r.order,'ship',{tracking_number:'TEST'},A)).status,409);
});
test('missing or mismatched reconciliation cannot unlock or cause another mother write',async t=>{
 for(const kind of ['missing','wrong','read']){
  const f=fixture(t);f.state.failure='throw';const {order}=await f.order();
  f.points.lookup=async()=>{if(kind==='read')throw Error('offline');return kind==='wrong'?{success:true,points:-50,mother_receipt_id:'1'}:null;};
  for(let i=0;i<2;i++)assert.equal((await f.call('/orders/reconcile',{order_id:order.id})).order.points_status,'unknown');
  assert.equal(f.state.writes.length,1);assert.equal(f.sql.prepare('SELECT status FROM store_cashier_requests').get().status,'unknown');
 }
});
test('reconciliation is buyer or current shop owner only, never client identity fallback',async t=>{
 const f=fixture(t);f.state.failure='throw';const {order}=await f.order();let reads=0;f.points.lookup=async()=>{reads++;return null;};
 assert.equal((await f.call('/orders/reconcile',{order_id:order.id},null)).status,401);
 assert.equal((await f.call('/orders/reconcile',{order_id:order.id,buyer_uid:B,point_identity:P},C)).status,404);
 assert.equal((await f.call('/orders/reconcile',{order_id:order.id,scope:'merchant'},B)).status,403);
 assert.equal(reads,0);assert.equal((await f.call('/orders/reconcile',{order_id:order.id,scope:'merchant'},A)).status,200);assert.equal(reads,1);
});
test('refund cannot use a changed identity or an unverified original debit',async t=>{
 const f=fixture(t),{order}=await f.order();f.state.ledger.clear();
 const r=await f.action(order,'cancel');assert.equal(r.order.points_status,'refund_unknown');assert.equal(f.state.writes.length,1);
 assert.equal((await f.action(r.order,'cancel')).status,409);assert.equal(f.state.balance,450);
});
test('an absent shared lock prevents the sending claim and external deduction',async t=>{
 const f=fixture(t),data=await f.data();let reads=0;f.state.readHook=()=>{if(++reads===2)f.sql.exec('DELETE FROM store_cashier_requests');};
 const r=await f.call('/orders',data);assert.equal(r.order.points_status,'pending');assert.equal(f.state.writes.length,0);
 assert.equal((await f.call('/orders/reconcile',{order_id:r.order.id})).order.points_status,'pending');assert.equal(f.state.writes.length,0);
});
