import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {buildApplicationAdminNoticeFlex,processApplicationAdminNotifications} from '../worker/application-admin-notifications.mjs';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32),OLD='U'+'d'.repeat(32),NOW=1800000000;
const migration=readFileSync(new URL('../migrations/0078_application_admin_notifications.sql',import.meta.url),'utf8');
const fields=['row_id','line_id','legacy_line_id','point_line_id','role','name','phone'];
function fixture(t,{seed=true}={}){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT '');CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);CREATE TABLE protected_points(id TEXT,points INTEGER);INSERT INTO protected_points VALUES('wallet',12345);");
 for(const kind of ['reward','discount','partner','full'])sql.exec(`CREATE TABLE ${kind}_applications(id TEXT PRIMARY KEY,owner_uid TEXT,unit_name TEXT,applicant_name TEXT,signed_at TEXT,snapshot_json TEXT);`);
 sql.exec("INSERT INTO reward_applications VALUES('old','private-owner','private-unit','private-name','2020-01-01','private-signature-bank');");
 sql.exec(migration);
 const pushes=[],physical=[],queries=[],accepted=new Map(),state={status:200,mode:'ok',clock:NOW,hook:null,failFinish:false};
 const user=(id,uid,role)=>sql.prepare('INSERT INTO users(row_id,line_id,role,name,phone) VALUES(?,?,?,?,?)').run(id,uid,role,'private-admin-name','0912345678');
 if(seed){user('a',A,'admin');user('ordinary',C,'user');}
 function prepare(query,args=[]){
  const run=()=>{
   queries.push(query);if(state.hook)state.hook(query,args);
   if(state.failFinish&&query.includes('SET status=?,lease_until=0,finished_at=?')&&args[0]==='sent'){state.failFinish=false;throw Error('lost finalization');}
   assert.match(query,/^\s*(?:INSERT OR IGNORE INTO application_admin_notice_|UPDATE application_admin_notice_)/);
   const r=sql.prepare(query).run(...args);return{success:true,meta:{changes:Number(r.changes)}};
  };
  return{bind(...values){return prepare(query,values);},async all(){queries.push(query);return{success:true,results:sql.prepare(query).all(...args)};},async first(){queries.push(query);return sql.prepare(query).get(...args)||null;},runSync:run,async run(){return run();}};
 }
 const db={prepare,withSession(){return this;},async batch(statements){sql.exec('BEGIN');try{const r=statements.map(s=>s.runSync());sql.exec('COMMIT');return r;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const env={ACTMASTER_DB:db,LINE_CHANNEL_ACCESS_TOKEN:'synthetic-bot-token',POINT_LIFF_ID:'1660923784-vViMTZ1y'};
 const options={profileMapper:row=>({role:['admin','總管'].includes(String(row.role).toLowerCase())?'admin':'user'}),hardAdminIds:[],fetcher:async(url,init)=>{
  assert.equal(url,'https://api.line.me/v2/bot/message/push');assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer synthetic-bot-token');assert(UUID.test(init.headers['X-Line-Retry-Key']));
  const body=JSON.parse(init.body),key=init.headers['X-Line-Retry-Key'];pushes.push({key,body,raw:init.body});
  if(accepted.has(key)){assert.equal(init.body,accepted.get(key));return new Response('',{status:409,headers:{'x-line-accepted-request-id':'accepted'}});}
  if(state.mode==='throw'){accepted.set(key,init.body);physical.push(body);throw Error('response lost after accept');}
  if(state.status===200){accepted.set(key,init.body);physical.push(body);}
  return new Response('',{status:state.status});
 }};
 function sign(kind='reward',id=crypto.randomUUID(),at=NOW-60){
  sql.prepare(`INSERT OR IGNORE INTO ${kind}_applications VALUES(?,?,?,?,?,?)`).run(id,'PRIVATE-OWNER-UID','PRIVATE-UNIT','PRIVATE-SIGNER',new Date(at*1000).toISOString(),'PRIVATE-SIGNATURE-BANK');
  sql.prepare('UPDATE application_admin_notice_events SET created_at=? WHERE kind=? AND application_id=?').run(at,kind,id);return id;
 }
 return{sql,db,env,options,state,user,sign,pushes,physical,queries,run:()=>processApplicationAdminNotifications(env,{...options,now:state.clock})};
}
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const all=(f,table)=>f.sql.prepare('SELECT * FROM '+table).all();

test('migration enqueues only future successful signatures for all four types and exact replays stay one event',t=>{
 const f=fixture(t);assert.equal(all(f,'application_admin_notice_events').length,0);
 for(const kind of ['reward','discount','partner','full']){const id=f.sign(kind);f.sign(kind,id);}
 assert.equal(all(f,'application_admin_notice_events').length,4);
 f.sql.exec(migration);assert.equal(all(f,'application_admin_notice_events').length,4);
 f.sql.exec('BEGIN');f.sign('full');f.sql.exec('ROLLBACK');assert.equal(all(f,'application_admin_notice_events').length,4);
 assert.equal(f.sql.prepare('SELECT points FROM protected_points').get().points,12345);
 assert.equal(f.sql.prepare("SELECT snapshot_json FROM reward_applications WHERE id='old'").get().snapshot_json,'private-signature-bank');
});

test('two or more applications are one multi-page Flex per existing admin with opaque review links and no private details',async t=>{
 const f=fixture(t);f.user('b',B,'總管');f.sign('reward');f.sign('partner');
 const originals=JSON.stringify(['users','reward_applications','partner_applications','protected_points'].map(table=>all(f,table)));
 await f.run();await f.run();assert.equal(f.pushes.length,2);assert.equal(f.physical.length,2);
 assert.deepEqual(new Set(f.pushes.map(p=>p.body.to)),new Set([A,B]));
 for(const p of f.pushes){assert.equal(p.body.messages.length,1);const message=p.body.messages[0];assert.equal(message.contents.type,'carousel');assert.equal(message.contents.contents.length,2);
  for(const bubble of message.contents.contents){const url=new URL(bubble.footer.contents[0].action.uri);assert.equal(url.host,'liff.line.me');assert.equal(url.searchParams.get('shopSection'),'mine');assert.equal(url.searchParams.get('applicationReview'),'1');assert(UUID.test(url.searchParams.get('applicationId')));assert(['reward','partner'].includes(url.searchParams.get('applicationKind')));assert.deepEqual([...url.searchParams.keys()],['shopSection','applicationReview','applicationKind','applicationId']);}
  assert.doesNotMatch(JSON.stringify(message),/PRIVATE|0912345678|private-admin-name|owner_uid|signer_uid|snapshot_json|token/i);
 }
 await f.run();assert.equal(f.pushes.length,2);assert(all(f,'application_admin_notice_batches').every(b=>b.status==='sent'));
 assert.equal(JSON.stringify(['users','reward_applications','partner_applications','protected_points'].map(table=>all(f,table))),originals);
});

test('single signatures use a single bubble; short batching delay coalesces later signed documents',async t=>{
 const f=fixture(t);f.sign('discount',undefined,NOW-10);await f.run();assert.equal(f.pushes.length,0);
 f.sign('full',undefined,NOW-5);f.state.clock=NOW+30;await f.run();assert.equal(f.pushes.length,1);assert.equal(f.pushes[0].body.messages[0].contents.contents.length,2);
 f.sign('reward',undefined,NOW+40);f.state.clock=NOW+80;await f.run();assert.equal(f.pushes.length,2);assert.equal(f.pushes[1].body.messages[0].contents.type,'bubble');
});

test('missing token or no registered admins cannot consume the pending event or guess recipients',async t=>{
 const f=fixture(t,{seed:false});f.sign();delete f.env.LINE_CHANNEL_ACCESS_TOKEN;await f.run();assert.equal(all(f,'application_admin_notice_events')[0].fanout_at,0);
 f.env.LINE_CHANNEL_ACCESS_TOKEN='synthetic-bot-token';f.user('ordinary',C,'user');f.options.hardAdminIds=[A];await f.run();assert.equal(f.pushes.length,0);assert.equal(all(f,'application_admin_notice_events')[0].fanout_at,0);
 f.user('a',A,'admin');await f.run();assert.equal(f.pushes.length,1);assert.equal(f.pushes[0].body.to,A);
});

test('candidate authority needs both stored role/existing hard ID and the original mapper; stale aliases or ambiguous UIDs are excluded',async t=>{
 const f=fixture(t,{seed:false});f.user('a',A,'user');f.user('b',B,'admin');f.user('old',OLD,'admin');f.user('current',C,'admin');
 f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(OLD,C);
 f.user('duplicate-b',B,'admin');f.options.hardAdminIds=[A,'not-a-uid'];f.options.profileMapper=row=>({role:row.line_id===A||row.role==='admin'?'admin':'user'});
 f.sign();await f.run();await f.run();assert.deepEqual(new Set(f.pushes.map(p=>p.body.to)),new Set([A]));
 assert.equal(all(f,'application_admin_notice_deliveries').find(delivery=>delivery.line_id===C).status,'cancelled','admin-page resolver rejects two persisted accounts even with an active old/new link');
 const g=fixture(t,{seed:false});g.user('fake',A,'user');g.options.profileMapper=()=>({role:'admin'});g.sign();await g.run();assert.equal(g.pushes.length,0,'mapper alone cannot select arbitrary ordinary names/phones');
});

test('revoked admin at the atomic sending boundary receives nothing, without losing a signed application',async t=>{
 const f=fixture(t);const id=f.sign('partner');f.state.hook=query=>{if(query.includes('SET attempts=attempts+1')){f.state.hook=null;f.sql.prepare("UPDATE users SET role='user' WHERE row_id='a'").run();}};
 await f.run();assert.equal(f.pushes.length,0);assert.equal(all(f,'application_admin_notice_batches')[0].status,'cancelled');assert.equal(f.sql.prepare('SELECT id FROM partner_applications WHERE id=?').get(id).id,id);
});

test('existing hard-admin legacy IDs and configured phone+name authority are candidates without granting name-only authority',async t=>{
 const f=fixture(t,{seed:false});f.user('new-admin',A,'user');f.user('phone-admin',B,'user');f.user('same-name',C,'user');
 f.sql.prepare("UPDATE users SET legacy_line_id=?,name='Canonical Admin' WHERE line_id=?").run(OLD,A);
 f.sql.prepare("UPDATE users SET name='Existing Admin',phone='0900000001' WHERE line_id=?").run(B);
 f.sql.prepare("UPDATE users SET name='Existing Admin',phone='0999999999' WHERE line_id=?").run(C);
 f.options.hardAdminIds=[OLD];f.options.hardAdminNames=['Existing Admin'];
 f.options.profileMapper=row=>({role:row.legacy_line_id===OLD||(row.name==='Existing Admin'&&row.phone==='0900000001')?'admin':'user'});
 f.sign();await f.run();await f.run();assert.deepEqual(new Set(f.pushes.map(p=>p.body.to)),new Set([A,B]));
 const g=fixture(t,{seed:false});g.user('raw-admin',A,'admin');g.options.profileMapper=()=>({role:'user'});g.sign();await g.run();assert.equal(g.pushes.length,0,'raw role does not override the original authority mapper');
});

test('concurrent cron invocations cannot duplicate a cohort or an external push',async t=>{
 const f=fixture(t);f.sign();f.sign('full');await Promise.all([f.run(),f.run(),f.run()]);
 assert.equal(f.pushes.length,1);assert.equal(all(f,'application_admin_notice_batches').length,1);assert.equal(all(f,'application_admin_notice_deliveries').length,2);
});

test('a timeout retries the exact frozen destination/message/UUID and accepted-409 settles without another physical delivery',async t=>{
 const f=fixture(t);f.sign('full');f.state.mode='throw';await f.run();assert.equal(f.pushes.length,1);assert.equal(f.physical.length,1);
 const first=f.pushes[0],b=all(f,'application_admin_notice_batches')[0];assert.equal(b.status,'pending');assert.equal(b.attempts,1);
 f.sign('reward');f.state.mode='ok';f.state.clock=NOW+70;await f.run();assert.equal(f.pushes.length,2);assert.equal(f.physical.length,1);assert.equal(f.pushes[1].raw,first.raw);assert.equal(f.pushes[1].key,first.key);
 assert.equal(all(f,'application_admin_notice_batches')[0].status,'sent');
 f.state.clock=NOW+140;await f.run();assert.equal(f.physical.length,2);assert.equal(f.pushes[2].body.messages[0].contents.type,'bubble');
});

test('lost sent finalization retains one frozen LINE key and can recover without duplicate delivery',async t=>{
 const f=fixture(t);f.sign();f.state.failFinish=true;await f.run();assert.equal(all(f,'application_admin_notice_batches')[0].status,'pending');
 f.state.clock=NOW+70;await f.run();assert.equal(f.pushes.length,2);assert.equal(f.physical.length,1);assert.equal(f.pushes[0].raw,f.pushes[1].raw);assert.equal(all(f,'application_admin_notice_batches')[0].status,'sent');
});

test('permanent LINE rejection or expired retry becomes failed rather than re-enqueuing the signed document',async t=>{
 const f=fixture(t);f.sign();f.state.status=400;await f.run();assert.equal(all(f,'application_admin_notice_batches')[0].status,'failed');await f.run();assert.equal(f.pushes.length,1);
 const g=fixture(t);g.sign();g.state.status=500;await g.run();g.state.clock=NOW+24*3600;await g.run();assert.equal(g.pushes.length,1);assert.equal(all(g,'application_admin_notice_batches')[0].status,'failed');assert.equal(all(g,'application_admin_notice_deliveries')[0].status,'failed');
 assert.equal(all(g,'reward_applications').length,2);
});

test('cohorts have at most ten pages and remaining applications stay available for the next single message',async t=>{
 const f=fixture(t);for(let n=0;n<11;n++)f.sign('reward');await f.run();assert.equal(f.pushes.length,1);assert.equal(f.pushes[0].body.messages[0].contents.contents.length,10);
 f.state.clock=NOW+60;await f.run();assert.equal(f.pushes.length,2);assert.equal(f.pushes[1].body.messages[0].contents.type,'bubble');assert.equal(all(f,'application_admin_notice_deliveries').filter(d=>d.status==='sent').length,11);
});

test('revocation after an unknown attempt never redirects that retry to another account',async t=>{
 const f=fixture(t);f.sign();f.state.mode='throw';await f.run();f.sql.prepare("UPDATE users SET role='user' WHERE row_id='a'").run();f.user('b',B,'admin');f.state.clock=NOW+70;await f.run();
 assert.equal(f.pushes.length,1);assert.equal(all(f,'application_admin_notice_batches')[0].status,'cancelled');assert.equal(all(f,'application_admin_notice_events')[0].fanout_at,NOW);
});

test('notice builder rejects unbounded cohorts, foreign kinds and invalid LIFF or record identifiers',()=>{
 const item={kind:'partner',application_id:crypto.randomUUID(),signed_at:new Date(NOW*1000).toISOString()};
 for(const bad of [[],Array.from({length:11},()=>item)])assert.throws(()=>buildApplicationAdminNoticeFlex(bad,'1660923784-vViMTZ1y'));
 for(const bad of [{...item,kind:'other'},{...item,application_id:'../private'},{...item,application_id:A}])assert.throws(()=>buildApplicationAdminNoticeFlex([bad],'1660923784-vViMTZ1y'));
 assert.throws(()=>buildApplicationAdminNoticeFlex([item],'https://evil.test'));
});

test('the production authority mapper recognizes configured legacy identity while rejecting raw-admin and name-only impostors',async t=>{
 const {storeInviteProfileView,getContractAdminNotificationIds,getContractAdminNotificationNames}=await import('../workerbackup.js');
 const f=fixture(t,{seed:false}),ids=getContractAdminNotificationIds(),names=getContractAdminNotificationNames();
 f.user('confirmed-alias',A,'user');f.sql.prepare('UPDATE users SET legacy_line_id=?,name=? WHERE line_id=?').run(ids[0],names[0],A);
 f.user('raw-admin',B,'admin');f.user('name-only',C,'user');f.sql.prepare('UPDATE users SET name=? WHERE line_id=?').run(names[0],C);
 f.options.profileMapper=storeInviteProfileView;f.options.hardAdminIds=ids;f.options.hardAdminNames=names;f.sign();await f.run();
 assert.deepEqual(f.pushes.map(push=>push.body.to),[A]);
 for(const role of ['reward','redeem'])assert.notEqual(storeInviteProfileView({...f.sql.prepare("SELECT * FROM users WHERE row_id='confirmed-alias'").get(),role}).role,'admin');
});

test('the exact admin-page resolver rejects cross-row alias collisions even if a mapper alone returns admin',async t=>{
 const f=fixture(t);f.sql.prepare("UPDATE users SET point_line_id=? WHERE row_id='ordinary'").run(A);
 f.options.profileMapper=()=>({role:'admin'});f.sign('full');await f.run();
 assert.equal(f.pushes.length,0);assert.equal(all(f,'application_admin_notice_deliveries')[0].status,'cancelled');assert.equal(all(f,'full_applications').length,1);
});

test('an alias collision introduced at the sending claim is rechecked by the exact admin resolver before HTTP',async t=>{
 const f=fixture(t);f.sign('partner');f.state.hook=query=>{if(query.includes('SET attempts=attempts+1')){f.state.hook=null;f.sql.prepare("UPDATE users SET legacy_line_id=? WHERE row_id='ordinary'").run(A);}};
 await f.run();assert.equal(f.pushes.length,0);assert.equal(all(f,'application_admin_notice_batches')[0].status,'cancelled');
});
