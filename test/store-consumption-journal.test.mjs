import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreConsumptionJournal} from '../worker/store-consumption-journal.mjs';

const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),P='U'+'c'.repeat(32),OLD='U'+'d'.repeat(32);
const BASE='https://journal.test/v1/store-consumption-journal';
function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,point_line_id TEXT DEFAULT '',legacy_line_id TEXT DEFAULT '');
    CREATE TABLE user_identity_links(id TEXT PRIMARY KEY,old_line_id TEXT,new_line_id TEXT,status TEXT);
    CREATE TABLE store_point_cashier_logs(log_id TEXT PRIMARY KEY,actor_user_id TEXT,customer_user_id TEXT,customer_point_user_id TEXT,
      mode TEXT,amount REAL,points REAL,payable_amount REAL,point_response_json TEXT DEFAULT '{}',created_at TEXT);
    INSERT INTO users(row_id,line_id,point_line_id,legacy_line_id) VALUES('row-a','${A}','${P}','${OLD}'),('row-b','${B}','','');`);
  for(const name of ['0029_store_shop_catalog.sql','0030_store_cashier_requests.sql','0034_store_commerce.sql','0039_store_consumption_journal.sql']){
    sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  }
  sql.prepare('INSERT INTO store_shop_stores(id,owner_uid,name,updated_at) VALUES(?,?,?,?)').run('shop-a',A,'甲店','2026-09-18T00:00:00Z');
  sql.prepare('INSERT INTO store_shop_stores(id,owner_uid,name,updated_at) VALUES(?,?,?,?)').run('shop-b',B,'乙店','2026-09-18T00:00:00Z');
  const writes=[],errors=[],requests=[];let now='2026-09-18T12:00:00.000Z',beforeReadWrite=null,failReadWrite=false;
  function prepare(query,args=[]){
    const run=(mode)=>{
      try{
        if(mode==='run'){
          assert.match(query,/(?:INSERT INTO store_consumption_journal_(?:snapshots|viewers|reads)|^DELETE FROM store_consumption_journal_snapshots)\b/,'only isolated journal metadata may change');
          if(query.includes('INSERT INTO store_consumption_journal_reads')&&beforeReadWrite){const hook=beforeReadWrite;beforeReadWrite=null;hook();}
          if(query.includes('INSERT INTO store_consumption_journal_reads')&&failReadWrite){failReadWrite=false;return {success:false,meta:{changes:0}};}
          writes.push(query);const result=sql.prepare(query).run(...args);return {success:true,meta:{changes:Number(result.changes)}};
        }
        const prepared=sql.prepare(query);
        return mode==='first'?(prepared.get(...args)||null):{success:true,results:prepared.all(...args)};
      }catch(error){errors.push(error.message);throw error;}
    };
    return {bind(...values){return prepare(query,values);},first:async()=>run('first'),all:async()=>run('all'),run:async()=>run('run')};
  }
  const db={prepare,async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}},withSession(){return this;}};
  const env={ACTMASTER_DB:db,ACTMASTER_KV:{get(){throw Error('No KV access');},put(){throw Error('No KV write');}}};
  const fetcher=async(url,options)=>{requests.push(url);assert.equal(url,'https://api.line.me/v2/profile');const token=options.headers.Authorization.slice(7);return new Response(JSON.stringify({userId:({a:A,b:B,old:OLD})[token]||''}),{status:['a','b','old'].includes(token)?200:401,headers:{'Content-Type':'application/json'}});};
  function cash(id,{actor=B,customer=P,raw=A,amount=100,points=-10,payable=90,mode='redeem',at='2026-09-18 10:00:00',response={}}={}){
    const logId='SPC_'+actor+'_'+id;
    sql.prepare('INSERT INTO store_point_cashier_logs(log_id,actor_user_id,customer_user_id,customer_point_user_id,mode,amount,points,payable_amount,point_response_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(logId,actor,raw,customer,mode,amount,points,payable,typeof response==='string'?response:JSON.stringify(response),at);
    return 'store:'+logId;
  }
  function journal(id,{actor=B,customer=P,status='succeeded',fingerprint={amount:100,deductPoints:10,mode:'redeem'}}={}){
    sql.prepare('INSERT INTO store_cashier_requests(actor_id,request_id,customer_id,fingerprint,status) VALUES(?,?,?,?,?)').run(actor,id,customer,typeof fingerprint==='string'?fingerprint:JSON.stringify(fingerprint),status);
  }
  function order(id,{buyer=A,at='2026-09-18T11:00:00.000Z',status='pending',version=1}={}){
    const snapshot={shop_name:'訂單快照店名',items:[{title:'商品快照',quantity:2,price_cents:12500,line_total_cents:25000}],shipping_fee_cents:500,total_cents:25500,
      bank:{account:'PRIVATE_BANK'},customer:{phone:'PRIVATE_PHONE',address:'PRIVATE_ADDRESS'},buyer:{name:'PRIVATE_BUYER'}};
    sql.prepare('INSERT INTO store_commerce_orders(id,shop_id,buyer_uid,request_key,request_hash,snapshot_json,total_cents,payment_status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,'shop-b',buyer,'request-'+id,'hash',JSON.stringify(snapshot),25500,status,version,at,at);
    return 'online:'+id;
  }
  function updateOrder(id,version,status='paid',at=now){
    sql.prepare('UPDATE store_commerce_orders SET version=?,payment_status=?,updated_at=? WHERE id=?').run(version,status,at,id);
    sql.prepare('INSERT INTO store_commerce_events(id,order_id,actor_uid,request_key,request_hash,action,order_version,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id+'-v'+version,id,B,id+'-v'+version,'hash','verify_remittance',version,at);
  }
  async function api(path='',{token='a',data,method=data?'POST':'GET'}={}){
    const headers=token?{Authorization:'Bearer '+token}:{};
    const response=await handleStoreConsumptionJournal(new Request(BASE+path,{method,headers,body:data?JSON.stringify(data):undefined}),env,fetcher,()=>new Date(now));
    return {status:response.status,...await response.json()};
  }
  const original=()=>JSON.stringify(['users','user_identity_links','store_point_cashier_logs','store_cashier_requests','store_commerce_orders','store_commerce_events'].map(table=>sql.prepare('SELECT * FROM '+table).all()));
  return {sql,env,fetcher,writes,errors,requests,cash,journal,order,updateOrder,api,original,setNow:value=>now=value,beforeReadWrite:hook=>beforeReadWrite=hook,failReadWrite:()=>failReadWrite=true};
}

test('merge one entry per source ID, exclude pure gifts and preserve accurate cents/status',async t=>{
  const f=fixture(t);f.cash('one');f.journal('one');f.cash('two');f.journal('two');
  f.cash('gift',{amount:0,points:50,payable:0,mode:'reward',response:{rewardPoints:50}});
  f.cash('flagged',{amount:50,points:50,payable:50,mode:'reward',response:{rewardPoints:50}});
  f.cash('consume-reward',{amount:500,points:5,payable:500,mode:'reward'});
  f.order('pending');f.order('cancelled',{status:'cancelled'});f.order('paid',{status:'paid'});
  const before=f.original(),result=await f.api();
  assert.equal(result.success,true,JSON.stringify(f.errors));assert.equal(result.items.length,6);
  const row=result.items.find(item=>item.source==='store'&&item.amountCents===10000);
  assert.equal(row.discountPoints,10);assert.equal(row.payableCents,9000);assert.equal(row.paymentStatus,'unconfirmed');
  assert.deepEqual(result.items.filter(item=>item.source==='online').map(item=>item.paymentStatus).sort(),['cancelled','paid','pending']);
  assert.equal(result.unreadCount,0);assert.ok(result.items.every(item=>!item.unread));
  assert.equal(f.original(),before);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|point_response_json|fingerprint|buyer_uid/);
});
test('authoritative receipt survives uncertain request-save; failed request alone is not consumption',async t=>{
  for(const status of ['unknown','sending','failed']){
    const f=fixture(t);f.cash(status);f.journal(status,{status});
    const result=await f.api();assert.equal(result.success,true,JSON.stringify(f.errors));assert.equal(result.items.length,1);
  }
  const f=fixture(t);
  f.journal('no-log',{status:'unknown'});f.cash('malformed',{response:'{bad'});f.journal('malformed',{fingerprint:'{bad'});
  const result=await f.api();assert.equal(result.success,true,JSON.stringify(f.errors));assert.equal(result.items.length,1);
});
test('same request UUID at different actors and same amounts/times are distinct',async t=>{
  const f=fixture(t);f.cash('shared',{actor:A});f.cash('shared',{actor:B});f.journal('shared',{actor:A});f.journal('shared',{actor:B});
  assert.equal((await f.api()).items.length,2);
});
test('verified consumer scope rejects spoofed IDs, no token and identity ambiguity',async t=>{
  const f=fixture(t);f.cash('mine');f.cash('foreign',{customer:B,raw:A});f.order('mine');f.order('foreign',{buyer:B});
  const result=await f.api('?userId='+B+'&role=admin');assert.equal(result.items.length,2);
  assert.equal((await f.api('',{token:''})).status,401);assert.equal((await f.api('',{token:'invalid'})).status,401);
  f.sql.prepare('UPDATE users SET point_line_id=? WHERE line_id=?').run(P,B);
  assert.equal((await f.api()).status,409);
});
test('cashier trusted aliases do not broaden online buyer scope',async t=>{
  const f=fixture(t);f.cash('point');f.cash('old',{customer:OLD});f.order('current');f.order('old',{buyer:OLD});
  const result=await f.api();assert.equal(result.items.length,3);assert.ok(!result.items.some(item=>item.id==='online:old'));
});
test('Taipei date boundaries normalize SQLite UTC and ISO once',async t=>{
  const f=fixture(t);f.cash('before',{at:'2026-09-17 15:59:59'});f.cash('start',{at:'2026-09-17 16:00:00'});
  f.cash('reported',{at:'2026-09-18 13:57:00'});f.order('end',{at:'2026-09-18T16:00:00.000Z'});
  const result=await f.api('?start=2026-09-18&end=2026-09-18');assert.equal(result.items.length,2);
  assert.equal(result.items[0].occurredAt,'2026-09-18T13:57:00.000Z');assert.equal(result.timeZone,'Asia/Taipei');
  assert.equal((await f.api('?start=2026-02-30')).status,400);assert.equal((await f.api('?start=2026-09-20&end=2026-09-01')).status,400);
});
test('stable union keyset pagination excludes transactions inserted after snapshot',async t=>{
  const f=fixture(t);for(let i=0;i<35;i++)i%2?f.order('o-'+i):f.cash('c-'+i);
  const one=await f.api();assert.equal(one.items.length,20);assert.ok(one.nextCursor);
  f.cash('late',{at:'2026-09-18 09:00:00'});
  const two=await f.api('?snapshot='+one.snapshot+'&cursor='+encodeURIComponent(one.nextCursor));
  assert.equal(two.items.length,15);assert.equal(new Set([...one.items,...two.items].map(item=>item.id)).size,35);assert.equal(two.nextCursor,null);
  assert.equal((await f.api('?cursor='+encodeURIComponent(one.nextCursor))).status,400);
});
test('baseline old history is read; explicit one/all do not mark later inserts or order updates',async t=>{
  const f=fixture(t);const old=f.order('old');f.cash('old');await f.api();
  f.cash('new');f.order('new');f.updateOrder('old',2);
  const list=await f.api();assert.equal(list.unreadCount,3);
  const before=f.original();
  const detail=await f.api('/detail?id='+encodeURIComponent(old)+'&snapshot='+list.snapshot);
  assert.equal(detail.item.unread,true);assert.equal((await f.api()).unreadCount,3,'detail GET does not mark read');
  assert.equal((await f.api('/read',{data:{id:old,snapshot:list.snapshot}})).unreadCount,2);
  assert.equal((await f.api('/read',{data:{id:old,snapshot:list.snapshot}})).success,true,'read is idempotent');
  assert.equal(f.original(),before);
  f.cash('after-list');f.updateOrder('old',3,'paid');
  await f.api('/read-all',{data:{snapshot:list.snapshot}});
  const after=await f.api();assert.equal(after.unreadCount,2,'late receipt and later order version stay unread');
  assert.ok(after.items.find(item=>item.id===old).unread);
});
test('filtered read-all marks only bounded matching type/date and resists foreign snapshot',async t=>{
  const f=fixture(t);await f.api();f.cash('store');f.order('order');
  const list=await f.api('?type=store&start=2026-09-18&end=2026-09-18');
  assert.equal(list.unreadCount,1);const before=f.original();
  assert.equal((await f.api('/read-all',{token:'b',data:{snapshot:list.snapshot}})).status,409);
  await f.api('/read-all',{data:{snapshot:list.snapshot}});assert.equal((await f.api()).unreadCount,1);
  assert.equal(f.original(),before);
  assert.equal((await f.api('?snapshot='+list.snapshot+'&type=online')).status,409);
});
test('detail allows product snapshot only, never bank/recipient/raw payloads; foreign ID is denied',async t=>{
  const f=fixture(t);f.order('mine');f.order('foreign',{buyer:B});const list=await f.api();
  const detail=await f.api('/detail?id=online:mine&snapshot='+list.snapshot);
  assert.equal(detail.item.items[0].title,'商品快照');assert.equal(detail.item.items[0].lineTotalCents,25000);
  assert.equal(detail.item.shippingFeeCents,500);assert.doesNotMatch(JSON.stringify(detail),/PRIVATE_|bank|customer|buyer_uid|snapshot_json/);
  assert.equal((await f.api('/detail?id=online:foreign&snapshot='+list.snapshot)).status,404);
  assert.equal((await f.api('/read',{data:{id:'online:foreign',snapshot:list.snapshot}})).status,404);
});

test('mark-one detects an order update between read and metadata write instead of pretending success',async t=>{
  const f=fixture(t);await f.api();f.order('racing');const list=await f.api();
  f.beforeReadWrite(()=>f.updateOrder('racing',2));
  const result=await f.api('/read',{data:{id:'online:racing',snapshot:list.snapshot}});
  assert.equal(result.status,409);assert.equal(result.code,'ENTRY_UPDATED');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS total FROM store_consumption_journal_reads').get().total,0);
  assert.equal((await f.api()).unreadCount,1);
});

test('unread-only snapshot permits idempotent single read without losing scope',async t=>{
  const f=fixture(t);await f.api();const id=f.cash('new');const list=await f.api('?unread=1');
  assert.equal(list.items.length,1);
  assert.equal((await f.api('/read',{data:{id,snapshot:list.snapshot}})).unreadCount,0);
  assert.equal((await f.api('/read',{data:{id,snapshot:list.snapshot}})).success,true);
});

test('malformed ancillary requests do not suppress a confirmed ledger receipt',async t=>{
  const f=fixture(t);f.cash('one');f.journal('one',{customer:B});
  assert.equal((await f.api()).items.length,1);
});

test('missing or invalid snapshot detail numbers remain unknown, not zero',async t=>{
  const f=fixture(t);f.order('invalid');
  f.sql.prepare('UPDATE store_commerce_orders SET snapshot_json=? WHERE id=?').run(JSON.stringify({items:[{title:'缺資料',quantity:null,price_cents:'bad'},null]}),'invalid');
  const list=await f.api(),detail=await f.api('/detail?id=online:invalid&snapshot='+list.snapshot);
  assert.equal(detail.item.items[0].quantity,null);assert.equal(detail.item.items[0].priceCents,null);
  assert.equal(detail.item.items[0].lineTotalCents,null);assert.equal(detail.item.shippingFeeCents,null);
  f.order('null');f.sql.prepare('UPDATE store_commerce_orders SET snapshot_json=? WHERE id=?').run('null','null');
  const next=await f.api(),unknown=await f.api('/detail?id=online:null&snapshot='+next.snapshot);
  assert.equal(unknown.success,true);assert.deepEqual(unknown.item.items,[]);assert.equal(unknown.item.shippingFeeCents,null);
});

test('nonthrowing read-all metadata failure is not reported as saved',async t=>{
  const f=fixture(t);await f.api();f.cash('new');const list=await f.api();f.failReadWrite();
  const result=await f.api('/read-all',{data:{snapshot:list.snapshot}});
  assert.equal(result.status,503);assert.equal(result.success,false);assert.equal((await f.api()).unreadCount,1);
});
test('expired snapshot and missing schema return explicit failures without runtime DDL',async t=>{
  const f=fixture(t);const list=await f.api();f.setNow('2026-09-18T12:16:00.000Z');
  assert.equal((await f.api('?snapshot='+list.snapshot)).status,409);
  f.sql.exec('DROP TABLE store_consumption_journal_reads');const result=await f.api();assert.equal(result.status,503);assert.equal(result.code,'JOURNAL_UNAVAILABLE');
  assert.ok(f.writes.every(query=>!/\b(?:CREATE|ALTER)\b|\b(?:DELETE FROM|UPDATE) (?:users|store_commerce|store_point)/i.test(query)));
});

test('snapshot housekeeping removes at most 100 expired own snapshots, never active/other viewer/read state',async t=>{
  const f=fixture(t);const initial=await f.api();f.cash('new');const list=await f.api();
  await f.api('/read',{data:{id:list.items[0].id,snapshot:list.snapshot}});
  f.setNow('2026-09-18T12:16:00.000Z');
  // Fixture writes create expired metadata without doing any transaction mutation.
  const seed=f.sql.prepare('SELECT * FROM store_consumption_journal_snapshots WHERE id=?').get(initial.snapshot);
  const insert=f.sql.prepare('INSERT INTO store_consumption_journal_snapshots VALUES(?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<120;i++)insert.run('expired-own-'+i,A,seed.identity_key,0,0,0,seed.filter_json,seed.created_at,seed.expires_at);
  insert.run('expired-other',B,'other',0,0,0,seed.filter_json,seed.created_at,seed.expires_at);
  insert.run('active-own',A,seed.identity_key,0,0,0,seed.filter_json,seed.created_at,'2026-09-18T13:00:00.000Z');
  const stateBefore=JSON.stringify(f.sql.prepare('SELECT * FROM store_consumption_journal_reads').all());
  const baselineBefore=JSON.stringify(f.sql.prepare('SELECT * FROM store_consumption_journal_viewers').all());
  const before=f.original();assert.equal((await f.api()).success,true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM store_consumption_journal_snapshots WHERE viewer_uid=? AND expires_at<=?').get(A,'2026-09-18T12:16:00.000Z').n,22);
  assert.ok(f.sql.prepare('SELECT id FROM store_consumption_journal_snapshots WHERE id=?').get('expired-other'));
  assert.ok(f.sql.prepare('SELECT id FROM store_consumption_journal_snapshots WHERE id=?').get('active-own'));
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM store_consumption_journal_reads').all()),stateBefore);
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM store_consumption_journal_viewers').all()),baselineBefore);
  assert.equal(f.original(),before);
});
test('archived store/current product changes do not hide or reprice historical receipts',async t=>{
  const f=fixture(t);f.cash('one');f.sql.prepare("UPDATE store_shop_stores SET status='draft',name='改名' WHERE owner_uid=?").run(B);
  const result=await f.api();assert.equal(result.items[0].amountCents,10000);assert.equal(result.items[0].shopName,'改名');
});
test('CORS preflight and non-journal routes do not touch data or auth',async t=>{
  const f=fixture(t);assert.equal(await handleStoreConsumptionJournal(new Request('https://journal.test/other'),f.env,f.fetcher),null);
  const result=await handleStoreConsumptionJournal(new Request(BASE,{method:'OPTIONS'}),f.env,f.fetcher);
  assert.equal(result.status,204);assert.equal(result.headers.get('Access-Control-Allow-Origin'),'*');
  assert.equal(await result.text(),'');assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);
});
