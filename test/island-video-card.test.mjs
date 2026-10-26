import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleIslandVideoCard,readIslandVideoCardCopy,saveIslandVideoCardCopy,consumeIslandVideoKeywords,isIslandVideoKeyword} from '../worker/island-video-card.mjs';
import {peopleIslandCardEntryUrl,peopleIslandVideoConfig,buildPeopleIslandVideoFlex,PEOPLE_ISLAND_VIDEO,PEOPLE_ISLAND_POSTER} from '../js/modules/people-island-flex.mjs';
const uid=n=>'U'+String(n).repeat(32),A=uid('a'),B=uid('b'),OLD=uid('1'),NEW=uid('2'),GUEST=uid('c');
const proposal=(extra={})=>({title:'我的人脈島',desc:'分享專長，認識新的合作夥伴。\n完成註冊與審核後開始交流。',revision:0,requestKey:crypto.randomUUID(),...extra});
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,role TEXT,name TEXT);
  CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
  CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,owner_uid TEXT,source_type TEXT,custom_config TEXT);
  INSERT INTO card_contacts VALUES('original-video','${A}','video_profile','{"videoUrl":"https://example.test/original.mp4","title":"個人原影片","desc":"既有個人說明"}');`);
 sql.exec(readFileSync(new URL('../migrations/0076_island_video_card_copies.sql',import.meta.url),'utf8'));
 for(const [id,role]of [[A,'user'],[B,'store']])sql.prepare('INSERT INTO users VALUES(?,?,?,?)').run('member-'+id,id,role,'合成會員');
 const requests=[],writes=[];let hook=null,provider=null;
 const prepare=(query,args=[])=>({query,args,bind(...values){return prepare(query,values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async run(){writes.push(query);return {success:true,meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}});
 const db={prepare,withSession(){return this;},async batch(statements){hook?.();sql.exec('BEGIN');try{const out=statements.map(s=>{writes.push(s.query);return {success:true,meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}};});sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const fetcher=async(url,options)=>{requests.push({url,options});assert.equal(url,'https://api.line.me/v2/profile');assert.equal(options.redirect,'manual');assert.ok(options.signal instanceof AbortSignal);if(provider)return provider(url,options);const id={a:A,b:B,old:OLD,new:NEW,guest:GUEST}[options.headers.Authorization.slice(7)];return id?Response.json({userId:id}):Response.json({}, {status:401});};
 const env={ACTMASTER_DB:db};
 const snapshot=()=>JSON.stringify(['users','user_identity_links','card_contacts'].map(table=>sql.prepare('SELECT * FROM '+table).all()));
 const api=async({method='GET',token='a',data,query='',contentType='application/json'}={})=>{const response=await handleIslandVideoCard(new Request('https://test/v1/island-video-card'+query,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':contentType}:{})},body:data?JSON.stringify(data):undefined}),env,fetcher);return {status:response.status,...await response.json()};};
 return {sql,db,env,api,requests,writes,snapshot,hook(fn){hook=fn;},provider(fn){provider=fn;}};
}
test('GET uses fresh LINE identity for own defaults without any writes or membership gates',async t=>{
 const f=fixture(t),before=f.snapshot();
 for(const token of ['a','b','guest']){const r=await f.api({token});assert.equal(r.status,200);assert.deepEqual(r.card,{title:peopleIslandVideoConfig().title,desc:peopleIslandVideoConfig().desc,revision:0});}
 assert.equal(f.snapshot(),before);assert.equal(f.writes.length,0);assert.equal(f.requests.length,3);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM island_video_card_copies').get().n,0);
});
test('personal title/desc persist and reload, with A/B isolation and all original cards unchanged',async t=>{
 const f=fixture(t),before=f.snapshot(),data=proposal();
 const saved=await f.api({method:'PUT',data});assert.equal(saved.status,200);assert.deepEqual(saved.card,{title:data.title,desc:data.desc,revision:1});
 assert.deepEqual((await f.api()).card,saved.card);assert.equal((await f.api({token:'b'})).card.revision,0);
 assert.equal((await f.api({method:'PUT',token:'b',data:proposal({title:'店家自己的介紹'})})).status,200);
 assert.equal((await f.api()).card.title,data.title);assert.equal(f.snapshot(),before);
});
test('unregistered valid LINE users can edit campaign text without acquiring generic video or social authority',async t=>{
 const f=fixture(t),before=f.snapshot(),saved=await f.api({method:'PUT',token:'guest',data:proposal({title:'來認識我'})});
 assert.equal(saved.status,200);assert.equal((await f.api({token:'guest'})).card.title,'來認識我');assert.equal(f.snapshot(),before);
});
test('bounded plain text and strict fields reject URL/media/owner or membership injection',async t=>{
 const f=fixture(t),before=f.snapshot();
 for(const data of [proposal({title:''}),proposal({title:'x'.repeat(81)}),proposal({desc:'x'.repeat(801)}),proposal({desc:'a\u0000b'}),proposal({title:'a\nb'}),proposal({owner_uid:B}),proposal({videoUrl:'https://evil.test/a.mp4'}),proposal({role:'admin'}),proposal({revision:-1}),proposal({requestKey:'not-uuid'})])assert.equal((await f.api({method:'PUT',data})).status,400);
 assert.equal((await f.api({query:'?userId='+B})).status,400);assert.equal((await f.api({method:'PUT',data:proposal(),contentType:'text/plain'})).status,415);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM island_video_card_copies').get().n,0);assert.equal(f.snapshot(),before);
});
test('missing, expired, redirected, oversized or invalid LINE profile fails closed',async t=>{
 const f=fixture(t);assert.equal((await f.api({token:''})).status,401);assert.equal((await f.api({token:'bad'})).status,401);
 f.provider(()=>new Response('',{status:302,headers:{Location:'https://evil.test'}}));assert.equal((await f.api()).status,503);
 f.provider(()=>Response.json({userId:'not-a-line-id'}));assert.equal((await f.api()).status,401);
 f.provider(()=>Response.json({userId:A,oversized:'x'.repeat(9000)}));assert.equal((await f.api()).status,503);assert.equal(f.writes.length,0);
});
test('exact UUID replay cannot overwrite later revisions; changed replay and stale tab reject without writes',async t=>{
 const f=fixture(t),data=proposal(),first=await f.api({method:'PUT',data}),n=f.writes.length;
 const replay=await f.api({method:'PUT',data});assert.equal(replay.replayed,true);assert.deepEqual(replay.card,first.card);assert.equal(f.writes.length,n);
 assert.equal((await f.api({method:'PUT',data:{...data,title:'改寫同次請求'}})).status,409);assert.equal((await f.api({method:'PUT',data:proposal()})).status,409);
 assert.equal((await f.api({method:'PUT',data:proposal({revision:1,title:'最新版本'})})).status,200);
 assert.equal((await f.api({method:'PUT',data})).replayed,true);assert.equal((await f.api()).card.title,'最新版本');
});
test('per-operation nonce prevents simultaneous same-version lost update and duplicate command insertion',async t=>{
 const f=fixture(t);await saveIslandVideoCardCopy(f.db,A,proposal());let raced=false;
 f.hook(()=>{if(raced)return;raced=true;f.sql.prepare("UPDATE island_video_card_copies SET title='其他頁最新版本',revision=2,write_nonce='other' WHERE owner_uid=?").run(A);});
 const r=await f.api({method:'PUT',data:proposal({revision:1,title:'過期頁覆寫'})});assert.equal(r.status,409);
 assert.equal((await f.api()).card.title,'其他頁最新版本');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM island_video_card_copy_commands').get().n,1);
});
test('canonical old/new identity uses one copy; conflicts and identity changes cannot write',async t=>{
 const f=fixture(t);await saveIslandVideoCardCopy(f.db,OLD,proposal({title:'移轉前文案'}));
 f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(OLD,NEW);f.sql.prepare("INSERT INTO users VALUES('new-member',?,'user','合成新身分')").run(NEW);
 assert.equal((await f.api({token:'new'})).card.title,'移轉前文案');assert.equal((await f.api({method:'PUT',token:'new',data:proposal({revision:1,title:'同一人新版'})})).status,200);
 assert.equal((await f.api({token:'old'})).card.title,'同一人新版');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM island_video_card_copies').get().n,1);
 f.hook(()=>f.sql.prepare("UPDATE user_identity_links SET status='revoked'").run());
 assert.equal((await f.api({method:'PUT',token:'new',data:proposal({revision:2})})).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM island_video_card_copy_commands').get().n,2);
});
test('copy conflict after identity link never guesses which personal wording to overwrite',async t=>{
 const f=fixture(t);await saveIslandVideoCardCopy(f.db,OLD,proposal({title:'舊登入的文案'}));await saveIslandVideoCardCopy(f.db,NEW,proposal({title:'新登入的文案'}));f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(OLD,NEW);
 assert.equal((await f.api({token:'new'})).status,409);assert.equal((await f.api({method:'PUT',token:'new',data:proposal()})).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM island_video_card_copies').get().n,2);
});
test('a member row ID resembling somebody else LINE UID is not a campaign-copy ownership alias',async t=>{
 const f=fixture(t);await saveIslandVideoCardCopy(f.db,B,proposal({title:'B的私人文案'}));
 f.sql.prepare('UPDATE users SET row_id=? WHERE line_id=?').run(B,A);
 assert.equal((await f.api()).card.revision,0);assert.equal((await f.api({method:'PUT',data:proposal({title:'A自己的文案'})})).status,200);
 assert.equal((await f.api({token:'b'})).card.title,'B的私人文案');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM island_video_card_copies').get().n,2);
});
test('the existing video Flex reads title/desc while retaining fixed 9:16 media and join/share actions',()=>{
 const card=buildPeopleIslandVideoFlex({entryUrl:peopleIslandCardEntryUrl({ref:A,net:'network-a'}),config:{title:'A的活動人脈',desc:'找合作夥伴\n一起交流',videoUrl:'https://evil.test/video.mp4'}});
 assert.equal(card.contents.body.contents[0].text,'A的活動人脈');assert.equal(card.contents.body.contents[1].text,'找合作夥伴\n一起交流');assert.equal(card.contents.hero.url,PEOPLE_ISLAND_VIDEO);assert.equal(card.contents.hero.previewUrl,PEOPLE_ISLAND_POSTER);assert.equal(card.contents.hero.aspectRatio,'9:16');assert.equal(card.contents.size,'mega');assert.equal(card.contents.body.contents[0].wrap,true);assert.equal(card.contents.footer.contents.length,2);
});
test('precise keyword consumes one signed-caller event each, preserving mixed batch and single reply ownership',async t=>{
 const f=fixture(t);await saveIslandVideoCardCopy(f.db,A,proposal({title:'我的合作邀請'}));
 const event=(text,extra={})=>({type:'message',replyToken:'token-'+text,message:{type:'text',text},source:{type:'user',userId:A},...extra});
 const other=event('我想去人脈島看看'),events=[event(' 人脈島 '),other,event('人脈島',{mode:'standby'}),event('人脈島',{source:{type:'group',groupId:'g',userId:B}})],replies=[];
 const before=f.snapshot(),writes=f.writes.length;
 const remaining=await consumeIslandVideoKeywords(events,f.env,payload=>{replies.push(payload);},{personalShareLink:async(db,id)=>({entryUrl:peopleIslandCardEntryUrl({ref:id,net:'own-network'})})});
 assert.deepEqual(remaining,[other]);assert.equal(replies.length,2);assert.equal(replies[0].messages.length,1);assert.equal(replies[0].messages[0].contents.body.contents[0].text,'我的合作邀請');assert.equal(replies[1].messages[0].type,'text');assert.doesNotMatch(JSON.stringify(replies[1]),/我的合作邀請|network|ref=/);
 const edit=new URL(replies[0].messages[0].quickReply.items[0].action.uri);assert.equal(edit.searchParams.get('islandVideoEdit'),'1');assert.equal(edit.searchParams.has('ref'),false);
 assert.equal(new URL(replies[0].messages[0].contents.hero.action.uri).searchParams.get('ref'),A);assert.equal(f.snapshot(),before);assert.equal(f.writes.length,writes);
 assert.equal(isIslandVideoKeyword(event('人 脈島')),false);assert.equal(isIslandVideoKeyword({type:'follow',message:{type:'text',text:'人脈島'}}),false);
});
test('recognized keyword errors remain claimed, with no second reply retry or wrong profile fallback',async t=>{
 const f=fixture(t),event={type:'message',replyToken:'once',message:{type:'text',text:'人脈島'},source:{type:'user',userId:A}};let calls=0;
 const remaining=await consumeIslandVideoKeywords([event],f.env,()=>{calls++;throw Error('unknown LINE outcome');},{personalShareLink:async()=>{throw Error('db failed');}});
 assert.equal(calls,1);assert.deepEqual(remaining,[]);assert.equal(f.writes.length,0);
});
test('duplicate claimed reply tokens in a mixed batch perform one copy load and one reply',async t=>{
 const f=fixture(t),event={type:'message',replyToken:'same-token',message:{type:'text',text:'人脈島'},source:{type:'user',userId:A}},other={...event,replyToken:'other-token',message:{type:'text',text:'其他指令'}};let replies=0,resolves=0;
 const remaining=await consumeIslandVideoKeywords([{...event,mode:'standby'},event,event,other],f.env,()=>{replies++;},{personalShareLink:async()=>{resolves++;return {entryUrl:peopleIslandCardEntryUrl({ref:A})};}});
 assert.deepEqual(remaining,[other]);assert.equal(resolves,1);assert.equal(replies,1);assert.equal(f.writes.length,0);
});
