// Actual old/current UI modules, two synthetic accounts and a controlled clock.
// All API traffic is handled in this process. Never contacts LINE or production.
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';

const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, '../member-chat-latency-preview'); mkdirSync(output, {recursive:true});
const baselineRef = process.env.CHAT_LATENCY_BASELINE_REF || '08de94d4191f9289b067a65b84c6942161c74fa1';
const baseline = process.env.CHAT_LATENCY_BASELINE_FILE ? readFileSync(process.env.CHAT_LATENCY_BASELINE_FILE, 'utf8') : execFileSync('git', ['show', `${baselineRef}:js/modules/member-chat.js`], {cwd:root, encoding:'utf8'});
const current = readFileSync(join(root, 'js/modules/member-chat.js'), 'utf8');
assert.match(baseline, /view === 'chat' \? 8000 : 15000/, 'benchmark must use the actual pre-change 8s module');
const ROOM = '10000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const owners = {a:'U'+'a'.repeat(32), b:'U'+'b'.repeat(32)};
const browser = await chromium.launch({channel:'chrome', headless:true});
const checks = [], metrics = [], errors = [], forbidden = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function pass(label) { checks.push(label); console.log('PASS '+label); }

async function fixture({source=current, readDelay=0, seed=true, settings={}}={}) {
  const contexts = [];
  const server = {rows:seed?[{seq:1,actor:'a',body:'先前的合成訊息',clientId:'seed',room:ROOM}]:[], calls:[], reads:[], sent:[], nonce:new Map(), getFailures:{a:[],b:[]}, readFailures:{a:[],b:[]}, dropNextSend:false};
  let seq = seed?1:0;
  function add(actor, body, room=ROOM) { const row={seq:++seq,actor,body,clientId:'fixture-'+seq,room};server.rows.push(row);return row; }
  function handle(actor, path, method, body, at) {
    const url=new URL(path,'https://fixture.invalid'), call={actor,path:url.pathname,query:url.search,method,body,at};server.calls.push(call);
    const ok=data=>({status:200,body:{success:true,...data}});
    if(url.pathname==='/v1/member-chat/me'&&method==='GET')return ok({accepting:true,notifications:false});
    if(url.pathname==='/v1/member-chat/threads'&&method==='GET')return ok({items:[ROOM,OTHER].map(id=>({id,name:'合成對話方',preview:'合成對話',createdAt:'2026-10-26T00:00:00Z',unread:1})),next:null});
    const match=url.pathname.match(/^\/v1\/member-chat\/threads\/([^/]+)\/(messages|read)$/);
    assert.ok(match,'unexpected synthetic endpoint '+method+' '+path);
    const room=match[1];assert.ok([ROOM,OTHER].includes(room));
    if(match[2]==='read'&&method==='POST') {
      server.reads.push(call); const status=server.readFailures[actor].shift()||200;
      return status===200?ok({}):{status,body:{success:false,error:'合成已讀失敗'}};
    }
    assert.equal(match[2],'messages');
    if(method==='GET') {
      const status=server.getFailures[actor].shift()||200;
      if(status!==200)return {status,body:{success:false,error:'合成接收失敗'}};
      const after=Number(url.searchParams.get('after')||0),before=Number(url.searchParams.get('before')||Infinity);
      return ok({items:server.rows.filter(row=>row.room===room&&row.seq>after&&row.seq<before).map(row=>({seq:row.seq,body:row.body,mine:row.actor===actor,read:false,createdAt:'2026-10-26T00:00:00Z'})),peer:{name:'合成對話方'},lastRead:0,more:false,blocked:false,blockedByMe:false});
    }
    assert.equal(method,'POST'); assert.ok(body.clientId); assert.equal(typeof body.body,'string'); server.sent.push(call);
    const key=actor+':'+body.clientId;let row=server.nonce.get(key);
    if(!row){row=add(actor,body.body,room);server.nonce.set(key,row);}
    const result=ok({item:{seq:row.seq,body:row.body,mine:true,read:false,createdAt:'2026-10-26T00:00:00Z'}});
    if(server.dropNextSend){server.dropNextSend=false;result.drop=true;}return result;
  }
  const pages=[];
  async function page(actor='b', extra={}) {
    const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
    const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));
    await p.clock.install({time:new Date('2026-10-26T00:00:00Z')});
    await p.clock.pauseAt(new Date('2026-10-26T00:00:01Z'));
    await p.exposeFunction('__syntheticAPI',(path,method,body,at)=>handle(actor,path,method,body,at));
    const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><button id="open">開啟合成對話</button><output id="toast"></output><script>
      window.currentUserProfile={userId:${JSON.stringify(owners[actor])}};window.testToken=${JSON.stringify(actor)};window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken};window.showToast=t=>document.querySelector('#toast').textContent=t;
      window.hiddenForTest=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.hiddenForTest});window.badgeRefreshes=0;window.refreshMemberChatUnread=()=>window.badgeRefreshes++;
      window.transport={delay:180,readDelay:${actor==='b'?readDelay:0},holdRead:false,holdGet:false,holdSend:false,ignoreAbort:false,...${JSON.stringify(settings)},...${JSON.stringify(extra)}};
      window.syntheticNow=()=>Date.now()-Date.parse('2026-10-26T00:00:00Z');window.calls=[];window.held=[];window.active={get:0,read:0,send:0};window.maxActive={get:0,read:0,send:0};window.appeared=[];
      window.release=kind=>{window.transport['hold'+kind[0].toUpperCase()+kind.slice(1)]=false;for(const g of window.held.filter(g=>g.kind===kind))g.resolve();window.held=window.held.filter(g=>g.kind!==kind);};
      window.releaseOne=kind=>{const index=window.held.findIndex(g=>g.kind===kind);if(index<0)throw Error('No held '+kind);window.held.splice(index,1)[0].resolve();};
      new MutationObserver(()=>{for(const node of document.querySelectorAll('.mc-message'))if(!window.appeared.some(row=>row.seq===Number(node.dataset.seq)))window.appeared.push({seq:Number(node.dataset.seq),at:window.syntheticNow()});}).observe(document.body,{subtree:true,childList:true});
      window.fetch=async(url,options={})=>{
        const u=new URL(url,location.href);if(u.origin!=='https://fixture.invalid')throw Error('Unexpected API origin');const method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
        const kind=u.pathname.endsWith('/read')?'read':u.pathname.endsWith('/messages')?(method==='GET'?'get':'send'):null;
        const call={path:u.pathname,query:u.search,method,body,at:window.syntheticNow(),kind,done:null,aborted:false};window.calls.push(call);if(kind){window.active[kind]++;window.maxActive[kind]=Math.max(window.maxActive[kind],window.active[kind]);}
        let rejectAbort;const abort=new Promise((_,reject)=>{rejectAbort=reject;});const aborted=()=>{call.aborted=true;if(!window.transport.ignoreAbort)rejectAbort(new DOMException('Aborted','AbortError'));};options.signal?.addEventListener('abort',aborted,{once:true});
        try{return await Promise.race([(async()=>{const reply=await window.__syntheticAPI(u.pathname+u.search,method,body,call.at);await new Promise(r=>setTimeout(r,window.transport.delay+(kind==='read'?window.transport.readDelay:0)));if(kind&&window.transport['hold'+kind[0].toUpperCase()+kind.slice(1)])await new Promise(resolve=>window.held.push({kind,resolve}));if(reply.drop)throw new TypeError('Synthetic lost response');call.done=window.syntheticNow();return new Response(JSON.stringify(reply.body),{status:reply.status,headers:{'Content-Type':'application/json'}});})(),abort]);}
        finally{options.signal?.removeEventListener('abort',aborted);if(kind)window.active[kind]--;}
      };
    </script><script type="module">import {openMemberChat,closeMemberChat} from '/js/modules/member-chat.js';window.openChat=(id=${JSON.stringify(ROOM)})=>openMemberChat({base:'https://fixture.invalid',threadId:id});window.closeChat=closeMemberChat;document.querySelector('#open').onclick=()=>window.openChat();</script></body></html>`;
    await p.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1'&&u.pathname==='/'){await route.fulfill({contentType:'text/html',body:html});return;}if(u.origin==='http://127.0.0.1'&&['/js/modules/member-chat.js','/js/modules/member-chat-popups.js','/js/modules/member-chat-line-contact.js','/css/member-chat.css'].includes(u.pathname)){await route.fulfill({contentType:u.pathname.endsWith('.css')?'text/css':'text/javascript',body:u.pathname==='/js/modules/member-chat.js'?source:readFileSync(join(root,u.pathname),'utf8')});return;}forbidden.push(route.request().url());await route.abort();});
    await p.goto('http://127.0.0.1/');await p.locator('#open').click();return p;
  }
  return {server,pages,page,add,async close(){for(const p of pages)if(!p.isClosed())await p.evaluate(()=>{for(const kind of ['read','get','send'])window.release(kind);window.closeChat?.();});await Promise.all(contexts.map(context=>context.close()));}};
}

async function flush(f){await Promise.all(f.pages.filter(p=>!p.isClosed()).map(p=>p.evaluate(()=>Promise.resolve())));await pause(4);}
async function tick(f,ms,step=100){for(let done=0;done<ms;done+=step){await flush(f);await Promise.all(f.pages.filter(p=>!p.isClosed()).map(p=>p.clock.runFor(Math.min(step,ms-done))));}await flush(f);}
async function calls(p,kind){return p.evaluate(kind=>window.calls.filter(row=>!kind||row.kind===kind),kind);}
async function count(p,seq){return p.locator(`.mc-message[data-seq="${seq}"]`).count();}
async function send(p,body){await p.locator('#mc-body').fill(body);await p.locator('.mc-compose button').click();}
async function until(f,predicate,max=16000){for(let time=0;time<=max;time+=100){if(await predicate())return;await tick(f,100);}throw Error('Synthetic clock condition did not finish within '+max+'ms');}
async function benchmark(source,label,readDelay){const f=await fixture({source,readDelay});try{const a=await f.page('a'),b=await f.page('b');await tick(f,1000);assert.equal(await count(b,1),1);await send(a,'速度比較・'+label);await until(f,async()=>await count(b,2)===1);const posted=(await calls(a,'send'))[0],received=await b.evaluate(()=>window.appeared.find(row=>row.seq===2));assert.ok(posted.done!==null);const result={label,transportMs:180,readExtraDelayMs:readDelay,sendStartMs:posted.at,postConfirmedMs:posted.done,peerVisibleMs:received.at,peerFromSendMs:received.at-posted.at,peerFromConfirmedMs:received.at-posted.done};metrics.push(result);return result;}finally{await f.close();}}

try {
  const before=await benchmark(baseline,'baseline-8s',0),after=await benchmark(current,'current-1s',0);
  const heldBefore=await benchmark(baseline,'baseline-8s-read-held-5s',5000),heldAfter=await benchmark(current,'current-1s-read-held-5s',5000);
  assert.ok(before.peerFromSendMs>=7000,JSON.stringify(before));assert.ok(after.peerFromSendMs<=1500,JSON.stringify(after));assert.ok(heldBefore.peerFromSendMs>=11500,JSON.stringify(heldBefore));assert.ok(heldAfter.peerFromSendMs<=1500,JSON.stringify(heldAfter));
  pass('actual old/current modules with two clients quantify 8s versus 1s reception and remove the extra 5s read-ACK bottleneck');

  {
    const f=await fixture({settings:{holdRead:true}});try{const a=await f.page('a',{holdRead:false}),b=await f.page('b');await tick(f,1000);assert.equal((await calls(b,'read')).length,1);assert.equal(await b.evaluate(()=>window.badgeRefreshes),0);
      await send(a,'已讀尚未回覆時先收到第二則');await tick(f,1500);assert.equal(await count(b,2),1);await send(a,'已讀尚未回覆時再收到第三則');await tick(f,1500);assert.equal(await count(b,3),1);assert.equal((await calls(b,'read')).length,1);assert.equal(await b.evaluate(()=>window.maxActive.read),1);assert.equal(await b.evaluate(()=>window.maxActive.get),1);
      await b.evaluate(()=>window.release('read'));await tick(f,500);const readCalls=await calls(b,'read');assert.deepEqual(readCalls.map(row=>row.body.through),[1,3]);assert.equal(await b.evaluate(()=>window.badgeRefreshes),2);assert.equal(await b.evaluate(()=>window.maxActive.read),1);pass('new messages keep arriving during a held read ACK; highest cursor coalesces into one follow-up with no concurrent reads or GETs');
    }finally{await f.close();}
  }
  {
    const f=await fixture({settings:{holdRead:true}});f.server.readFailures.b.push(500);try{const b=await f.page('b');await tick(f,1000);await b.evaluate(()=>window.release('read'));await tick(f,100);assert.equal(await b.evaluate(()=>window.badgeRefreshes),0);assert.equal((await calls(b,'read')).length,1);await tick(f,1300);assert.equal((await calls(b,'read')).length,2);assert.equal(await b.evaluate(()=>window.badgeRefreshes),1);pass('failed read ACK never refreshes the unread badge and retries on the next successful receive instead of immediately looping');}finally{await f.close();}
  }
  {
    const f=await fixture();try{const a=await f.page('a');await tick(f,1000);await a.evaluate(()=>window.transport.holdSend=true);await send(a,'慢速傳送確認');f.add('b','傳送尚未確認時的對方回覆');await tick(f,1500);assert.equal(await count(a,3),1);assert.equal(await count(a,2),1,'the poll may confirm an already committed local send');assert.match(await a.locator('.mc-status').innerText(),/傳送中/);assert.equal(await a.locator('.mc-compose button').isDisabled(),true);await a.evaluate(()=>window.release('send'));await tick(f,100);assert.equal(await a.locator('#mc-body').inputValue(),'');assert.equal(await a.locator('.mc-message[data-seq="2"]').count(),1);pass('receiving continues during a slow send, preserves the sending status and merges the confirmed send without duplication');}finally{await f.close();}
  }
  {
    const f=await fixture({settings:{holdGet:true}});try{const a=await f.page('a');await tick(f,500);await a.evaluate(()=>window.release('get'));await tick(f,500);await a.evaluate(()=>{window.transport.holdGet=true;window.transport.holdSend=true;});await tick(f,1300);assert.equal(await a.evaluate(()=>window.active.get),1);await send(a,'伺服器確認後直接顯示');await tick(f,500);assert.equal(await count(a,2),0,'unconfirmed transport must not invent a sent bubble');assert.match(await a.locator('.mc-status').innerText(),/傳送中/);await a.evaluate(()=>window.release('send'));await tick(f,100);const sent=(await calls(a,'send')).at(-1),appeared=await a.evaluate(()=>window.appeared.find(row=>row.seq===2));assert.ok(sent.done!==null);assert.ok(appeared&&appeared.at-sent.done<=100);assert.equal(await a.locator('#mc-body').inputValue(),'');assert.equal(await a.evaluate(()=>window.active.get),1);assert.equal(await a.evaluate(()=>window.maxActive.get),1);pass('an unconfirmed send never invents a sent bubble; confirmed POST renders immediately while the receive GET remains held');}finally{await f.close();}
  }
  {
    const f=await fixture();try{const a=await f.page('a');await tick(f,1000);const earlier=f.add('b','本機送出前但尚未同步的回覆');await send(a,'較新本機訊息');await tick(f,200);assert.equal(await count(a,earlier.seq),0);await tick(f,1500);assert.equal(await count(a,earlier.seq),1);assert.deepEqual(await a.locator('.mc-message').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.seq))),[1,2,3]);f.server.dropNextSend=true;await send(a,'回應遺失但只落一筆');await tick(f,200);assert.equal(await a.locator('.mc-compose button').innerText(),'重試傳送');await a.locator('.mc-compose button').click();await tick(f,200);assert.equal(await a.locator('#mc-body').inputValue(),'');const writes=f.server.sent.slice(-2);assert.equal(writes[0].body.clientId,writes[1].body.clientId);await tick(f,1500);assert.equal(await a.locator('.mc-message p',{hasText:'回應遺失但只落一筆'}).count(),1);pass('local send sequence does not skip earlier peer messages; lost-response retries preserve clientId and chronological deduplication');}finally{await f.close();}
  }
  {
    const f=await fixture();try{const b=await f.page('b');await tick(f,1000);f.server.getFailures.b.push(500,500,500,500);const start=(await calls(b,'get')).length;await tick(f,19000);const failed=(await calls(b,'get')).slice(start);assert.ok(failed.length>=4);const gaps=failed.slice(1).map((row,i)=>row.at-failed[i].at);assert.ok(gaps[0]>=2000&&gaps[1]>=4000&&gaps[2]>=8000,JSON.stringify(gaps));await tick(f,9000);const recent=(await calls(b,'get')).slice(-3);assert.ok(recent[2].at-recent[1].at<1600);assert.equal(await b.evaluate(()=>window.maxActive.get),1);pass('receive failures back off 2/4/8 seconds without overlapping GETs and successful reception restores the 1s cadence');}finally{await f.close();}
  }
  for(const mode of ['hidden','close','view','owner','token']) {
    const f=await fixture({settings:{holdRead:true,ignoreAbort:true}});try{const b=await f.page('b');await tick(f,1000);assert.equal((await calls(b,'read')).length,1);f.add('a','離開前尚未接收的合成訊息');
      if(mode==='hidden')await b.evaluate(()=>{window.hiddenForTest=true;document.dispatchEvent(new Event('visibilitychange'));});
      else if(mode==='close')await b.evaluate(()=>window.closeChat());
      else if(mode==='view')await b.locator('[data-action="back"]').click();
      else await b.evaluate(({mode,owner})=>{if(mode==='owner')window.currentUserProfile.userId=owner;else window.testToken='replacement-token';document.dispatchEvent(new Event('visibilitychange'));},{mode,owner:owners.a});
      const readCount=(await calls(b,'read')).length,getCount=(await calls(b,'get')).length;await b.evaluate(()=>window.release('read'));await tick(f,3000);assert.equal((await calls(b,'read')).length,readCount);if(mode!=='view')assert.equal((await calls(b,'get')).length,getCount);assert.equal(await b.evaluate(()=>window.badgeRefreshes),0);if(mode==='hidden'){assert.equal(await count(b,2),0);await b.evaluate(()=>{window.hiddenForTest=false;document.dispatchEvent(new Event('visibilitychange'));});await tick(f,500);assert.equal(await count(b,2),1);}else if(mode==='view')assert.equal(await b.locator('.mc-compose').isVisible(),false);else assert.equal(await b.locator('.member-chat').count(),0);pass(mode+' invalidates old read work, prevents extra acknowledgements and avoids stale private UI or unread updates');
    }finally{await f.close();}
  }
  {
    const f=await fixture({settings:{holdRead:true,ignoreAbort:true}});try{const b=await f.page('b');await tick(f,1000);await b.locator('[data-action="back"]').click();await tick(f,300);f.add('a','新對話的第一則',OTHER);await b.locator(`[data-room="${OTHER}"]`).click();await tick(f,400);const newRead=(await calls(b,'read')).at(-1);assert.ok(newRead.path.includes(OTHER));await b.evaluate(()=>window.releaseOne('read'));await tick(f,100);f.add('a','新對話合併的下一則',OTHER);await tick(f,1500);assert.equal((await calls(b,'read')).length,2,'old finally must not clear the new read flight');assert.equal(await b.evaluate(()=>window.badgeRefreshes),0);await b.evaluate(()=>window.release('read'));await tick(f,500);const allReads=await calls(b,'read');assert.deepEqual(allReads.map(row=>[row.path,row.body.through]),[[`/v1/member-chat/threads/${ROOM}/read`,1],[`/v1/member-chat/threads/${OTHER}/read`,2],[`/v1/member-chat/threads/${OTHER}/read`,3]]);assert.equal(await b.evaluate(()=>window.badgeRefreshes),2);assert.equal(await b.locator('.mc-message p',{hasText:'新對話合併的下一則'}).count(),1);pass('a late old-room ACK cannot clear a new-room read flight in the same modal or discard its coalesced latest cursor');}finally{await f.close();}
  }
  {
    const f=await fixture();try{const b=await f.page('b');await tick(f,1000);await b.evaluate(()=>window.transport.holdGet=true);await tick(f,1300);assert.equal(await b.evaluate(()=>window.held.filter(row=>row.kind==='get').length),1);await b.locator('[data-action="back"]').click();await tick(f,300);await b.evaluate(()=>window.transport.holdGet=false);f.add('a','新聊天室維持原來接收排程',OTHER);await b.locator(`[data-room="${OTHER}"]`).click();await tick(f,400);const first=(await calls(b,'get')).find(row=>row.path.includes(OTHER));assert.ok(first.done!==null);await tick(f,300);await b.evaluate(()=>window.releaseOne('get'));await tick(f,1200);const roomCalls=(await calls(b,'get')).filter(row=>row.path.includes(OTHER));assert.ok(roomCalls.length>=2);assert.ok(roomCalls[1].at-first.done>=1000&&roomCalls[1].at-first.done<=1100,JSON.stringify(roomCalls));pass('a late poll from the old room cannot cancel or postpone the new room receive timer');}finally{await f.close();}
  }
  for(const mode of ['close','token']) {
    const f=await fixture();try{const a=await f.page('a');await tick(f,1000);await a.evaluate(()=>{window.transport.holdSend=true;window.transport.holdGet=true;window.transport.ignoreAbort=true;});await send(a,'不向離開後的舊畫面回填');await tick(f,300);if(mode==='close')await a.evaluate(()=>window.closeChat());else await a.evaluate(()=>{window.testToken='changed-token';document.dispatchEvent(new Event('visibilitychange'));});await a.evaluate(()=>window.release('send'));await tick(f,2000);assert.equal(await a.locator('.member-chat').count(),0);assert.equal(f.server.sent.length,1);assert.equal(f.server.rows.filter(row=>row.body==='不向離開後的舊畫面回填').length,1);pass('a delayed POST confirmation after '+mode+' cannot restore private UI or automatically resend the message');}finally{await f.close();}
  }
  assert.deepEqual(forbidden,[]);assert.deepEqual(errors,[]);
  const report={result:'PASS',baselineRef,checks,metrics,outsideRequests:forbidden,errors,productionMessages:0};writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} catch(error) {writeFileSync(join(output,'failure.json'),JSON.stringify({checks,metrics,error:error.stack,errors,forbidden},null,2));throw error;} finally {await browser.close();}
