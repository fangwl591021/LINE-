// Protected regression suite: existing scores are data, not disposable AI cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { restoreCollectionHistory, scoreNewCollectionMatches, collectionPartnerProfile, PROFILE_KEY } from '../worker/collection-match-history.mjs';

function fixture(t) {
  const sql=new DatabaseSync(':memory:'); t.after(()=>sql.close());
  sql.exec(readFileSync(new URL('../migrations/0027_incremental_matchmaking_cache.sql',import.meta.url),'utf8'));
  sql.exec(`CREATE TABLE card_contacts(row_id TEXT,line_id TEXT,profile_user_id TEXT,owner_user_id TEXT,creator_id TEXT,source_type TEXT,archived_at TEXT,company_name TEXT,title TEXT,services TEXT,personality TEXT,hobbies TEXT,career TEXT,updated_at TEXT,created_at TEXT);
    INSERT INTO card_contacts VALUES('SELF','A','A','A','A','self_profile','','本人公司','顧問','顧問服務','謹慎','閱讀','科技','2026-09-01','2026-09-01')`);
  const db={prepare(query){
    const make=args=>({bind(...values){return make(values);},async all(){return {success:true,results:statement(args).all()};},async first(){return statement(args).get()||null;},async run(){return {success:true,meta:{changes:Number(statement(args).run().changes)}};}});
    function statement(args){let params=args;const indexes=[...query.matchAll(/\?(\d+)/g)];let q=query;if(indexes.length){params=indexes.map(m=>args[Number(m[1])-1]);q=query.replace(/\?\d+/g,'?');}const s=sql.prepare(q);return {all:()=>s.all(...params),get:()=>s.get(...params),run:()=>s.run(...params)};}
    return make([]);
  }};
  const cards=[],calls=[];
  const read={identityIdsForUser:async()=>['A'],getCardHarvestContacts:async()=>({success:true,data:await restoreCollectionHistory(cards,db,'A')})};
  let responder=body=>({choices:[{message:{content:JSON.stringify({scores:JSON.parse(body.messages[1].content).candidates.map(c=>({index:c.index,score:76,reason:'商務服務資源互補，可進一步確認合作需求。'}))})}}]});
  const match={matchmakingDigest:async p=>createHash('sha256').update(JSON.stringify(p)).digest('hex'),openAITextModel:()=> 'existing-model',callOpenAI:async(_env,body,key,signal)=>{assert.equal(key,'');assert.ok(signal);calls.push(body);return responder(body);}};
  const options={env:{ACTMASTER_DB:db},actor:{userId:'A',token:'verified'},read,match,rateLimit:async()=>true};
  const add=(id,extra={})=>cards.push({rowId:id,公司名稱:'候選公司',職稱:'業務',服務項目:'通路',電話:'0927-136-847',姓名:'勿傳姓名',health:'勿傳健康',wealth:'勿傳財富',birthday:'勿傳生日',aiMatch:{status:'needs_intent',score:null},...extra});
  const cache=(id,{user='A',scope='own',key='old-intent',score=82,source='ai',version='old-version',date='2026-09-01 00:00:00'}={})=>sql.prepare('INSERT INTO ai_match_pair_cache(requester_user_id,pool_scope,intent_hash,candidate_card_row_id,candidate_version,score,reason,result_source,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(user,scope,key,id,version,score,'既有配對理由',source,date);
  return {sql,db,cards,calls,add,cache,options,load:()=>read.getCardHarvestContacts(),run:()=>scoreNewCollectionMatches(options),respond:fn=>{responder=fn;}};
}

test('PROTECTED: no intent or changed versions still restore old score/reason, never recompute',async t=>{
  const f=fixture(t);f.add('OLD');f.cache('OLD');const before=f.sql.prepare('SELECT * FROM ai_match_pair_cache').all();
  const result=await f.run();assert.equal(result.data.processed,0);assert.equal(f.calls.length,0);
  const m=result.data.cards[0].aiMatch;assert.equal(m.score,82);assert.equal(m.reason,'既有配對理由');assert.equal(m.basis,'previous');
  assert.deepEqual(f.sql.prepare('SELECT * FROM ai_match_pair_cache').all(),before);
});
test('PROTECTED: mixed existing and new cards send only unscored candidates; completed requests are idempotent',async t=>{
  const f=fixture(t);f.add('OLD');f.cache('OLD');f.add('NEW');
  const result=await f.run();assert.equal(result.data.processed,1);assert.equal(f.calls.length,1);
  assert.equal(JSON.parse(f.calls[0].messages[1].content).candidates.length,1);
  assert.equal(result.data.cards[0].aiMatch.score,82);assert.equal(result.data.cards[1].aiMatch.score,76);
  assert.equal(result.data.cards[1].aiMatch.basis,'profile');await f.run();assert.equal(f.calls.length,1);
});
test('private actor isolation, AI precedence and real rule zero are preserved',async t=>{
  const f=fixture(t);f.add('CARD');f.add('ZERO');f.cache('CARD',{user:'B',score:99});f.cache('CARD',{scope:'public',score:98});
  assert.equal((await f.load()).data[0].aiMatch.score,null);
  f.cache('CARD',{key:'rules',source:'rules',score:90,date:'2026-09-20'});f.cache('CARD',{key:'ai',score:81});f.cache('ZERO',{score:0,source:'rules'});
  const cards=(await f.run()).data.cards;assert.equal(cards[0].aiMatch.score,81);assert.equal(cards[1].aiMatch.score,0);assert.equal(f.calls.length,0);
});
test('current valid score remains first priority; archived and referral records are never enriched',async t=>{
  const f=fixture(t);f.add('CURRENT',{aiMatch:{status:'completed',score:62,source:'ai'}});f.cache('CURRENT',{score:93});
  f.add('ARCHIVED',{archivedAt:'2026-09-10'});f.cache('ARCHIVED');f.add('REF',{sourceType:'referral_placeholder'});f.cache('REF');
  const result=await f.load();assert.equal(result.data[0].aiMatch.score,62);assert.equal(result.data[1].aiMatch.score,null);assert.equal(result.data[2].aiMatch.score,null);
});
test('concurrent tabs have one lease and cannot duplicate the AI request',async t=>{
  const f=fixture(t);f.add('NEW');let release,entered;const ready=new Promise(r=>entered=r);const wait=new Promise(r=>release=r);
  f.respond(async()=>{entered();await wait;return {choices:[{message:{content:'{"scores":[{"index":0,"score":71,"reason":"服務內容具備互補合作空間。"}]}'}}]};});
  const first=f.run();await ready;const second=await f.run();assert.equal(second.data.processed,0);assert.equal(f.calls.length,1);release();await first;
  assert.equal((await f.load()).data[0].aiMatch.score,71);
});
test('SQL claim guards against score created after the initial read',async t=>{
  const f=fixture(t);f.add('NEW');const read=f.options.read.getCardHarvestContacts;let once=true;
  f.options.read.getCardHarvestContacts=async()=>{const result=await read();if(once){once=false;f.cache('NEW',{score:88});}return result;};
  await f.run();assert.equal(f.calls.length,0);assert.equal((await f.load()).data[0].aiMatch.score,88);
});
test('provider failure or invalid JSON never fabricates zero and retries are backed off',async t=>{
  const f=fixture(t);f.add('NEW');f.respond(()=>{throw Error('offline');});await f.run();
  assert.equal((await f.load()).data[0].aiMatch.status,'failed');assert.equal((await f.load()).data[0].aiMatch.score,null);
  await f.run();assert.equal(f.calls.length,1);
  f.sql.exec("UPDATE ai_match_pair_cache SET updated_at=datetime('now','-6 minutes')");
  f.respond(()=>({choices:[{message:{content:'{"scores":[{"index":0,"score":999,"reason":"invalid result"}]}'}}]}));await f.run();
  assert.equal(f.calls.length,2);assert.equal((await f.load()).data[0].aiMatch.score,null);
});
test('expired lease can recover; batches are limited to five and empty profiles cannot starve new cards',async t=>{
  const f=fixture(t);for(let i=0;i<6;i++)f.add('EMPTY'+i,{公司名稱:'',職稱:'',服務項目:''});
  for(let i=0;i<7;i++)f.add('NEW'+i);f.cache('NEW0',{key:PROFILE_KEY,source:'partner_processing',score:0});
  assert.equal((await f.run()).data.processed,5);assert.equal((await f.run()).data.processed,2);assert.equal(f.calls.length,2);
});
test('only approved fields are sent and quota denial performs no AI call',async t=>{
  const f=fixture(t);f.add('NEW');await f.run();const prompt=JSON.stringify(f.calls[0].messages[1]);
  for(const secret of ['0927','勿傳姓名','勿傳健康','勿傳財富','勿傳生日'])assert.ok(!prompt.includes(secret));
  assert.deepEqual(Object.keys(collectionPartnerProfile({})),['company','title','services','industry','personality','interests','career']);
  f.add('QUOTA');f.options.rateLimit=async()=>false;await f.run();assert.equal(f.calls.length,1);assert.equal((await f.load()).data[1].aiMatch.score,null);
});
test('missing own card and conflicting/claimed identity cannot generate scores',async t=>{
  const f=fixture(t);f.add('NEW');f.sql.exec("UPDATE card_contacts SET owner_user_id='OTHER'");
  const result=await f.run();assert.equal(result.data.processed,0);assert.equal(f.calls.length,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_match_pair_cache').get().n,0);
});
test('unverified identities are denied without reading or writing',async t=>{
  const f=fixture(t);f.options.read.getCardHarvestContacts=()=>{throw Error('must not read');};
  for(const actor of [null,{userId:'A'},{userId:'A',token:'x',source:'d1_identity_fallback'}])assert.equal((await scoreNewCollectionMatches({...f.options,actor})).success,false);
});

const frontend=readFileSync(new URL('../js/modules/collection-match-auto.js',import.meta.url),'utf8');
test('frontend does not call AI for existing scores, merges only score fields for new cards',async()=>{
  const old={rowId:'OLD',姓名:'keep',aiMatch:{status:'completed',score:82,source:'ai'}},cards=[old];let calls=0;
  const window={currentUserProfile:{userId:'A'},harvestCards:cards,allCards:cards,fetchAPI:async(action,payload,auth)=>{calls++;assert.equal(action,'refreshCardHarvestMatches');assert.equal(auth,true);assert.equal(Object.keys(payload).length,0);return {success:true,data:{processed:1,cards:[{...old,姓名:'do not replace'},{rowId:'NEW',aiMatch:{status:'completed',score:71,source:'ai'}}]}};}};
  vm.runInNewContext(frontend,{window,document:{hidden:false,getElementById:()=>null}});
  await window.ensureCollectedMatchScores();assert.equal(calls,0);
  cards.push({rowId:'NEW',aiMatch:{score:null,autoEligible:true}});await window.ensureCollectedMatchScores();assert.equal(calls,1);
  assert.equal(window.harvestCards[0].姓名,'keep');assert.equal(window.harvestCards[0].aiMatch.score,82);assert.equal(window.harvestCards[1].aiMatch.score,71);
});
test('frontend ignores a response if account switched while waiting',async()=>{
  const original=[{rowId:'NEW',aiMatch:{score:null,autoEligible:true}}];const window={currentUserProfile:{userId:'A'},harvestCards:original,fetchAPI:async()=>{window.currentUserProfile={userId:'B'};return {success:true,data:{processed:1,cards:[{rowId:'NEW',aiMatch:{score:99}}]}};}};
  vm.runInNewContext(frontend,{window,document:{hidden:false,getElementById:()=>null}});await window.ensureCollectedMatchScores();assert.equal(window.harvestCards,original);
});

test('actual core API unwrap and timeout contract supports background completion',async()=>{
  const core=readFileSync(new URL('../js/core.js',import.meta.url),'utf8');
  const start=core.indexOf('window.fetchAPI = async function'),end=core.indexOf('// 強效配對機制',start);
  assert.ok(start>0&&end>start);let timeout,posted;
  const window={currentUserProfile:{userId:'A'},harvestCards:[{rowId:'NEW',aiMatch:{score:null,autoEligible:true}}]};
  const context=vm.createContext({window,document:{hidden:false,getElementById:()=>null},console,AbortController,Config:{WORKER_URL:'https://local.invalid'},setTimeout:(_fn,ms)=>{timeout=ms;return 1;},clearTimeout(){},liff:{isLoggedIn:()=>true,getAccessToken:()=> 'test-token'},fetch:async(_url,init)=>{posted=JSON.parse(init.body);return {ok:true,json:async()=>({success:true,data:{processed:1,cards:[{rowId:'NEW',aiMatch:{status:'completed',score:76,source:'ai'}}]}})};}});
  vm.runInContext(core.slice(start,end),context);vm.runInContext(frontend,context);await window.ensureCollectedMatchScores();
  assert.equal(timeout,45000);assert.equal(posted.payload.lineAccessToken,'test-token');assert.equal(posted.payload.clientOpenAIKey,undefined);
  assert.equal(window.harvestCards[0].aiMatch.score,76);
});
