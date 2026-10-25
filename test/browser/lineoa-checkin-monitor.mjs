// Actual monitor HTML in Chromium. All APIs are intercepted synthetic reads;
// no LINE messages, check-ins, points, click analytics or production calls.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=readFileSync(new URL('../../lineoa-monitor.html',import.meta.url),'utf8');
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),T={a:'line:'+A,b:'line:'+B};
const at='2026-10-25T03:56:01.000Z';
const message=(thread,id,text='合成會員打卡')=>({message_id:id,thread_id:thread,user_id:thread.slice(5),direction:'inbound',message_type:'text',text_content:text,created_at:at});
const card=(thread,id,balance=12857,extra={})=>({message_id:'CHECKIN_MALL:00000000-0000-4000-8000-'+String(id).padStart(12,'0'),thread_id:thread,user_id:thread.slice(5),direction:'outbound',message_type:'flex',event_type:'checkin_mall_card',delivery_status:'accepted',record_source:'checkin_mall_cards',text_content:'合成會員購物金卡片摘要，LINE API已接受',created_at:at,card_preview:{title:'會員購物金',balance,queried_at:at,mother_reply_available:false},...extra});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function waitFor(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Synthetic request did not reach fixture');}
async function fixture({many=false,unauthorized=false,noCredentials=false,allowMetadata=false}={}){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),calls=[],forbidden=[],held=[],heldSaves=[];
 const state={hold:'',holdSave:false,failSave:false,deny:unauthorized,savedNote:'伺服器甲備註',metadata:{status:'open',tags:'',ai_paused:0,opportunity_stage:'new',opportunity_value:0,opportunity_note:'伺服器商機'},rows:{[T.a]:many?Array.from({length:30},(_,i)=>message(T.a,'IN-'+i,'合成甲歷史訊息 '+i)):[message(T.a,'IN-A')],[T.b]:[message(T.b,'IN-B','合成乙對話')]}};
 page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-25T03:56:05Z')});
 await page.addInitScript(noCredentials=>{if(!noCredentials)localStorage.setItem('lineoa_access_token','synthetic-admin-token');window.testHidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});},noCredentials);
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname==='127.0.0.1'){await route.fulfill({contentType:'text/html',body:html});return;}
  if(url.hostname!=='line-engine.fangwl591021.workers.dev'){await route.abort();return;}
  const body=request.postDataJSON();calls.push(body);
  if(body.action==='updateLineOAChatThread'&&allowMetadata){
   if(state.holdSave)await new Promise(r=>heldSaves.push(r));
   if(state.failSave){await route.fulfill({status:503,json:{success:false,error:'合成儲存失敗'}});return;}
   state.savedNote=body.payload.note;state.metadata={status:body.payload.status,tags:(body.payload.tags||[]).join(','),ai_paused:body.payload.aiPaused?1:0,opportunity_stage:body.payload.opportunityStage,opportunity_value:body.payload.opportunityValue,opportunity_note:body.payload.opportunityNote};await route.fulfill({json:{success:true,data:{threads:[],messages:[],selectedThreadId:body.payload.threadId}}});return;
  }
  if(!['getLineOAChatMonitor','getLineOAChatAudience'].includes(body.action)){forbidden.push(body.action);await route.abort();return;}
  if(body.action==='getLineOAChatAudience'){await route.fulfill({json:{success:true,data:{overview:{},interests:[],riskThreads:[],tags:[],pointAudience:{summary:{claimedNotDeducted:0},claimedNotDeducted:[]}}}});return;}
  if(state.deny){await route.fulfill({status:state.logicalDeny?200:403,json:{success:false,error:state.logicalDeny||'合成權限撤銷'}});return;}
  const selected=body.payload.threadId||T.a,threads=[{thread_id:T.a,user_id:A,display_name:'合成甲',last_message_text:'會員打卡',message_count:state.rows[T.a].length,note:state.savedNote,...state.metadata},{thread_id:T.b,user_id:B,display_name:'合成乙',last_message_text:'乙對話',message_count:state.rows[T.b].length,status:'open',note:'伺服器乙備註'}];
  const response={success:true,data:{threads,selectedThreadId:selected,messages:structuredClone(state.rows[selected]||[])}};
  if(state.hold===selected)await new Promise(r=>held.push(r));
  await route.fulfill({json:response}).catch(()=>{});
 });
 await page.goto('http://127.0.0.1/monitor'+(noCredentials?'':'?pt_uid='+A));
 await page.addStyleTag({content:'#chat-messages{height:300px;max-height:300px;overflow:auto}#chat-messages>[data-monitor-message]{margin:14px 0}.flex{display:flex}.justify-end{justify-content:flex-end}#chat-messages p{margin:8px 0}.text-xs{font-size:12px}.whitespace-pre-wrap{white-space:pre-wrap}'});
 if(!unauthorized)await page.getByRole('heading',{name:'合成甲',exact:true}).waitFor();
 const reads=()=>calls.filter(c=>c.action==='getLineOAChatMonitor').length;
 const audienceReads=()=>calls.filter(c=>c.action==='getLineOAChatAudience').length;
 return {page,state,calls,forbidden,reads,audienceReads,waiting:()=>held.length,waitingSave:()=>heldSaves.length,releaseSave(){while(heldSaves.length)heldSaves.shift()();},release(){while(held.length)held.shift()();},async close(){while(held.length)held.shift()();while(heldSaves.length)heldSaves.shift()();assert.deepEqual(forbidden,[]);await context.close();}};
}
try{
 {
  const f=await fixture();
  const pages=[{kind:'wallet',title:'會員購物金',body:'發送當時的內容',heroImageUrl:'',buttons:[{label:'前往商城',target:'mall'},{label:'查看明細',target:'details'}]},
    {kind:'info',title:'<img src=x onerror=alert(1)>',body:'<script>window.__unsafe=1</script> 說明',heroImageUrl:'',buttons:[{label:'逛商城',target:'mall'}]}];
  const preview={title:'會員購物金',balance:12857,queried_at:at,mother_reply_available:false,template_revision:4,theme_color:'#078655',pages};
  f.state.rows[T.a].push(card(T.a,11,12857,{card_preview:preview}));
  await f.page.locator('#refresh-audience').click();await f.page.locator('.checkin-record-page').nth(1).waitFor();
  assert.equal(await f.page.locator('.checkin-record-page').count(),2);assert.match(await f.page.locator('.checkin-record').innerText(),/發送時版本 4・2 頁/);
  assert.equal(await f.page.locator('.checkin-record img, .checkin-record script, .checkin-record a').count(),0);assert.equal(await f.page.evaluate(()=>window.__unsafe),undefined);
  assert.equal(await f.page.locator('.checkin-record button:disabled').count(),3);
  const scroller=f.page.locator('.checkin-record-carousel');
  await scroller.evaluate(node=>{node.scrollLeft=node.clientWidth+10;});
  const scroll=await scroller.evaluate(node=>node.scrollLeft);assert.ok(scroll>0);
  const reads=f.reads();await f.page.clock.fastForward(12001);await waitFor(()=>f.reads()>reads);
  assert.equal(await scroller.evaluate(node=>node.scrollLeft),scroll,'polling must preserve historical carousel position');
  await f.close();console.log('PASS sent carousel snapshot, escaped content, disabled actions and preserved horizontal position');
 }
 {
  const f=await fixture();f.state.rows[T.a].push(card(T.a,12,12857,{card_preview:{title:'會員購物金',balance:12857,queried_at:at,mother_reply_available:false,template_revision:2,theme_color:'red;position:fixed',pages:[{},{}]}}));
  await f.page.locator('#refresh-audience').click();await f.page.locator('.checkin-record').waitFor();
  assert.equal(await f.page.locator('.checkin-record-page').count(),0);assert.match(await f.page.locator('.checkin-record').innerText(),/12,857 元/);
  await f.close();console.log('PASS malformed snapshot falls back to safe legacy balance summary');
 }
 // Accepted, trusted check-in projections get a fixed safe summary, not a
 // generic Flex renderer or live links that could register analytics.
 {
  const f=await fixture();f.state.rows[T.a].push(card(T.a,1),card(T.a,2,0),card(T.a,3,null),card(T.a,4,5,{record_source:'untrusted',text_content:'<img src=x onerror="window.__unsafe=1"> 普通未知Flex'}),card(T.a,5,6,{card_preview:{title:'<svg onload=alert(1)>',balance:6,queried_at:at,mother_reply_available:false}}));
  await f.page.locator('#refresh-audience').click();await f.page.locator('.checkin-record').nth(2).waitFor();assert.equal(await f.page.locator('.checkin-record').count(),3);
  const text=await f.page.locator('#chat-messages').innerText();assert.match(text,/系統/);assert.match(text,/當次查詢購物金/);assert.doesNotMatch(text,/目前可用購物金/);assert.match(text,/12,857 元/);assert.match(text,/0 元/);assert.match(text,/尚未取得餘額，不代表餘額為零/);assert.match(text,/11:56:01/);assert.match(text,/LINE API 已接受；不代表已送達或已讀/);assert.match(text,/母站原文字回覆未取得/);assert.equal(await f.page.locator('#chat-messages img, #chat-messages svg, #chat-messages a').count(),0);
  assert.equal(await f.page.locator('.checkin-record button:disabled').count(),6);assert.equal(await f.page.evaluate(()=>window.__unsafe),undefined);const count=f.calls.length;await f.page.locator('.checkin-record button').first().dispatchEvent('click');assert.equal(f.calls.length,count);assert.equal(new URL(f.page.url()).hostname,'127.0.0.1');assert.equal(f.audienceReads(),2);await f.page.addStyleTag({content:'main{min-width:500px}#chat-messages{width:500px;min-width:500px;height:auto;max-height:none;overflow:visible}.checkin-record{width:350px}'});await f.page.locator('.checkin-record').first().screenshot({path:join(tmpdir(),'lineoa-checkin-monitor-card.png')});await f.close();console.log('PASS trusted accepted preview, zero/unknown balances, Taipei time, escaped fallback, inert preview and real manual conversation refresh');
 }
 // The automatic read reconciles only message nodes: no draft/note/opportunity
 // reset, no lost focus/cursor, no history scroll jump, no implicit send/AI.
 {
  const f=await fixture({many:true});await f.page.locator('#draft-reply').fill('尚未送出的草稿 ABCDE');await f.page.locator('#internal-note').fill('尚未儲存的內部備註');await f.page.locator('#opportunity-stage').selectOption('quoted');await f.page.locator('#opportunity-value').fill('50000');await f.page.locator('#opportunity-note').fill('尚未儲存的商機');await f.page.locator('#thread-search').fill('合成甲');await f.page.locator('#draft-reply').focus();await f.page.locator('#draft-reply').evaluate(e=>e.setSelectionRange(3,8));await f.page.locator('#chat-messages').evaluate(e=>e.scrollTop=50);const oldTop=await f.page.locator('#chat-messages').evaluate(e=>e.scrollTop),before=f.reads();
  f.state.metadata={...f.state.metadata,status:'pending',ai_paused:1,tags:'遠端已更新標籤',opportunity_stage:'payment'};f.state.rows[T.a].push(card(T.a,10));await f.page.clock.fastForward(12001);await f.page.locator('.checkin-record').waitFor();assert.equal(f.reads(),before+1);assert.equal(f.audienceReads(),1);assert.equal(await f.page.locator('#draft-reply').inputValue(),'尚未送出的草稿 ABCDE');assert.equal(await f.page.locator('#internal-note').inputValue(),'尚未儲存的內部備註');assert.equal(await f.page.locator('#opportunity-stage').inputValue(),'quoted');assert.equal(await f.page.locator('#opportunity-value').inputValue(),'50000');assert.equal(await f.page.locator('#opportunity-note').inputValue(),'尚未儲存的商機');assert.equal(await f.page.locator('#thread-search').inputValue(),'合成甲');assert.deepEqual(await f.page.evaluate(()=>({id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd})),{id:'draft-reply',start:3,end:8});assert.ok(Math.abs((await f.page.locator('#chat-messages').evaluate(e=>e.scrollTop))-oldTop)<1);assert.equal(await f.page.locator('#chat-name').innerText(),'合成甲');assert.equal(await f.page.locator('#manual-handoff').innerText(),'恢復 AI 回覆');assert.equal(await f.page.locator('#thread-status-badge').innerText(),'處理中');assert.match(await f.page.locator('#mark-pending').getAttribute('class'),/bg-slate-900/);assert.match(await f.page.locator('#thread-tags').innerText(),/遠端已更新標籤/);assert.equal(await f.page.locator('#opportunity-stage-pill').innerText(),'待付款');
  await f.page.locator('#chat-messages').evaluate(e=>e.scrollTop=e.scrollHeight);f.state.rows[T.a].push(message(T.a,'BOTTOM','合成底部新訊息'));await f.page.clock.fastForward(12001);await f.page.getByText('合成底部新訊息',{exact:true}).waitFor();assert.ok(await f.page.locator('#chat-messages').evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop<2));await f.close();console.log('PASS 12s reads preserve edits/focus/cursor/scroll while updating remote status, tags, AI pause and read-only opportunity badge');
 }
 // Stable DOM nodes also preserve a selection in an unchanged history bubble.
 {
  const f=await fixture();await f.page.locator('[data-monitor-message="IN-A"] .whitespace-pre-wrap').evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(range);});const selected=await f.page.evaluate(()=>getSelection().toString());f.state.rows[T.a].push(card(T.a,11));await f.page.clock.fastForward(12001);await f.page.locator('.checkin-record').waitFor();assert.equal(await f.page.evaluate(()=>getSelection().toString()),selected);await f.close();console.log('PASS appending accepted card preserves selected text in existing message DOM');
 }
 // In-flight A cannot overwrite B selected later, including an old accepted card.
 {
  const f=await fixture();f.state.rows[T.a].push(card(T.a,12));f.state.hold=T.a;await f.page.clock.fastForward(12001);await waitFor(()=>f.waiting()>0);const before=f.reads();await f.page.locator('#thread-list button').filter({hasText:'合成乙'}).click();await f.page.getByRole('heading',{name:'合成乙',exact:true}).waitFor();f.release();await f.page.waitForTimeout(10);assert.equal(await f.page.locator('#chat-name').innerText(),'合成乙');assert.match(await f.page.locator('#chat-messages').innerText(),/合成乙對話/);assert.equal(await f.page.locator('.checkin-record').count(),0);assert.equal(f.reads(),before+1);await f.close();console.log('PASS late A response cannot change B selection or show A card');
 }
 // The save is a synthetic existing user action. Pending background snapshots
 // are aborted; its deliberately stale response is ignored in favor of a read.
 {
  const f=await fixture({allowMetadata:true});f.state.hold=T.a;await f.page.clock.fastForward(12001);await waitFor(()=>f.waiting()>0);const count=f.reads();f.state.hold='';f.state.holdSave=true;await f.page.locator('#internal-note').fill('合成已修改備註');await f.page.locator('#draft-reply').fill('儲存期間不應被覆蓋的草稿');await f.page.locator('#save-thread-meta').click();await waitFor(()=>f.waitingSave()>0);await f.page.clock.fastForward(36000);assert.equal(f.reads(),count);f.state.rows[T.a].push(card(T.a,20));f.releaseSave();await f.page.locator('.checkin-record').waitFor();f.release();await f.page.waitForTimeout(10);assert.equal(f.reads(),count+1);assert.equal(await f.page.locator('#internal-note').inputValue(),'合成已修改備註');assert.equal(await f.page.locator('#draft-reply').inputValue(),'儲存期間不應被覆蓋的草稿');assert.equal(await f.page.locator('.checkin-record').count(),1);await f.close();console.log('PASS metadata save blocks background reads, ignores stale save response, and retains the latest projected card and drafts');
 }
 {
  const f=await fixture({allowMetadata:true});f.state.holdSave=true;await f.page.locator('#save-thread-meta').click();await waitFor(()=>f.waitingSave()>0);await f.page.locator('#thread-list button').filter({hasText:'合成乙'}).click();await f.page.getByRole('heading',{name:'合成乙',exact:true}).waitFor();f.releaseSave();await f.page.waitForTimeout(10);assert.equal(await f.page.locator('#chat-name').innerText(),'合成乙');assert.equal(await f.page.locator('#internal-note').inputValue(),'伺服器乙備註');await f.close();console.log('PASS completing an A save cannot change B selected during the save');
 }
 {
  const f=await fixture({allowMetadata:true});f.state.failSave=true;await f.page.locator('#internal-note').fill('失敗時保留的備註');await f.page.locator('#save-thread-meta').click();await f.page.getByText('合成儲存失敗',{exact:true}).waitFor();assert.equal(await f.page.locator('#internal-note').inputValue(),'失敗時保留的備註');const count=f.reads();await f.page.clock.fastForward(12001);await waitFor(()=>f.reads()===count+1);await f.close();console.log('PASS metadata save errors preserve edits and resume only the read loop');
 }
 {
  const f=await fixture({allowMetadata:true});await f.page.locator('#draft-reply').fill('保存狀態後仍保留這份草稿');await f.page.locator('#mark-closed').click();await f.page.locator('#thread-status-badge').getByText('已處理',{exact:true}).waitFor();assert.match(await f.page.locator('#mark-closed').getAttribute('class'),/bg-slate-900/);await f.page.locator('#custom-tag').fill('合成已儲存標籤');await f.page.locator('#add-tag').click();await f.page.locator('#thread-tags').getByText('合成已儲存標籤',{exact:true}).waitFor();await f.page.locator('#manual-handoff').click();await f.page.locator('#manual-handoff').getByText('恢復 AI 回覆',{exact:true}).waitFor();assert.match(await f.page.locator('#ai-mode-banner').innerText(),/人工接手中/);await f.page.locator('#internal-note').fill('[重要] 合成需求紀錄');await f.page.locator('#opportunity-stage').selectOption('quoted');await f.page.locator('#opportunity-value').fill('40000');await f.page.locator('#opportunity-note').fill('合成已儲存商機');await f.page.locator('#save-opportunity').click();await f.page.locator('#opportunity-stage-pill').getByText('已報價',{exact:true}).waitFor();await f.page.locator('#record-list').getByText('合成需求紀錄',{exact:true}).waitFor();assert.equal(await f.page.locator('#draft-reply').inputValue(),'保存狀態後仍保留這份草稿');assert.equal(await f.page.locator('#opportunity-value').inputValue(),'40000');await f.close();console.log('PASS saved status, tags, AI pause, records and opportunity controls reflect server without replacing reply draft');
 }
 {
  const f=await fixture({allowMetadata:true});f.state.holdSave=true;await f.page.locator('#internal-note').fill('此次提交的備註');await f.page.locator('#save-thread-meta').click();await waitFor(()=>f.waitingSave()>0);await f.page.locator('#internal-note').fill('下一版尚未儲存的備註');await f.page.locator('#opportunity-note').fill('下一版尚未儲存的商機');await f.page.locator('#internal-note').focus();await f.page.locator('#internal-note').evaluate(e=>e.setSelectionRange(2,6));f.releaseSave();await f.page.getByText('聊天室狀態已更新',{exact:true}).waitFor();assert.equal(await f.page.locator('#internal-note').inputValue(),'下一版尚未儲存的備註');assert.equal(await f.page.locator('#opportunity-note').inputValue(),'下一版尚未儲存的商機');assert.deepEqual(await f.page.evaluate(()=>({id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd})),{id:'internal-note',start:2,end:6});await f.close();console.log('PASS edits and cursor made while a save is pending survive its confirmation');
 }
 for(const stop of ['hidden','pagehide','token']){
  const f=await fixture();f.state.hold=T.a;f.state.rows[T.a].push(card(T.a,13));await f.page.clock.fastForward(12001);await waitFor(()=>f.waiting()>0);const count=f.reads();await f.page.evaluate(stop=>{if(stop==='hidden'){window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));}else if(stop==='pagehide')window.dispatchEvent(new Event('pagehide'));else localStorage.setItem('lineoa_access_token','changed-token');},stop);f.release();await f.page.waitForTimeout(10);assert.equal(await f.page.locator('.checkin-record').count(),0);await f.page.clock.fastForward(60000);assert.equal(f.reads(),count);await f.close();console.log('PASS '+stop+' stops polling and drops in-flight data');
 }
 {
  const f=await fixture();const before=f.reads();await f.page.evaluate(()=>{window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));});await f.page.clock.fastForward(60000);assert.equal(f.reads(),before);await f.page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await f.page.waitForFunction(()=>document.getElementById('chat-name').textContent==='合成甲');await f.page.waitForTimeout(1);assert.equal(f.reads(),before+1);await f.close();console.log('PASS visible authenticated resume performs one fresh read');
 }
 {
  const f=await fixture();f.state.deny=true;await f.page.clock.fastForward(12001);await f.page.getByText('請重新登入',{exact:true}).waitFor();const count=f.reads();await f.page.clock.fastForward(60000);assert.equal(f.reads(),count);await f.close();console.log('PASS revoked admin authorization stops further automatic reads');
 }
 for(const logicalDeny of ['Access Denied: Admin only action','Access Denied: Missing or invalid LINE Token']){
  const f=await fixture();f.state.deny=true;f.state.logicalDeny=logicalDeny;await f.page.clock.fastForward(12001);await f.page.getByText('請重新登入',{exact:true}).waitFor();const count=f.reads();await f.page.clock.fastForward(60000);assert.equal(f.reads(),count);await f.close();console.log('PASS HTTP200 logical authorization denial stops polling: '+logicalDeny);
 }
 {
  const f=await fixture({unauthorized:true});await f.page.getByText('合成權限撤銷',{exact:true}).waitFor();const count=f.reads();await f.page.clock.fastForward(60000);assert.equal(f.reads(),count);await f.close();console.log('PASS initial denied account never starts polling');
 }
 {
  const f=await fixture({noCredentials:true});const count=f.reads();await f.page.clock.fastForward(60000);assert.equal(f.reads(),count);await f.close();console.log('PASS missing login credentials never start automatic reads');
 }
 assert.deepEqual(errors,[]);console.log('PASS monitor preview/refresh browser regressions; production writes=0, LINE sends=0, point/check-in/click operations=0');
}finally{await browser.close();}
