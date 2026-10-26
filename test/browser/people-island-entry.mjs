// Actual scene/controller with synthetic identities and intercepted read-only APIs.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const read=file=>readFileSync(new URL('../../'+file,import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true});
let cases=0;
try{
  for(const width of [320,390,1280]){
    const page=await browser.newPage({viewport:{width,height:850}}),requests=[],errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://island.test/**',async route=>{
      const request=route.request(),url=new URL(request.url()),path=url.pathname;
      if(path.startsWith('/v1/island-entry/')){
        assert.equal(request.method(),'GET');assert.equal(request.headers().authorization,'Bearer '+await page.evaluate(()=>window.testToken));
        requests.push(path+url.search);
        if(path.endsWith('/status')){
          if(await page.evaluate(()=>window.delayStatus)){await page.evaluate(()=>{window.delayStatus=false;});await new Promise(resolve=>{page.releaseStatus=resolve;});}
          return route.fulfill({json:{success:true,stage:await page.evaluate(()=>window.testStage)}});
        }
        if(path.endsWith('/members'))return route.fulfill({json:{success:true,items:[{handle:url.search?'peer-two':'peer-one',name:url.search?'合成會員二':'合成會員一',company:'合成品牌設計',title:'設計師',avatarUrl:'https://images.test/avatar.svg',email:'must-not-render@example.test',website:'https://must-not-render.test'}],next:url.search?'':'next-cursor'}});
        if(path.endsWith('/share-link'))return route.fulfill({json:{success:true,entryUrl:'https://liff.line.me/1660923784-vViMTZ1y?peopleIslandCard=1&ref=U'+('b'.repeat(32))+'&net=synthetic-network'}});
        throw Error('unexpected entry request');
      }
      if(path==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><main id="main"><div id="page-business-island"></div></main></div></body></html>'});
      if(path==='/js/modules/people-island-flex.mjs')return route.fulfill({contentType:'text/javascript',body:'export function buildPeopleIslandVideoFlex({entryUrl}){return {type:"flex",altText:"人脈島",contents:{entryUrl}};}'});
      const file=path.slice(1);assert.ok(!file.includes('..'));
      return route.fulfill({contentType:file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':file.endsWith('.svg')?'image/svg+xml':'text/html',body:read(file)});
    });
    await page.route('https://images.test/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#167a59"/></svg>'}));
    await page.route('https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/**',route=>route.abort());
    await page.addInitScript(()=>{
      window.testToken='synthetic-token';window.testStage='join';window.currentUserProfile={userId:'synthetic-viewer',displayName:'合成參觀者'};
      window.currentPage='home';window.Config={WORKER_URL:'https://island.test/'};window.DEFAULT_LIFF_ID='1660923784-vViMTZ1y';window.POINT_OA_URL='https://lin.ee/sDW7u4T';
      window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken,getProfile:async()=>window.currentUserProfile,requestFriendship:async()=>{window.testStage='card';},isApiAvailable:()=>true,shareTargetPicker:async messages=>{window.sharedMessages=messages;return window.shareResult;}};
      window.goPage=page=>{window.currentPage=page;window.lastPage=page;};window.applyRegisteredUserSession=(info,options)=>{window.sessionApplied={registered:true,info,options};};window.applyUnregisteredHomeSession=options=>{window.sessionApplied={registered:false,options};};window.openBusinessIsland=async()=>{window.openedIsland=(window.openedIsland||0)+1;};window.focusMyECardSection=()=>{window.focusedCard=true;};window.showToast=()=>{};
    });
    await page.goto('https://island.test/');
    await page.evaluate(async()=>{window.entry=await import('/js/modules/people-island-card.js');await window.entry.mountPeopleIslandCard({params:new URLSearchParams('ref=original-ref&net=original-net'),embedded:true});});
    assert.equal(await page.locator('[data-pic-visit]').isVisible(),false);assert.equal(requests.filter(p=>p.includes('/members')).length,0);cases++;
    assert.equal(await page.locator('video').getAttribute('playsinline'),'');assert.equal(await page.locator('video').getAttribute('poster'),'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/people-island/video-card-v3.jpg');
    const entryUrl=await page.evaluate(()=>window.entry.islandLiffUrl(new URLSearchParams('ref=original-ref&net=original-net&url=https://evil.test')));assert.match(entryUrl,/^https:\/\/liff\.line\.me\/1660923784-vViMTZ1y\?/);assert.ok(entryUrl.includes('ref=original-ref'));assert.ok(entryUrl.includes('net=original-net'));assert.ok(!entryUrl.includes('evil.test'));cases++;
    await page.locator('[data-pic-primary]').click();await page.locator('[data-pic-member="peer-one"]').waitFor();
    assert.equal(await page.locator('.bi-world-island').count(),7);assert.equal(await page.locator('[data-pic-setup]').textContent(),'上傳我的名片');assert.equal(await page.locator('[data-bi-action="chat"]').count(),0);assert.equal(await page.locator('a[href^="tel:"],a[href^="mailto:"]').count(),0);assert.ok(!(await page.locator('.pic-shell').innerHTML()).includes('must-not-render'));await page.waitForFunction(()=>[...document.querySelectorAll('.bi-world img[data-bi-avatar]')].some(image=>!image.hidden&&image.naturalWidth>0));cases++;
    await page.locator('[data-pic-member="peer-one"]').click();assert.ok((await page.locator('[data-pic-selected]').textContent()).includes('合成會員一'));assert.ok((await page.locator('[data-pic-selected]').textContent()).includes('參觀模式'));await page.locator('[data-pic-close-summary]').click();assert.equal(await page.locator('[data-pic-selected]').isVisible(),false);cases++;
    await page.locator('[data-pic-more]').scrollIntoViewIfNeeded();await page.locator('[data-pic-more]').click();await page.locator('[data-pic-member="peer-two"]').waitFor();assert.equal(await page.locator('[data-pic-roster] button').count(),2);cases++;
    await page.locator('[data-pic-share]').scrollIntoViewIfNeeded();await page.locator('[data-pic-share]').click();await page.waitForFunction(()=>document.querySelector('[data-pic-status]').textContent.includes('未確認送出'));assert.equal(await page.evaluate(()=>window.sharedMessages.length),1);cases++;
    await page.evaluate(()=>window.shareResult={status:'success'});await page.locator('[data-pic-share]').click();await page.waitForFunction(()=>document.querySelector('[data-pic-status]').textContent.includes('已分享'));cases++;
    const readsBefore=requests.length;await page.evaluate(()=>{window.testToken='new-token';window.currentUserProfile={userId:'other-viewer'};});await page.waitForFunction(()=>document.querySelector('[data-pic-status]').textContent.includes('登入身分已變更'));assert.equal(await page.locator('[data-pic-visit]').isVisible(),false);assert.equal(requests.length,readsBefore);assert.equal(await page.locator('[data-pic-roster] button').count(),0);cases++;
    await page.evaluate(async()=>{window.testStage='review';await window.entry.mountPeopleIslandCard({embedded:true});});await page.locator('[data-pic-member="peer-one"]').waitFor();assert.equal(await page.locator('[data-pic-setup]').textContent(),'查看名片與審核');
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));assert.equal(await page.locator('[data-pic-visit]').isVisible(),false);await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.locator('[data-pic-member="peer-one"]').waitFor();cases++;
    await page.evaluate(async()=>{window.testStage='ready';await window.entry.routePeopleIslandSetup({params:new URLSearchParams('peopleIsland=1'),checkRes:{isRegistered:true,info:{name:'合成會員'}}});});assert.equal(await page.evaluate(()=>window.openedIsland),1);cases++;
    await page.evaluate(async()=>{await window.entry.routePeopleIslandSetup({params:new URLSearchParams('peopleIsland=1&islandSetup=register&ref=original-ref&net=original-net'),checkRes:{isRegistered:false},refId:'original-ref',netId:'original-net'});});assert.equal(await page.evaluate(()=>window.lastPage),'register');assert.equal(await page.evaluate(()=>window.sessionApplied.options.referrerId),'original-ref');assert.equal(await page.locator('[data-pic-return]').count(),1);cases++;
    await page.evaluate(async()=>{window.currentPage='home';window.delayStatus=true;window.staleReady=window.entry.routePeopleIslandSetup({params:new URLSearchParams('peopleIsland=1'),checkRes:{isRegistered:true,info:{name:'合成會員'}}});});
    await page.waitForFunction(()=>window.delayStatus===false);await page.evaluate(()=>{window.testToken='third-token';window.currentUserProfile={userId:'third-viewer'};});page.releaseStatus();await page.evaluate(()=>window.staleReady);assert.equal(await page.evaluate(()=>window.openedIsland),1);cases++;
    assert.ok(await page.locator('.pic-shell').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'phone and desktop content stays within the page');assert.ok(requests.every(p=>p.startsWith('/v1/island-entry/')));assert.deepEqual(errors,[]);cases++;
    const previewReads=requests.length;await page.goto('https://island.test/people-island-card.html?ref=original-ref&net=original-net');await page.locator('[data-pic-primary]').waitFor();assert.equal(requests.length,previewReads,'public preview does not use business APIs or initialize LINE');assert.equal(await page.locator('.pic-video').count(),1);assert.equal(await page.locator('[data-pic-visit]').isVisible(),false);cases++;
    await page.close();
  }
  const auth=read('js/auth.js').toString();assert.ok(auth.indexOf("initialUrlParams.get('peopleIslandCard')")<auth.indexOf("const checkRes = await window.fetchAPI('checkUser'"));
  const standalone=read('people-island-card.html').toString();assert.ok(!standalone.includes('liff.init'));assert.ok(standalone.includes('embedded: false'));
  console.log(`People Island entry browser: ${cases} checks PASS at 320/390/1280; synthetic GETs only, zero real messages or writes.`);
}finally{await browser.close();}
