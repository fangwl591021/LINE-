// Real controller/Flex, including one end-to-end case with the actual shared
// mycard WYSIWYG adapter. Failure/race cases use a visible callback test adapter.
// Every identity, API response and LINE picker below is synthetic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const read=file=>readFileSync(new URL('../../'+file,import.meta.url));
const UID=letter=>'U'+letter.repeat(32),A=UID('a'),B=UID('b'),C=UID('c');
const ownUrl=uid=>`https://liff.line.me/1660923784-vViMTZ1y?peopleIslandCard=1&ref=${uid}&net=own-${uid[1]}`;
const browser=await chromium.launch({channel:'chrome',headless:true});let cases=0;

async function fixture({uid=B,intent=false,width=390,delayRead=false,delayWrite=false,realEditor=false}={}){
 const copies=new Map([[A,{title:'A的人脈島',desc:'A的合作介紹',revision:1}],[B,{title:'B的人脈島',desc:'B的合作介紹',revision:2}],[C,{title:'C的人脈島',desc:'C的合作介紹',revision:1}]]);
 const requests=[],errors=[];let releaseRead,releaseWrite;
 const page=await browser.newPage({viewport:{width,height:900}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://island-copy.test/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path.startsWith('/v1/')){
   const auth=req.headers().authorization,id={a:A,b:B,c:C}[auth?.slice(-1)],body=req.postDataJSON();
   requests.push({path,method:req.method(),auth,body});
   assert.ok(id,'only synthetic verified identities');assert.equal(url.search,'','no URL owner override');
   if(path==='/v1/island-entry/status'){assert.equal(req.method(),'GET');return route.fulfill({json:{success:true,stage:'join'}});}
   if(path==='/v1/island-entry/share-link'){
    assert.equal(req.method(),'GET');return route.fulfill({json:{success:true,entryUrl:ownUrl(id),card:{...copies.get(id)}}});
   }
   assert.equal(path,'/v1/island-video-card','no personal-card, registration, chat, point or upload APIs');
   if(req.method()==='GET'){
    const snapshot={...copies.get(id)};
    if(delayRead){delayRead=false;await new Promise(resolve=>{releaseRead=resolve;});}
    return route.fulfill({json:{success:true,card:snapshot}});
   }
   assert.equal(req.method(),'PUT');assert.deepEqual(Object.keys(body).sort(),['desc','requestKey','revision','title']);
   if(delayWrite){delayWrite=false;await new Promise(resolve=>{releaseWrite=resolve;});}
   if(body.revision!==copies.get(id).revision)return route.fulfill({status:409,json:{success:false,error:'其他頁面已更新，草稿保留，請重新開啟。'}});
   const card={title:body.title,desc:body.desc,revision:body.revision+1};copies.set(id,card);
   return route.fulfill({json:{success:true,card}});
  }
  if(path==='/')return route.fulfill({contentType:'text/html;charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="main"><section id="page-business-island"></section></main></body></html>'});
  assert.ok(!path.includes('..'));const file=path.slice(1);
  return route.fulfill({contentType:file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html;charset=utf-8',body:read(file)});
 });
 await page.route('https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/**',route=>route.abort());
 await page.addInitScript(({uid,realEditor})=>{
  window.copyUid=uid;window.copyToken='token-'+uid[1];window.pickerCalls=[];window.editorOpenCount=0;window.editorErrors=[];
  window.Config={WORKER_URL:'https://island-copy.test/'};window.DEFAULT_LIFF_ID='1660923784-vViMTZ1y';
  window.goPage=page=>{window.currentPage=page;};
  window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.copyToken,getProfile:async()=>({userId:window.copyUid,displayName:'合成用戶'}),isApiAvailable:()=>true,shareTargetPicker:async messages=>{window.pickerCalls.push(messages);return{status:'success'};}};
  window.personalCalls=[];window.fetchAPI=async(action,payload)=>{window.personalCalls.push({action,payload});throw Error('Personal API forbidden');};
  window.toasts=[];window.showToast=message=>window.toasts.push(message);
  if(realEditor)return;
  // This visible test adapter exercises the real controller callbacks and keeps
  // its own draft, so failure/cancel cannot manufacture a successful save.
  window.MyCardModule={createIslandCardFromProfile(){throw Error('No personal generation');},selectIslandCardUpload(){throw Error('No upload');},
   openVideoCardTextEditor(options){
    window.editorOpenCount++;window.editorOptions=options;
    const dialog=document.createElement('dialog');dialog.dataset.testEditor='';
    dialog.innerHTML='<label>標題<input data-test-title></label><label>說明<textarea data-test-desc></textarea></label><button data-test-save>儲存</button><button data-test-cancel>取消</button><p data-test-error></p>';
    document.body.appendChild(dialog);dialog.querySelector('[data-test-title]').value=options.title;dialog.querySelector('[data-test-desc]').value=options.desc;dialog.showModal();
    let closed=false,busy=false;const close=()=>{if(closed)return;closed=true;dialog.close();dialog.remove();options.onClose?.();};
    dialog.querySelector('[data-test-cancel]').onclick=close;
    dialog.querySelector('[data-test-save]').onclick=async()=>{if(busy)return;busy=true;try{await options.onSave({title:dialog.querySelector('[data-test-title]').value,desc:dialog.querySelector('[data-test-desc]').value});close();}catch(e){window.editorErrors.push(e.message);dialog.querySelector('[data-test-error]').textContent=e.message;}finally{busy=false;}};
    return{close};
   }};
 },{uid,realEditor});
 await page.goto('https://island-copy.test/?peopleIslandCard=1&ref='+A+'&net=incoming-A'+(intent?'&islandVideoEdit=1':''));
 if(realEditor){
  await page.addStyleTag({content:'.hidden{display:none!important}*{box-sizing:border-box}button,input,textarea{font:inherit;max-width:100%}.w-full{width:100%}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1;min-height:0}.h-full{height:100%}.overflow-y-auto{overflow-y:auto}#my-card-wysiwyg-modal{position:fixed;inset:0;z-index:20;background:#1a1b1e;color:white;padding:12px}#my-card-wysiwyg-preview{max-width:390px;margin:auto}#my-card-wysiwyg-editor-modal{position:fixed;inset:0;z-index:30;background:#000a;display:flex;align-items:center;justify-content:center;padding:18px}#my-card-wysiwyg-editor-modal>div{background:white;color:#142f3b;padding:16px;width:100%;max-width:360px}input,textarea{display:block;width:100%}'});
  await page.addScriptTag({content:read('js/modules/mycard.js').toString()});
 }
 await page.evaluate(async()=>{window.copyEntry=await import('/js/modules/people-island-card.js');window.copyController=await window.copyEntry.mountPeopleIslandCard({params:new URLSearchParams(location.search),embedded:true});});
 return{page,copies,requests,errors,waitRead:async()=>{while(!releaseRead)await page.waitForTimeout(10);},waitWrite:async()=>{while(!releaseWrite)await page.waitForTimeout(10);},releaseRead:()=>releaseRead(),releaseWrite:()=>releaseWrite()};
}
const puts=f=>f.requests.filter(row=>row.method==='PUT');
const edit=async f=>{await f.page.locator('[data-pic-edit-video]').click();await f.page.locator('[data-test-editor]').waitFor();};
const draft=async(f,title,desc)=>{await f.page.locator('[data-test-title]').fill(title);await f.page.locator('[data-test-desc]').fill(desc);};
const save=async f=>{await f.page.locator('[data-test-save]').click();await f.page.locator('[data-test-editor]').waitFor({state:'detached'});};
function checkShare(message,uid,copy){
 assert.equal(message.contents.type,'bubble');assert.equal(message.contents.size,'mega');assert.equal(message.contents.hero.type,'video');assert.equal(message.contents.hero.aspectRatio,'9:16');
 assert.equal(message.contents.body.contents[0].text,copy.title);assert.equal(message.contents.body.contents[1].text,copy.desc);
 for(const action of [message.contents.hero.action,message.contents.hero.altContent.action,...message.contents.footer.contents.map(row=>row.action)]){
  const url=new URL(action.uri);assert.equal(url.searchParams.get('ref'),uid);assert.equal(url.searchParams.get('net'),'own-'+uid[1]);
 }
}
try{
 {
  const f=await fixture();assert.equal(puts(f).length,0);await edit(f);
  assert.equal(await f.page.locator('[data-test-title]').inputValue(),'B的人脈島');
  await draft(f,'B合作夥伴 <img src=x>','第一行\n第二行\n第三行\n第四行');await save(f);
  assert.equal(puts(f).length,1);assert.equal(puts(f)[0].auth,'Bearer token-b');assert.equal(puts(f)[0].body.revision,2);
  assert.equal(await f.page.locator('.pic-intro h1').textContent(),'B合作夥伴 <img src=x>');assert.equal(await f.page.locator('.pic-intro h1 img').count(),0);
  assert.equal(f.copies.get(A).title,'A的人脈島');assert.equal(f.copies.get(B).revision,3);cases++;
  await edit(f);assert.equal(await f.page.locator('[data-test-title]').inputValue(),f.copies.get(B).title);
  await draft(f,'未儲存草稿','這段不能寫入');await f.page.locator('[data-test-cancel]').click();assert.equal(puts(f).length,1);
  await edit(f);assert.equal(await f.page.locator('[data-test-title]').inputValue(),f.copies.get(B).title);await f.page.locator('[data-test-cancel]').click();cases++;
  // Another page's newer copy must be used by sharing, even without an editor refresh.
  f.copies.set(B,{title:'伺服器最新標題',desc:'伺服器最新說明',revision:4});
  await f.page.locator('[data-pic-share]').click();await f.page.waitForFunction(()=>window.pickerCalls.length===1);
  checkShare(await f.page.evaluate(()=>window.pickerCalls[0][0]),B,f.copies.get(B));assert.equal(puts(f).length,1);cases++;
  assert.deepEqual(f.errors,[]);await f.page.close();
 }
 {
  const f=await fixture();await edit(f);await draft(f,'保留的草稿','衝突後不要關閉');
  f.copies.set(B,{title:'另一頁已更新',desc:'原稿',revision:3});
  await f.page.locator('[data-test-save]').click();await f.page.waitForFunction(()=>window.editorErrors.length===1);
  assert.equal(await f.page.locator('[data-test-title]').inputValue(),'保留的草稿');assert.equal(f.copies.get(B).title,'另一頁已更新');
  await f.page.locator('[data-test-save]').click();await f.page.waitForFunction(()=>window.editorErrors.length===2);
  assert.equal(puts(f)[0].body.requestKey,puts(f)[1].body.requestKey,'same failed attempt reuses UUID');
  await f.page.locator('[data-test-cancel]').click();await edit(f);assert.equal(await f.page.locator('[data-test-title]').inputValue(),'另一頁已更新');
  await draft(f,'重開後的正確新稿','最新版本');await save(f);assert.equal(f.copies.get(B).revision,4);cases++;
  assert.deepEqual(f.errors,[]);await f.page.close();
 }
 {
  const f=await fixture({delayRead:true});await f.page.locator('[data-pic-edit-video]').click();await f.waitRead();
  await f.page.evaluate(uid=>{window.copyUid=uid;window.copyToken='token-c';window.currentUserProfile={userId:uid};},C);f.releaseRead();
  await f.page.waitForTimeout(150);assert.equal(await f.page.locator('[data-test-editor]').count(),0);assert.equal(puts(f).length,0);cases++;
  assert.deepEqual(f.errors,[]);await f.page.close();
 }
 {
  const f=await fixture({delayWrite:true});await edit(f);await draft(f,'B送出後換帳號','不能顯示在C名下');await f.page.locator('[data-test-save]').click();await f.waitWrite();
  await f.page.evaluate(uid=>{window.copyUid=uid;window.copyToken='token-c';window.currentUserProfile={userId:uid};},C);f.releaseWrite();
  await f.page.waitForTimeout(120);assert.notEqual(await f.page.locator('.pic-intro h1').textContent(),'B送出後換帳號');assert.equal(f.copies.get(C).title,'C的人脈島');
  assert.equal(puts(f)[0].auth,'Bearer token-b');cases++;
  assert.deepEqual(f.errors,[]);await f.page.close();
 }
 {
  const f=await fixture({intent:true});assert.equal(await f.page.locator('[data-test-editor]').count(),1);assert.equal(await f.page.evaluate(()=>window.editorOpenCount),1);assert.equal(puts(f).length,0);
  assert.equal(await f.page.locator('[data-pic-visit]').isVisible(),false,'editing promotion text does not grant join/registration/social access');
  await f.page.locator('[data-test-cancel]').click();await f.page.evaluate(()=>window.copyController.check());assert.equal(await f.page.evaluate(()=>window.editorOpenCount),1);assert.equal(puts(f).length,0);
  await edit(f);assert.equal(await f.page.evaluate(()=>window.editorOpenCount),2);await f.page.locator('[data-test-cancel]').click();cases++;
  assert.deepEqual(f.errors,[]);await f.page.close();
 }
 {
  const f=await fixture({uid:A});await edit(f);assert.equal(await f.page.locator('[data-test-title]').inputValue(),'A的人脈島');
  await draft(f,'A自己的版本','A自己介紹');await save(f);assert.equal(f.copies.get(B).title,'B的人脈島');cases++;
  assert.deepEqual(f.errors,[]);await f.page.close();
 }
 {
  // Close the interface gap: real controller -> real shared fields -> own PUT.
  const f=await fixture({realEditor:true});
  await f.page.locator('[data-pic-edit-video]').click();await f.page.locator('[data-video-card-text-canvas]').waitFor();
  await f.page.locator('[data-video-card-text-title]').click();
  await f.page.locator('#my-wysiwyg-title-input').fill('真實編輯器接線標題');
  await f.page.locator('#my-card-wysiwyg-editor-body button').click();
  await f.page.locator('[data-video-card-text-desc]').click();
  await f.page.locator('#my-wysiwyg-desc-input').fill('真實欄位第一行\n真實欄位第二行');
  await f.page.locator('#my-card-wysiwyg-editor-body button').click();
  assert.equal(puts(f).length,0,'applying shared field draft is not saving');
  await f.page.locator('button[onclick="window.saveMyCardWysiwyg(this)"]').click();
  await f.page.waitForFunction(()=>document.getElementById('my-card-wysiwyg-modal').classList.contains('hidden'));
  assert.equal(puts(f).length,1);assert.equal(puts(f)[0].auth,'Bearer token-b');
  assert.equal(puts(f)[0].body.title,'真實編輯器接線標題');assert.equal(puts(f)[0].body.desc,'真實欄位第一行\n真實欄位第二行');
  await f.page.locator('[data-pic-edit-video]').click();await f.page.locator('[data-video-card-text-canvas]').waitFor();
  assert.equal(await f.page.locator('[data-video-card-text-title]').textContent(),'真實編輯器接線標題');
  assert.match(await f.page.locator('[data-video-card-text-desc]').textContent(),/真實欄位第一行/);
  await f.page.evaluate(()=>window.closeMyCardWysiwyg());
  await f.page.locator('[data-pic-share]').click();await f.page.waitForFunction(()=>window.pickerCalls.length===1);
  checkShare(await f.page.evaluate(()=>window.pickerCalls[0][0]),B,f.copies.get(B));
  assert.equal(await f.page.evaluate(()=>window.personalCalls.length),0,'actual shared editor never invokes personal updateCard/resolve APIs');
  assert.equal(puts(f).length,1);assert.deepEqual(f.errors,[]);await f.page.close();cases++;
 }
 for(const width of [320,390,1280]){
  const f=await fixture({width});const button=f.page.locator('[data-pic-edit-video]');assert.equal(await button.isVisible(),true);
  assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow '+width);
  await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();assert.ok(box.width>150&&box.height>=44);
  assert.deepEqual(f.errors,[]);await f.page.close();cases++;
 }
 console.log(`Island video copy controller: ${cases} cases PASS; actual shared WYSIWYG -> own PUT -> reopen -> own-source share; save/cancel/conflict, account race isolation, explicit intent once, join gate unchanged, 320/390/1280. Synthetic APIs and picker only.`);
}finally{await browser.close();}
