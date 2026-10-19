import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildCheckinMallCard,isCheckinMallEvent,supplementCheckinMallCards,handleCheckinMall} from '../worker/checkin-mall-card.mjs';
import {storeInviteProfileView} from '../workerbackup.js';
const A='U'+'1'.repeat(32),B='U'+'2'.repeat(32),ADMIN='Uf729764dbb5b652a5a90a467320bea29';
const NOW=Date.parse('2026-10-19T04:00:00Z');
const event=(extra={})=>({type:'message',mode:'active',source:{type:'user',userId:A},timestamp:NOW,webhookEventId:'evt-1',replyToken:'mother-only',message:{type:'text',text:'會員打卡',id:'msg-1'},...extra});
function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(`PRAGMA foreign_keys=ON;CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT '');CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);`);
  sql.exec(readFileSync(new URL('../migrations/0063_checkin_mall_cards.sql',import.meta.url),'utf8'));
  for(const [uid,role] of [[A,'user'],[B,'store'],[ADMIN,'admin']])sql.prepare('INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,?,?)').run(uid,uid,role,uid===ADMIN?'方萬隆':'測試會員');
  const writes=[],pushes=[],reads=[];let fail='',push='ok',point='ok',channel='1660923784',expires=1000;
  const prepare=(query,args=[])=>({bind(...values){return prepare(query,values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async run(){
    assert.match(query,/^\s*(INSERT OR IGNORE INTO|UPDATE) checkin_mall_/);writes.push(query);
    if(fail&&query.includes(fail))throw Error('private database error');
    const result=sql.prepare(query).run(...args);return {success:true,meta:{changes:Number(result.changes)}};
  }});
  const db={prepare,withSession(){return this;}};
  const env={ACTMASTER_DB:db,CHECKIN_MALL_CARD_ENABLED:'true',LINE_CHANNEL_ACCESS_TOKEN:'fixture-push-key'};
  const points={async read(uid){reads.push(uid);if(point==='failed')throw Error('private mother key');return {identity:uid,balance:point==='zero'?0:12857};}};
  const fetcher=async(url,options)=>{
    if(url.startsWith('https://api.line.me/oauth2/v2.1/verify?')){const token=new URL(url).searchParams.get('access_token');return UID(token)?Response.json({client_id:channel,expires_in:expires}):Response.json({}, {status:401});}
    if(url==='https://api.line.me/v2/profile'){const uid=options.headers.Authorization.slice(7);return UID(uid)?Response.json({userId:uid,displayName:uid===B?'<img src=x onerror=alert(1)>':'測試會員'}):Response.json({}, {status:401});}
    assert.equal(url,'https://api.line.me/v2/bot/message/push');assert.equal(options.redirect,'manual');assert(options.signal);pushes.push({payload:JSON.parse(options.body),key:options.headers['X-Line-Retry-Key']});
    if(push==='timeout')throw Error('lost response');
    return new Response('{}',{status:push==='ok'?200:push==='accepted'?409:Number(push),headers:push==='accepted'?{'x-line-accepted-request-id':'accepted-request'}:{}});
  };
  const send=(events=[event()],forward={success:true},now=NOW)=>supplementCheckinMallCards(events,env,forward,points,fetcher,now);
  const call=async(path='/entry',data,uid=A,method=data?'POST':'GET',now=NOW)=>{
    const request=new Request('https://worker.test/v1/checkin-mall'+path,{method,headers:{...(uid?{Authorization:'Bearer '+uid}:{}),'Content-Type':'application/json'},...(data!==undefined?{body:typeof data==='string'?data:JSON.stringify(data)}:{})});
    const response=await handleCheckinMall(request,env,storeInviteProfileView,fetcher,now);return {status:response.status,...await response.json()};
  };
  return {sql,env,db,send,call,points,fetcher,pushes,reads,writes,setPoint:v=>point=v,setPush:v=>push=v,setFail:v=>fail=v,setChannel:v=>channel=v,setExpires:v=>expires=v,
    card:()=>sql.prepare('SELECT * FROM checkin_mall_cards').get(),count:table=>sql.prepare('SELECT COUNT(*) n FROM '+table).get().n};
}
const UID=value=>/^U[0-9a-f]{32}$/i.test(value||'');
test('migration is additive and card omits removed rows, fixed gains and false success',t=>{
  const f=fixture(t);assert.equal(f.count('users'),3);const card=buildCheckinMallCard({},crypto.randomUUID(),12857,NOW),raw=JSON.stringify(card);
  assert.match(raw,/12,857 元/);assert.match(raw,/前往商城/);assert.doesNotMatch(raw,/打卡贈點|剩餘會員點數|轉換為購物金|打卡成功|＋10|replyToken|mother-only/);
  for(const button of card.contents.footer.contents.filter(x=>x.type==='button')){const url=new URL(button.action.uri);assert.equal(url.host,'liff.line.me');assert.equal(url.searchParams.get('shopSection'),'list');assert(!url.href.includes(A));}
});
test('only exact signed active one-to-one check-in candidates can supplement; gates and failed forward do nothing',async t=>{
  const f=fixture(t),wrong=[event({mode:'standby'}),event({source:{type:'group',userId:A}}),event({message:{type:'text',text:'請會員打卡'}}),event({source:{type:'user',userId:'bad'}}),event({timestamp:NOW-86400000}),event({timestamp:NOW+600000}),event({webhookEventId:'',message:{type:'text',text:'會員打卡'}})];
  await f.send(wrong);await f.send([event()],{success:false});await f.send([event()],{success:true,skipped:true});f.env.CHECKIN_MALL_CARD_ENABLED='false';await f.send();
  assert.equal(f.writes.length,0);assert.equal(f.reads.length,0);assert.equal(f.pushes.length,0);assert.equal(isCheckinMallEvent(event()),true);
});
test('concurrent redelivery/different event IDs push once per member Taipei day with original mother reply untouched',async t=>{
  const f=fixture(t);await Promise.all(Array.from({length:8},(_,i)=>f.send([event({webhookEventId:'event-'+i})])));
  assert.equal(f.pushes.length,1);assert.equal(f.reads.length,1);assert.equal(f.pushes[0].payload.to,A);assert(!('replyToken'in f.pushes[0].payload));assert.match(f.pushes[0].key,/^[0-9a-f-]{36}$/);assert.equal(f.card().state,'accepted');
  await f.send([event({timestamp:NOW+86400000,webhookEventId:'next-day'})],{success:true},NOW+86400000);assert.equal(f.pushes.length,2);
});
test('mother read failure produces unavailable instead of false zero; an authoritative zero remains visible',async t=>{
  const f=fixture(t);f.setPoint('failed');await f.send();const raw=JSON.stringify(f.pushes[0]);assert.match(raw,/暫時無法取得/);assert.doesNotMatch(raw,/\b0 元|打卡成功|private mother key/);
  f.setPoint('zero');await f.send([event({source:{type:'user',userId:B},webhookEventId:'b'})]);assert.match(JSON.stringify(f.pushes[1]),/0 元/);
});
for(const [push,state] of [['timeout','unknown'],['500','unknown'],['429','failed'],['accepted','accepted']])test('push '+push+' persists '+state+' and never retries on duplicate',async t=>{
  const f=fixture(t);f.setPush(push);await f.send();await f.send();assert.equal(f.pushes.length,1);assert.equal(f.card().state,state);
});
test('claim failure and persistence failure after LINE acceptance cannot duplicate sends or touch points',async t=>{
  const f=fixture(t);f.setFail('INSERT');await f.send();assert.equal(f.pushes.length,0);f.setFail('accepted_at');await f.send();await f.send();assert.equal(f.pushes.length,1);assert.equal(f.card().state,'sending');assert.equal(f.count('users'),3);
});
test('click identifies real opener rather than recipient; one-minute dedup, action separation and day boundaries',async t=>{
  const f=fixture(t);await f.send();const data={cardId:f.card().id,action:'mall'};
  assert.equal((await f.call('/entry',data,B)).status,200);assert.equal((await f.call('/entry',data,B)).duplicate,true);
  await f.call('/entry',{...data,action:'details'},B);await f.call('/entry',data,A);
  assert.equal(f.count('checkin_mall_clicks'),3);assert.equal(f.sql.prepare('SELECT actor_uid FROM checkin_mall_clicks ORDER BY id LIMIT 1').get().actor_uid,B);
  assert.equal((await f.call('/entry',data,B,'POST',NOW+60000)).duplicate,false);assert.equal(f.count('checkin_mall_clicks'),4);
});
test('anonymous/expired/wrong-channel tokens, forged fields, invalid cards and GET never record a named entry',async t=>{
  const f=fixture(t);await f.send();const data={cardId:f.card().id,action:'mall'};
  for(const token of ['', 'bad'])assert.equal((await f.call('/entry',data,token)).status,401);
  f.setChannel('other');assert.equal((await f.call('/entry',data)).status,401);f.setChannel('1660923784');f.setExpires(0);assert.equal((await f.call('/entry',data)).status,401);f.setExpires(10);
  assert.equal((await f.call('/entry',{...data,userId:A},B)).status,400);assert.equal((await f.call('/entry',{...data,cardId:crypto.randomUUID()})).status,404);
  assert.equal((await f.call('/entry',undefined,A)).status,405);assert.equal((await f.call('/entry?uid='+A,data,B)).status,400);assert.equal((await f.call('/entry','x'.repeat(9000))).status,413);assert.equal(f.count('checkin_mall_clicks'),0);
});
test('read-only report is current hard-admin only; summary matches bounded keyset pages and no recipient/wallet exposure',async t=>{
  const f=fixture(t);await f.send();for(let i=0;i<54;i++)await f.call('/entry',{cardId:f.card().id,action:'mall'},B,'POST',NOW+i*60000);
  for(const uid of [A,B,'bad',''])assert([401,403].includes((await f.call('/report',undefined,uid)).status));
  const result=await f.call('/report',undefined,ADMIN);assert.equal(result.status,200);assert.equal(result.summary.entries,54);assert.equal(result.summary.people,1);assert.equal(result.rows.length,50);assert(result.next);
  const more=await f.call('/report?after='+result.next,undefined,ADMIN);assert.equal(more.rows.length,4);assert.equal(more.next,'');assert(!result.rows.some(x=>more.rows.some(y=>x.id===y.id)));
  const raw=JSON.stringify(result);assert(!raw.includes(A));assert(!raw.includes('12857'));assert(!raw.includes('phone'));const n=f.writes.length;await f.call('/report',undefined,ADMIN);assert.equal(f.writes.length,n);
  f.sql.prepare("UPDATE users SET role='reward' WHERE line_id=?").run(ADMIN);assert.equal((await f.call('/report',undefined,ADMIN)).status,403);
});
test('report rejects excessive/impossible ranges, duplicate keys, injection, and noninteger cursor',async t=>{
  const f=fixture(t);for(const query of ['from=2026-01-01&to=2026-10-19','from=2026-02-30&to=2026-03-01','after=0','after=1%27+OR+1=1','from=2026-10-19&from=2026-10-18','role=admin'])assert.equal((await f.call('/report?'+query,undefined,ADMIN)).status,400,query);
  assert.equal(f.writes.length,0);
});
test('real webhook integration preserves mother bytes/signature, waits for forward once, and invalid signature cannot push',async t=>{
  const f=fixture(t),source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
  const start=source.indexOf('  queueCheckinMallCards(events, env, ctx, forwardJob) {'),end=source.indexOf('  async isAiPaused(env, threadId) {',start);
  const noop={reply:async()=>false},scope={Response,JSON,console,isCheckinMallEvent,supplementCheckinMallCards:(events,env,result,points)=>supplementCheckinMallCards(events,env,result,points,f.fetcher,NOW),storeCommercePointService:f.points,
    consumeShopKeywords:async e=>e,signRemainingShopEvents:async()=>{throw Error('must preserve signature');},LineOAMyVideoKeywordModule:noop,LineOACardCoolKeywordModule:noop,ReferralFriendKeywordModule:noop,LineOAStoreSearchKeywordModule:noop,LineOAKeywordRuleModule:{replyPayload:async()=>null}};
  const handler=vm.runInNewContext('({'+source.slice(start,end)+'})',scope),forward=[],jobs=[];let release;
  Object.assign(handler,{text:v=>String(v||''),verifySignature:async(_,s)=>s==='valid',consumeMyCardEvents:async e=>e,ensure:async()=>{},saveEvent:async()=>{},followPointOnboardingJob:async()=>{},forwardToSecondSystem:async(raw,sig)=>{forward.push({raw,sig});return new Promise(r=>release=r);},replySimpleMyCard:async()=>false,filterAutoReplyPayload:async r=>r,forwardToGas:async()=>({skipped:true}),replyLine:async()=>{throw Error('child cannot reply');}});
  const raw=JSON.stringify({destination:'channel',events:[event()]},null,2),request=sig=>new Request('https://worker.test/line-webhook',{method:'POST',headers:{'x-line-signature':sig},body:raw});
  assert.equal((await handler.handleWebhook(request('invalid'),f.env,{waitUntil:p=>jobs.push(p)})).status,401);assert.equal(forward.length,0);
  assert.equal((await handler.handleWebhook(request('valid'),f.env,{waitUntil:p=>jobs.push(p)})).status,200);assert.equal(f.pushes.length,0);assert.equal(forward.length,1);assert.equal(forward[0].raw,raw);assert.equal(forward[0].sig,'valid');release({success:true});await Promise.all(jobs);assert.equal(f.pushes.length,1);
});
