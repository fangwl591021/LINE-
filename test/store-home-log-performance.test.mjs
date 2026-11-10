// Actual read handler over disposable SQLite; no live accounts or external I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {RETAIL_ROLES} from '../js/modules/store-cooperation-plans.mjs';
import {isRewardOnlyRole} from '../worker/reward-only-cashier.mjs';

const source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
const object=name=>{const found=source.match(new RegExp(`^const ${name} = \\{[\\s\\S]*?^\\};`,'m'));assert.ok(found,name);return found[0];};
const section=(start,end)=>{const first=source.indexOf(start),last=source.indexOf(end,first);assert.ok(first>=0&&last>first,start);return source.slice(first,last);};
const uid=n=>'U'+String(n).padStart(32,'0');
const STORE=uid(900),OTHER_STORE=uid(901);
const plain=value=>JSON.parse(JSON.stringify(value));
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const until=async(predicate)=>{for(let i=0;i<50&&!predicate();i++)await settle();assert.ok(predicate(),'asynchronous read must reach the expected stage');};

function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT,line_id TEXT PRIMARY KEY,name TEXT DEFAULT '',phone TEXT DEFAULT '',role TEXT DEFAULT 'user',point_line_id TEXT DEFAULT '',legacy_line_id TEXT DEFAULT '');
    CREATE TABLE user_identity_links(id INTEGER PRIMARY KEY,old_line_id TEXT,new_line_id TEXT,status TEXT,updated_at TEXT);
    CREATE TABLE card_contacts(row_id TEXT,line_id TEXT,creator_id TEXT,name TEXT,mobile TEXT,image_url TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE store_point_cashier_logs(log_id TEXT PRIMARY KEY,actor_user_id TEXT,customer_user_id TEXT,customer_point_user_id TEXT,mode TEXT,amount REAL,points REAL,payable_amount REAL,balance_before REAL,balance_after_estimate REAL,point_type TEXT,point_response_json TEXT,created_at TEXT);`);
  const queries=[];
  let beforeRead=async()=>{},active=0,peak=0;
  const env={ACTMASTER_DB:{prepare(query){
    const statement=(args=[])=>({
      bind(...values){return statement(values);},
      async first(){
        const kind=query.includes('FROM user_identity_links')?'identity-link':query.includes('FROM users')?'user':'card';
        const record={kind,id:args[0],query,args};queries.push(record);active++;peak=Math.max(peak,active);
        try{await beforeRead(record);return sql.prepare(query).get(...args)||null;}finally{active--;}
      },
      async all(){const record={kind:'logs',query,args};queries.push(record);await beforeRead(record);return {results:sql.prepare(query).all(...args)};},
      async run(){queries.push({kind:'ddl',query,args});assert.match(query,/^\s*CREATE (TABLE|INDEX) IF NOT EXISTS/,'the read handler must not write members or ledger rows');return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}
    });return statement();
  }}};
  const context=vm.createContext({console,Date,JSON,crypto,TextEncoder,URL,RETAIL_ROLES,isRewardOnlyRole,
    fetch(){throw Error('external I/O forbidden');}});
  vm.runInContext([object('SecurityModule'),object('D1ReadModule'),
    'const handler={'+section('  async ensureCashierLedgerTable(env) {','  async storeAdjustCustomerPoints(payload, env, beforeWrite, product) {')+
    section('  async listStorePointCashierLogs(payload, env) {','  async repairPointWalletSearchIndex(payload, env) {')+'};globalThis.handler=handler;'].join('\n'),context);
  const read=(payload={},bindings=env)=>context.handler.listStorePointCashierLogs({authenticatedUserId:STORE,authenticatedRole:'store',...payload},bindings);
  const member=(id,{name='合成會員',phone='0000000000',pointId=''}={})=>sql.prepare('INSERT INTO users(row_id,line_id,name,phone,point_line_id) VALUES(?,?,?,?,?)').run('row-'+id,id,name,phone,pointId);
  const card=(id,{name='合成名片',phone='1111111111',image='https://example.invalid/avatar',lineId=id,creatorId=id}={})=>sql.prepare('INSERT INTO card_contacts VALUES(?,?,?,?,?,?,?,?)').run('card-'+id,lineId,creatorId,name,phone,image,'2026-11-09 00:00:00','2026-11-10 00:00:00');
  const log=(index,customer,{actor=STORE,pointId=customer,mode='redeem',amount=100,points=-10,payable=90,before=300,after=290}={})=>{
    const created=new Date(Date.UTC(2026,10,10,12,0,0)-index*1000).toISOString();
    sql.prepare('INSERT INTO store_point_cashier_logs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('log-'+index,actor,customer,pointId,mode,amount,points,payable,before,after,'gift_money','{"synthetic":true}',created);
    return {logId:'log-'+index,actorUserId:actor,customerUserId:customer,customerPointUserId:pointId||customer,mode,amount,points,payableAmount:payable,balanceBefore:before,balanceAfterEstimate:after,pointType:'gift_money',createdAt:created};
  };
  const reads=kind=>queries.filter(record=>record.kind===kind);
  const snapshot=()=>JSON.stringify(sql.prepare('SELECT * FROM store_point_cashier_logs ORDER BY log_id').all());
  return {sql,env,queries,read,member,card,log,reads,snapshot,hook:fn=>{beforeRead=fn;},get peak(){return peak;}};
}

test('ten logs for one customer perform three presentation reads instead of thirty and preserve every ledger field',async t=>{
  const f=fixture(t),customer=uid(1);f.member(customer,{name:'會員名稱優先',phone:'0000000001'});f.card(customer,{name:'名片名稱',phone:'1111111111'});
  const expected=Array.from({length:10},(_,i)=>({...f.log(i,customer,{mode:i%2?'reward':'redeem',amount:i,points:i%2?i:-(i+1),payable:i+2,before:80+i,after:70+i}),customerName:'會員名稱優先',customerPhone:'0000000001',customerAvatarUrl:'https://example.invalid/avatar'}));
  const before=f.snapshot(),changes=f.sql.prepare('SELECT total_changes() n').get().n;
  const result=await f.read();assert.equal(result.success,true);assert.equal(result.data.scope,'own_store');
  assert.deepEqual(plain(result.data.list),expected);
  assert.equal(f.reads('identity-link').length,1);assert.equal(f.reads('user').length,1);assert.equal(f.reads('card').length,1);
  assert.equal(f.reads('logs').length,1);assert.equal(f.reads('ddl').length,3);assert.equal(f.snapshot(),before);assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,changes);
});

test('distinct customers use at most four concurrent reads and keep ledger order despite reverse completion',async t=>{
  const f=fixture(t),customers=Array.from({length:9},(_,i)=>uid(i+1)),gates=new Map(),started=[];
  customers.forEach((id,i)=>{f.member(id,{name:'會員 '+i});f.log(i,id);});
  f.hook(async record=>{if(record.kind==='identity-link'){started.push(record.id);await new Promise(resolve=>gates.set(record.id,resolve));}});
  const pending=f.read({limit:20});
  try{
    await until(()=>started.length===4);assert.deepEqual(started,customers.slice(0,4));
    for(let i=3;i<8;i++){gates.get(customers[i])();await until(()=>started.length===i+2);}
    for(const id of [customers[8],customers[2],customers[1],customers[0]])gates.get(id)();
    const result=await pending;
    assert.equal(f.peak,4);assert.deepEqual(Array.from(result.data.list,row=>row.logId),customers.map((_,i)=>'log-'+i));
    assert.deepEqual(Array.from(result.data.list,row=>row.customerName),customers.map((_,i)=>'會員 '+i));
    assert.equal(f.reads('identity-link').length,9);assert.equal(f.reads('user').length,9);assert.equal(f.reads('card').length,9);
  }finally{for(const release of gates.values())release();await pending;}
});

test('identity and card failures retain the original independent row fallbacks',async t=>{
  const f=fixture(t),a=uid(1),b=uid(2),c=uid(3),d=uid(4);
  f.member(a);f.card(a,{name:'僅名片可用',phone:'1111111111',lineId:'',creatorId:a});
  f.member(b,{name:'僅會員可用',phone:'0000000002'});f.card(b);
  f.log(0,a);f.log(1,b);f.log(2,c);f.log(3,d,{pointId:''});f.log(4,d);f.log(5,'',{pointId:''});
  f.hook(async({kind,id})=>{if((kind==='user'&&id!==b)||(kind==='card'&&id!==a))throw Error('synthetic profile failure');});
  const result=await f.read();assert.equal(result.success,true);
  assert.deepEqual(Array.from(result.data.list,row=>row.customerName),['僅名片可用','僅會員可用',c,'客戶',d,'客戶']);
  assert.deepEqual(Array.from(result.data.list,row=>row.customerPhone),['1111111111','0000000002','','','','']);
  assert.deepEqual(Array.from(result.data.list,row=>row.customerAvatarUrl),['https://example.invalid/avatar','','','','','']);
  assert.equal(f.reads('user').filter(row=>row.id===d).length,1);assert.equal(f.reads('card').filter(row=>row.id===d).length,1);
  assert.equal(f.reads('identity-link').filter(row=>!row.id).length,0);
});

for(const role of ['store','reward','redeem','admin'])test('verified '+role+' scope is applied before any customer enrichment',async t=>{
  const f=fixture(t),own=uid(1),other=uid(2);f.member(own,{name:'本人店客戶'});f.member(other,{name:'其他店客戶'});f.log(0,own);f.log(1,other,{actor:OTHER_STORE});
  const result=await f.read({userId:OTHER_STORE,role:'admin',authenticatedRole:role});
  assert.equal(result.data.scope,role==='admin'?'all':'own_store');
  assert.deepEqual(Array.from(result.data.list,row=>row.logId),role==='admin'?['log-0','log-1']:['log-0']);
  assert.deepEqual(Array.from(result.data.list,row=>row.customerName),role==='admin'?['本人店客戶','其他店客戶']:['本人店客戶']);
  assert.equal(f.reads('user').some(row=>row.id===other),role==='admin');
  const query=f.reads('logs')[0];assert.deepEqual(Array.from(query.args),role==='admin'?[10]:[STORE,10]);
});

test('profile reads and results stay isolated between concurrent requests and refresh on later requests',async t=>{
  const first=fixture(t),second=fixture(t),customer=uid(1);first.member(customer,{name:'第一請求'});second.member(customer,{name:'第二請求'});first.log(0,customer);second.log(0,customer);
  let release;const gate=new Promise(resolve=>release=resolve);first.hook(async({kind})=>{if(kind==='identity-link')await gate;});
  let aDone=false,bDone=false;const a=first.read().then(value=>{aDone=true;return value;});
  const b=first.read({},second.env).then(value=>{bDone=true;return value;});
  try{
    await until(()=>bDone);assert.equal(aDone,false);assert.equal((await b).data.list[0].customerName,'第二請求');
    release();assert.equal((await a).data.list[0].customerName,'第一請求');
    assert.equal(first.reads('user').length,1);assert.equal(second.reads('user').length,1);
    first.sql.prepare('UPDATE users SET name=? WHERE line_id=?').run('最新會員資料',customer);
    assert.equal((await first.read()).data.list[0].customerName,'最新會員資料');assert.equal(first.reads('user').length,2);
  }finally{release();await Promise.all([a,b]);}
});

test('default and maximum limits, empty rows and log query errors keep their existing behavior',async t=>{
  const f=fixture(t);assert.equal((await f.read()).data.list.length,0);assert.equal(f.reads('user').length,0);assert.equal(f.reads('card').length,0);
  for(let i=0;i<52;i++)f.log(i,'');
  assert.equal((await f.read()).data.list.length,10);
  const limited=await f.read({limit:1000});assert.equal(limited.data.list.length,50);assert.equal(limited.data.list[49].logId,'log-49');
  f.hook(async({kind})=>{if(kind==='logs')throw Error('synthetic log query failure');});
  await assert.rejects(f.read(),/synthetic log query failure/);
  assert.equal((await f.read({},{})).success,false);
});
