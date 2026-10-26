import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {consumeShopKeywords,signRemainingShopEvents} from '../worker/store-line-keywords.mjs';
import {consumeIslandVideoKeywords,saveIslandVideoCardCopy} from '../worker/island-video-card.mjs';
import {personalShareLink} from '../worker/island-entry.mjs';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32);
const legacy=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
const event=(message='人脈島',extra={})=>({type:'message',source:{type:'user',userId:A},replyToken:'synthetic-token-'+message,message:{type:'text',text:message},...extra});
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec("CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,name TEXT,role TEXT,network_id TEXT,referrer_id TEXT);CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,custom_config TEXT);");
 sql.exec(readFileSync(new URL('../migrations/0076_island_video_card_copies.sql',import.meta.url),'utf8'));
 sql.prepare("INSERT INTO users VALUES('a',?,'合成A','user','network-a','admin'),('b',?,'合成B','user','network-b','admin')").run(A,B);
 sql.exec("INSERT INTO card_contacts VALUES('personal-video','PRIVATE_ORIGINAL_VIDEO'),('personal-static','PRIVATE_ORIGINAL_STATIC')");
 const queries=[],writes=[];
 const stmt=(query,args=[])=>({bind(...values){return stmt(query,values);},async first(){queries.push(query);return sql.prepare(query).get(...args)||null;},async all(){queries.push(query);return{success:true,results:sql.prepare(query).all(...args)};},query,args});
 const db={prepare:stmt,withSession(){return this;},async batch(list){sql.exec('BEGIN');try{const results=list.map(s=>{writes.push(s.query);return{success:true,meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}};});sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return{sql,queries,writes,env:{ACTMASTER_DB:db,LINE_CHANNEL_SECRET:'ISOLATED_HMAC_SECRET'},db};
}
function harness(){
 const replies=[],forward=[],gas=[],saved=[],noop={reply:async()=>false};
 const method=legacy.slice(legacy.indexOf('  async handleWebhook(request, env, ctx) {'),legacy.indexOf('  async isAiPaused(env, threadId) {'));
 const handler=vm.runInNewContext('({'+method+'})',{Response,JSON,console,consumeShopKeywords,signRemainingShopEvents,consumeIslandVideoKeywords,personalShareLink,LineOAMyVideoKeywordModule:noop,LineOACardCoolKeywordModule:noop,ReferralFriendKeywordModule:noop,LineOAStoreSearchKeywordModule:noop,LineOAKeywordRuleModule:{replyPayload:async()=>null}});
 Object.assign(handler,{text:v=>String(v||'').trim(),consumeMyCardEvents:async e=>e,ensure:async()=>{},verifySignature:async(raw,sig,env)=>sig===await signRemainingShopEvents(raw,env.LINE_CHANNEL_SECRET),saveEvent:async(_,e)=>saved.push(e),followPointOnboardingJob:async()=>{},replyLine:async p=>{replies.push(p);return{success:true};},forwardToSecondSystem:async(raw,sig)=>{forward.push({raw,sig});return{success:true};},replySimpleMyCard:async()=>false,filterAutoReplyPayload:async raw=>raw,forwardToGas:async raw=>{gas.push(raw);return{success:true};},normalizeReplyPayload:()=>null});
 return{handler,replies,forward,gas,saved};
}
async function send(h,f,body,signature){
 const sig=signature??await signRemainingShopEvents(body,f.env.LINE_CHANNEL_SECRET),jobs=[];
 const r=await h.handler.handleWebhook(new Request('https://island.test/line-webhook',{method:'POST',headers:{'x-line-signature':sig},body}),f.env,{waitUntil:p=>jobs.push(p)});await Promise.all(jobs);return r;
}
test('signed island keyword uses sender saved copy and never forwards its reply token',async t=>{
 const f=fixture(t),h=harness();await saveIslandVideoCardCopy(f.db,A,{title:'A的產業合作',desc:'尋找跨業合作\n先到人脈島認識彼此',revision:0,requestKey:crypto.randomUUID()});
 const before=f.sql.prepare('SELECT * FROM card_contacts').all(),count=f.writes.length;
 assert.equal((await send(h,f,JSON.stringify({events:[event()]}))).status,200);
 assert.equal(h.replies.length,1);assert.equal(h.replies[0].messages.length,1);const message=h.replies[0].messages[0];
 assert.equal(message.contents.hero.type,'video');assert.equal(message.contents.hero.aspectRatio,'9:16');assert.equal(message.contents.size,'mega');assert.equal(message.contents.body.contents[0].text,'A的產業合作');
 const join=new URL(message.contents.footer.contents[0].action.uri);assert.equal(join.searchParams.get('ref'),A);assert.equal(join.searchParams.get('net'),'network-a');
 assert.equal(h.forward.length,0);assert.equal(h.gas.length,0);assert.equal(h.saved.length,1);assert.equal(f.writes.length,count);assert.deepEqual(f.sql.prepare('SELECT * FROM card_contacts').all(),before);
});
test('mixed batches preserve other events and sign only remaining bytes',async t=>{
 const f=fixture(t),h=harness(),other=event('會員打卡',{replyToken:'mother-token',source:{type:'user',userId:B}}),body=JSON.stringify({destination:'channel',events:[event(),other]});
 await send(h,f,body);assert.equal(h.replies.length,1);assert.equal(h.forward.length,1);assert.deepEqual(JSON.parse(h.forward[0].raw).events,[other]);assert.equal(h.forward[0].sig,await signRemainingShopEvents(h.forward[0].raw,f.env.LINE_CHANNEL_SECRET));assert.equal(h.gas[0],h.forward[0].raw);assert.ok(!h.forward[0].raw.includes('synthetic-token-人脈島'));
});
test('invalid signature, standby and duplicate token cannot create second reply or copies',async t=>{
 const f=fixture(t),h=harness(),body=JSON.stringify({events:[event()]});assert.equal((await send(h,f,body,'invalid')).status,401);assert.equal(f.queries.length,0);assert.equal(h.replies.length,0);assert.equal(h.saved.length,0);
 await send(h,f,JSON.stringify({events:[event('人脈島',{mode:'standby'}),event(),event()]}));assert.equal(h.replies.length,1);assert.equal(h.forward.length,0);assert.equal(h.gas.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM island_video_card_copies').get().n,0);
});
test('group and error replies remain claimed without exposing another personal copy',async t=>{
 const f=fixture(t),h=harness();await saveIslandVideoCardCopy(f.db,A,{title:'PRIVATE_PERSONAL_COPY',desc:'PRIVATE_DESCRIPTION',revision:0,requestKey:crypto.randomUUID()});
 await send(h,f,JSON.stringify({events:[event('人脈島',{source:{type:'group',userId:A,groupId:'group'}})]}));assert.equal(h.replies.length,1);assert.equal(h.replies[0].messages[0].type,'text');assert.doesNotMatch(JSON.stringify(h.replies),/PRIVATE_PERSONAL_COPY|network-a|ref=/);
 f.env.ACTMASTER_DB={prepare(){throw Error('isolated service failure');}};await send(h,f,JSON.stringify({events:[event()]}));assert.equal(h.replies.length,2);assert.equal(h.replies[1].messages.length,1);assert.equal(h.forward.length,0);assert.equal(h.gas.length,0);
});
test('natural sentences retain original body, signature and mother path with zero copy reads',async t=>{
 const f=fixture(t),h=harness(),body=JSON.stringify({events:[event('我想去人脈島看看')]},null,2),sig=await signRemainingShopEvents(body,f.env.LINE_CHANNEL_SECRET);
 await send(h,f,body,sig);assert.equal(h.replies.length,0);assert.equal(h.forward[0].raw,body);assert.equal(h.forward[0].sig,sig);assert.equal(h.gas[0],body);assert.equal(f.queries.length,0);
});
