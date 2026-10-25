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
  const options={env:{ACTMASTER_DB:db},actor:{userId:'A',token:'verified'},read,match};
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
  assert.equal(f.calls[0].response_format.type,'json_object');assert.match(f.calls[0].messages[0].content,/\bJSON\b/i);
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

test('final write preserves a valid score completed by another intent while this model request was pending, including zero',async t=>{
  for(const score of [91,0]){
    const f=fixture(t);f.add('NEW');let entered,release;
    const ready=new Promise(resolve=>{entered=resolve;}),wait=new Promise(resolve=>{release=resolve;});
    f.respond(async()=>{entered();await wait;return {choices:[{message:{content:'{"scores":[{"index":0,"score":78,"reason":"較晚完成的模型結果不得掩蓋既有分數。"}]}'}}]};});
    const pending=f.run();await ready;f.cache('NEW',{key:'completed-during-model-request',score});
    const original=f.sql.prepare('SELECT * FROM ai_match_pair_cache WHERE intent_hash=?').get('completed-during-model-request');release();
    const response=await pending;assert.equal(response.data.processed,0);assert.equal(response.data.cards[0].aiMatch.score,score);
    assert.deepEqual(f.sql.prepare('SELECT * FROM ai_match_pair_cache WHERE intent_hash=?').get('completed-during-model-request'),original);
    assert.equal(f.sql.prepare('SELECT result_source FROM ai_match_pair_cache WHERE intent_hash=?').get(PROFILE_KEY).result_source,'partner_processing');
    assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_match_pair_cache WHERE intent_hash=? AND result_source='ai'").get(PROFILE_KEY).n,0);
  }
});
test('provider failure or invalid JSON never fabricates zero and retries are backed off',async t=>{
  const f=fixture(t);f.add('NEW');f.respond(()=>{throw Error('offline');});await f.run();
  assert.equal((await f.load()).data[0].aiMatch.status,'failed');assert.equal((await f.load()).data[0].aiMatch.score,null);
  await f.run();assert.equal(f.calls.length,1);
  f.sql.prepare("UPDATE ai_match_pair_cache SET updated_at=datetime('now','-6 minutes'),reason=?").run(JSON.stringify({version:1,failureCode:'provider',retryAt:new Date(Date.now()-60000).toISOString()}));
  f.respond(()=>({choices:[{message:{content:'{"scores":[{"index":0,"score":999,"reason":"invalid result"}]}'}}]}));await f.run();
  assert.equal(f.calls.length,2);assert.equal((await f.load()).data[0].aiMatch.score,null);
});
test('expired lease can recover; batches are limited to five and empty profiles cannot starve new cards',async t=>{
  const f=fixture(t);for(let i=0;i<6;i++)f.add('EMPTY'+i,{公司名稱:'',職稱:'',服務項目:''});
  for(let i=0;i<7;i++)f.add('NEW'+i);f.cache('NEW0',{key:PROFILE_KEY,source:'partner_processing',score:0});
  assert.equal((await f.run()).data.processed,5);assert.equal((await f.run()).data.processed,2);assert.equal(f.calls.length,2);
});
test('only approved fields are sent and retired daily quota callbacks cannot block a new card',async t=>{
  const f=fixture(t);f.add('NEW');await f.run();const prompt=JSON.stringify(f.calls[0].messages[1]);
  for(const secret of ['0927','勿傳姓名','勿傳健康','勿傳財富','勿傳生日'])assert.ok(!prompt.includes(secret));
  assert.deepEqual(Object.keys(collectionPartnerProfile({})),['company','title','services','industry','personality','interests','career']);
  f.add('QUOTA');f.options.rateLimit=async()=>{throw Error('must not call a retired daily quota');};await f.run();assert.equal(f.calls.length,2);assert.equal((await f.load()).data[1].aiMatch.score,76);
});
test('missing own card and conflicting/claimed identity cannot generate scores',async t=>{
  const f=fixture(t);f.add('NEW');f.sql.exec("UPDATE card_contacts SET owner_user_id='OTHER'");
  const result=await f.run();assert.equal(result.data.processed,0);assert.equal(f.calls.length,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_match_pair_cache').get().n,0);
});
test('unverified identities are denied without reading or writing',async t=>{
  const f=fixture(t);f.options.read.getCardHarvestContacts=()=>{throw Error('must not read');};
  for(const actor of [null,{userId:'A'},{userId:'A',token:'x',source:'d1_identity_fallback'}])assert.equal((await scoreNewCollectionMatches({...f.options,actor})).success,false);
});

test('provider and timeout failures store only safe metadata and a real five-minute retry deadline',async t=>{
  for(const [name,expected] of [['Error','provider'],['AbortError','timeout'],['TimeoutError','timeout']]){
    const f=fixture(t);f.add('NEW');f.respond(()=>{const error=Error('PRIVATE_PHONE secret-provider-body token=DO_NOT_STORE');error.name=name;throw error;});
    const started=Date.now(),response=await f.run(),row=f.sql.prepare('SELECT * FROM ai_match_pair_cache').get(),metadata=JSON.parse(row.reason),view=response.data.cards[0].aiMatch;
    assert.equal(row.result_source,'partner_failed');assert.equal(metadata.failureCode,expected);assert.equal(metadata.version,1);
    assert.ok(Date.parse(metadata.retryAt)>=started+300000);assert.ok(Date.parse(metadata.retryAt)<=Date.now()+300000);
    assert.deepEqual(Object.keys(metadata).sort(),['failureCode','retryAt','version']);
    assert.equal(view.status,'failed');assert.equal(view.failureCode,expected);assert.equal(view.autoEligible,false);assert.equal(view.score,null);assert.equal(view.retryAt,metadata.retryAt);
    assert.equal(response.data.failureCode,expected);assert.doesNotMatch(JSON.stringify(response),/PRIVATE_PHONE|DO_NOT_STORE|secret-provider-body/);
    await f.run();assert.equal(f.calls.length,1);
  }
});

test('invalid model output is distinguished from transport failure and never supplies a fake score',async t=>{
  for(const content of ['not-json','{}','{"scores":[{"index":0,"score":"80","reason":"資料看來相當適合合作。"}]}','{"scores":[{"index":0,"score":80,"reason":"資料看來相當適合合作。"},{"index":0,"score":81,"reason":"重複候選結果不應採用。"}]}']){
    const f=fixture(t);f.add('NEW');f.respond(()=>({choices:[{message:{content}}]}));
    const response=await f.run(),view=response.data.cards[0].aiMatch;
    assert.equal(response.data.processed,0);assert.equal(view.score,null);assert.equal(view.status,'failed');assert.equal(view.failureCode,'invalid_response');
    assert.equal(JSON.parse(f.sql.prepare('SELECT reason FROM ai_match_pair_cache').get().reason).failureCode,'invalid_response');
  }
});

test('upstream billing or quota errors are provider failures, never a promised daily local-quota reset',async t=>{
  const f=fixture(t);f.add('NEW');f.respond(()=>{throw Error('insufficient_quota billing failed: PRIVATE_UPSTREAM_BODY');});
  const before=Date.now(),response=await f.run(),view=response.data.cards[0].aiMatch;
  assert.equal(view.status,'failed');assert.equal(view.failureCode,'provider');assert.ok(Date.parse(view.retryAt)>=before+300000);assert.ok(Date.parse(view.retryAt)<=Date.now()+300000);
  assert.doesNotMatch(JSON.stringify(response),/08:00|PRIVATE_UPSTREAM_BODY|billing|insufficient_quota/);
});

test('old limited and quota-metadata rows unlock immediately on read and can acquire a lease without touching valid scores or quota KV',async t=>{
  for(const source of ['partner_limited','partner_failed']){
    const f=fixture(t);f.add('OLD');f.cache('OLD',{score:0,source:'rules'});f.add('NEW');
    f.cache('NEW',{key:PROFILE_KEY,source,score:0,date:new Date().toISOString().slice(0,19).replace('T',' ')});
    f.sql.prepare('UPDATE ai_match_pair_cache SET reason=? WHERE candidate_card_row_id=?').run(JSON.stringify({version:1,failureCode:'quota',retryAt:'2099-01-01T00:00:00.000Z'}),'NEW');
    const old=f.sql.prepare('SELECT * FROM ai_match_pair_cache WHERE candidate_card_row_id=?').get('OLD'),before=f.sql.prepare('SELECT * FROM ai_match_pair_cache').all();
    const projected=(await f.load()).data[1].aiMatch;
    assert.equal(projected.status,'pending');assert.equal(projected.autoEligible,true);assert.equal(projected.failureCode,'');assert.equal(projected.retryAt,'');assert.equal(projected.score,null);
    assert.deepEqual(f.sql.prepare('SELECT * FROM ai_match_pair_cache').all(),before,'Reading never clears cache rows or quotas');
    f.options.env.ACTMASTER_KV={get(){throw Error('must not read daily quota');},put(){throw Error('must not reset daily quota');},delete(){throw Error('must not delete daily quota');}};
    const recovered=await f.run();assert.equal(recovered.data.processed,1);assert.equal(recovered.data.cards[0].aiMatch.score,0);assert.equal(recovered.data.cards[1].aiMatch.score,76);assert.equal(f.calls.length,1);
    assert.deepEqual(f.sql.prepare('SELECT * FROM ai_match_pair_cache WHERE candidate_card_row_id=?').get('OLD'),old);
    assert.equal(f.sql.prepare('SELECT result_source FROM ai_match_pair_cache WHERE intent_hash=?').get(PROFILE_KEY).result_source,'ai');
  }
});

test('retired quota metadata cannot bypass another request active processing lease',async t=>{
  const f=fixture(t);f.add('LEASED');f.cache('LEASED',{key:PROFILE_KEY,source:'partner_processing',score:0,date:new Date().toISOString().slice(0,19).replace('T',' ')});
  f.sql.prepare('UPDATE ai_match_pair_cache SET reason=?').run(JSON.stringify({version:1,lease:'OTHER_REQUEST',failureCode:'quota',retryAt:new Date(Date.now()+120000).toISOString()}));
  const before=f.sql.prepare('SELECT * FROM ai_match_pair_cache').all(),response=await f.run();assert.equal(response.data.processed,0);assert.equal(response.data.cards[0].aiMatch.status,'processing');assert.equal(f.calls.length,0);assert.deepEqual(f.sql.prepare('SELECT * FROM ai_match_pair_cache').all(),before);
});

test('legacy failed cache remains compatible; processing metadata exposes a deadline but never its lease',async t=>{
  const f=fixture(t);f.add('LEGACY');f.cache('LEGACY',{key:PROFILE_KEY,source:'partner_failed',score:0,date:new Date().toISOString().slice(0,19).replace('T',' ')});
  const before=f.sql.prepare('SELECT * FROM ai_match_pair_cache').all(),legacy=(await f.load()).data[0].aiMatch;
  assert.equal(legacy.status,'failed');assert.equal(legacy.failureCode,'provider');assert.equal(legacy.score,null);assert.ok(Number.isFinite(Date.parse(legacy.retryAt)));assert.deepEqual(f.sql.prepare('SELECT * FROM ai_match_pair_cache').all(),before);
  f.add('PROCESSING');const retryAt=new Date(Date.now()+120000).toISOString();f.cache('PROCESSING',{key:PROFILE_KEY,source:'partner_processing',score:0,date:new Date().toISOString().slice(0,19).replace('T',' ')});
  f.sql.prepare('UPDATE ai_match_pair_cache SET reason=? WHERE candidate_card_row_id=?').run(JSON.stringify({version:1,lease:'SECRET_LEASE',retryAt}),'PROCESSING');
  const processing=(await f.load()).data[1].aiMatch;assert.equal(processing.status,'processing');assert.equal(processing.retryAt,retryAt);assert.equal(processing.autoEligible,false);assert.doesNotMatch(JSON.stringify(processing),/SECRET_LEASE/);
});

test('matching never reads or writes daily quota keys, even past 20 or default 50; other AI limits remain enforced',async()=>{
  const source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8'),method=source.match(/^  async checkRateLimit\([\s\S]*?^  }/m)?.[0];assert.ok(method);
  const security=vm.runInNewContext('({'+method+'})',{console});let reads=0,writes=0;
  const full={ACTMASTER_KV:{get:async()=>{reads++;return '1000';},put:async()=>{writes++;},delete:async()=>{throw Error('must not delete quota');}}};
  for(let i=0;i<55;i++)assert.equal(await security.checkRateLimit('SYNTHETIC','matchmakeContacts',full,'user'),true);
  assert.equal(reads,0);assert.equal(writes,0);assert.equal(await security.checkRateLimit('SYNTHETIC','generateCardCopy',full,'user'),false);assert.equal(reads,1);
  assert.equal(await security.checkRateLimit('SYNTHETIC','recognizeCardWithGPT4o',full,'user'),false);assert.equal(reads,2);assert.equal(writes,0);
  let last;const available={ACTMASTER_KV:{get:async()=> '4',put:async(...args)=>{last=args;}}};assert.equal(await security.checkRateLimit('SYNTHETIC','generateCardCopy',available,'user'),true);assert.match(last[0],/^RL_generateCardCopy_SYNTHETIC_/);assert.equal(last[1],'5');
});

test('real refresh dispatcher cannot apply a default 50-call quota and does not pass a retired rate limiter',async()=>{
  const source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8'),dispatch=source.match(/^async function dispatchAction\([\s\S]*?^}/m)?.[0];assert.ok(dispatch);let calls=0;
  const context={SecurityModule:{authorizeAction:async()=>({allowed:true,actor:{userId:'SYNTHETIC',token:'verified',role:'user'}}),legacyAuthSkipActions:()=>new Set(),checkRateLimit(){throw Error('refresh must not reach a generic daily quota');}},D1ReadModule:{},AIModule:{},scoreNewCollectionMatches:async options=>{calls++;assert.equal(options.actor.userId,'SYNTHETIC');assert.equal(options.rateLimit,undefined);return {success:true,data:{processed:1,cards:[]}};}};
  vm.createContext(context);vm.runInContext(dispatch+'\nglobalThis.dispatch=dispatchAction;',context);const result=await context.dispatch('refreshCardHarvestMatches',{},new Request('https://local.invalid'),{});assert.equal(result.success,true);assert.equal(calls,1);
});

const frontend=readFileSync(new URL('../js/modules/collection-match-auto.js',import.meta.url),'utf8');
test('frontend does not call AI for existing scores, merges only score fields for new cards',async()=>{
  const old={rowId:'OLD',姓名:'keep',aiMatch:{status:'completed',score:82,source:'ai'}},cards=[old];let calls=0;
  const window={currentUserProfile:{userId:'A'},harvestCards:cards,allCards:cards,fetchAPI:async(action,payload,auth)=>{calls++;assert.equal(action,'refreshCardHarvestMatches');assert.equal(auth,true);assert.equal(Object.keys(payload).length,0);return {success:true,data:{processed:1,cards:[{...old,姓名:'do not replace'},{rowId:'NEW',aiMatch:{status:'completed',score:71,source:'ai'}}]}};}};
  vm.runInNewContext(frontend,{window,document:{hidden:false,getElementById:id=>id==='card-list'?{getClientRects:()=>[{}]}:null},setTimeout:()=>1,clearTimeout(){}});
  await window.ensureCollectedMatchScores();assert.equal(calls,0);
  cards.push({rowId:'NEW',aiMatch:{score:null,autoEligible:true}});await window.ensureCollectedMatchScores();assert.equal(calls,1);
  assert.equal(window.harvestCards[0].姓名,'keep');assert.equal(window.harvestCards[0].aiMatch.score,82);assert.equal(window.harvestCards[1].aiMatch.score,71);
});
test('frontend ignores a response if account switched while waiting',async()=>{
  const original=[{rowId:'NEW',aiMatch:{score:null,autoEligible:true}}];const window={currentUserProfile:{userId:'A'},harvestCards:original,fetchAPI:async()=>{window.currentUserProfile={userId:'B'};return {success:true,data:{processed:1,cards:[{rowId:'NEW',aiMatch:{score:99}}]}};}};
  vm.runInNewContext(frontend,{window,document:{hidden:false,getElementById:id=>id==='card-list'?{getClientRects:()=>[{}]}:null},setTimeout:()=>1,clearTimeout(){}});await window.ensureCollectedMatchScores();assert.equal(window.harvestCards,original);
});

test('actual core API unwrap and timeout contract supports background completion',async()=>{
  const core=readFileSync(new URL('../js/core.js',import.meta.url),'utf8');
  const start=core.indexOf('window.fetchAPI = async function'),end=core.indexOf('// 強效配對機制',start);
  assert.ok(start>0&&end>start);let timeout,posted;
  const window={currentUserProfile:{userId:'A'},harvestCards:[{rowId:'NEW',aiMatch:{score:null,autoEligible:true}}]};
  const context=vm.createContext({window,document:{hidden:false,getElementById:id=>id==='card-list'?{getClientRects:()=>[{}]}:null},console,AbortController,Config:{WORKER_URL:'https://local.invalid'},setTimeout:(_fn,ms)=>{timeout=ms;return 1;},clearTimeout(){},liff:{isLoggedIn:()=>true,getAccessToken:()=> 'test-token'},fetch:async(_url,init)=>{posted=JSON.parse(init.body);return {ok:true,json:async()=>({success:true,data:{processed:1,cards:[{rowId:'NEW',aiMatch:{status:'completed',score:76,source:'ai'}}]}})};}});
  vm.runInContext(core.slice(start,end),context);vm.runInContext(frontend,context);await window.ensureCollectedMatchScores();
  assert.equal(timeout,45000);assert.equal(posted.payload.lineAccessToken,'test-token');assert.equal(posted.payload.clientOpenAIKey,undefined);
  assert.equal(window.harvestCards[0].aiMatch.score,76);
});
