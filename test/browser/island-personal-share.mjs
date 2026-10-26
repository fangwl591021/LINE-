// Real controller/Flex and first-referral functions; all identity/API/picker results synthetic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const read=file=>readFileSync(new URL('../../'+file,import.meta.url));
const auth=read('js/auth.js').toString();
const referral=auth.slice(auth.indexOf('function getReferralStorageKey('),auth.indexOf('function pendingMotherRegistrationKey('));
assert.ok(referral.includes('function writeFirstReferral('));
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32);
const ownUrl=uid=>`https://liff.line.me/1660923784-vViMTZ1y?peopleIslandCard=1&ref=${uid}&net=network-${uid[1].toUpperCase()}`;
const browser=await chromium.launch({channel:'chrome',headless:true});let cases=0;

function checkMessage(message,uid){
  assert.equal(message.type,'flex');assert.equal(message.contents.type,'bubble');
  assert.equal(message.contents.size,'giga','newly shared island cards use the requested GIGA size');
  assert.equal(message.contents.hero.type,'video');assert.equal(message.contents.hero.aspectRatio,'9:16');
  const footer=message.contents.footer.contents;
  assert.equal(footer.length,2,'native card has join and share actions');
  const join=footer.find(item=>item.action?.label!=='分享好友'),share=footer.find(item=>item.action?.label==='分享好友');
  assert.ok(join&&share,'both native actions remain discoverable');
  for(const action of [message.contents.hero.action,message.contents.hero.altContent.action,join.action,share.action]){
    assert.equal(action.type,'uri');const url=new URL(action.uri);
    assert.equal(url.hostname,'liff.line.me');assert.equal(url.searchParams.get('ref'),uid);assert.equal(url.searchParams.get('net'),'network-'+uid[1].toUpperCase());assert.equal(url.searchParams.get('peopleIslandCard'),'1');
    assert.equal(url.searchParams.get('islandShare'),action===share.action?'1':null);
  }
}

async function fixture({uid=B,params='',intent=false,failSource=false,cancel=false,blocked=false,delaySource=false,standalone=false}={}){
  const page=await browser.newPage({viewport:{width:390,height:850}}),reads=[],errors=[];
  let releaseSource;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://personal-island.test/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    assert.equal(req.method(),'GET','readonly sharing must not create membership or send a LINE message');
    if(path.startsWith('/v1/island-entry/')){
      assert.equal(url.search,'','identity/referral cannot be supplied as query authorization');
      reads.push({path,authorization:req.headers().authorization});
      if(path.endsWith('/status'))return route.fulfill({json:{success:true,stage:'join'}});
      if(path.endsWith('/share-link')){
        const sourceUid=await page.evaluate(()=>window.profileUid);
        if(await page.evaluate(()=>window.delaySource)){await page.evaluate(()=>{window.delaySource=false;});await new Promise(resolve=>{releaseSource=resolve;});}
        if(await page.evaluate(()=>window.failSource))return route.fulfill({status:503,json:{success:false,error:'目前無法取得個人分享來源，請再試一次。'}});
        return route.fulfill({json:{success:true,entryUrl:ownUrl(sourceUid)}});
      }
      throw Error('Unexpected business endpoint: '+path);
    }
    if(path==='/')return route.fulfill({contentType:'text/html;charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="main"><div id="page-business-island"></div></main></body></html>'});
    assert.ok(!path.includes('..'));const file=path.slice(1);
    return route.fulfill({contentType:file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html;charset=utf-8',body:read(file)});
  });
  await page.route('https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/**',route=>route.abort());
  await page.addInitScript(({uid,incoming,failSource,cancel,blocked,delaySource})=>{
    window.profileUid=uid;window.testToken='token-'+uid[1].toUpperCase();window.failSource=failSource;window.delaySource=delaySource;window.cancelShare=cancel;window.blockedShare=blocked;window.pickerCalls=[];window.referralWrites=[];window.profileReads=0;window.identityEvents=[];
    window.Config={WORKER_URL:'https://personal-island.test/'};window.DEFAULT_LIFF_ID='1660923784-vViMTZ1y';window.POINT_OA_URL='https://lin.ee/sDW7u4T';
    if(incoming)localStorage.setItem('ACTMASTER_FIRST_REF_'+uid,JSON.stringify({referrerId:incoming,networkId:'network-A',savedAt:1234}));
    window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken,getProfile:async()=>{window.profileReads++;window.identityEvents.push('profile');return{userId:window.profileUid,displayName:'合成分享者'};},isApiAvailable:()=>!window.blockedShare,shareTargetPicker:async messages=>{window.pickerCalls.push(messages);return window.cancelShare?undefined:{status:'success'};}};
    window.goPage=page=>{window.currentPage=page;};
  },{uid,incoming:params?A:'',failSource,cancel,blocked,delaySource});
  await page.addInitScript(referral+'\nconst originalWriteFirstReferral=writeFirstReferral;window.writeFirstReferral=(...args)=>{window.identityEvents.push("first-ref");window.referralWrites.push(args);return originalWriteFirstReferral(...args);};');
  const fullParams='peopleIslandCard=1'+(params?'&'+params:'')+(intent?'&islandShare=1':'');
  await page.goto('https://personal-island.test/?'+fullParams);
  await page.evaluate(async({embedded})=>{window.entry=await import('/js/modules/people-island-card.js');window.controller=await window.entry.mountPeopleIslandCard({params:new URLSearchParams(location.search),embedded});},{embedded:!standalone});
  return{page,reads,errors,release:()=>{assert.ok(releaseSource,'delayed own source must have been requested');releaseSource();}};
}

try{
  // A originates a card; B's re-share must use B's verified source, without touching B's first attribution to A.
  {
    const f=await fixture({uid:A});assert.equal(await f.page.evaluate(()=>window.pickerCalls.length),0,'ordinary card open never auto-shares');
    await f.page.locator('[data-pic-share]').click();await f.page.waitForFunction(()=>window.pickerCalls.length===1);
    const aMessage=await f.page.evaluate(()=>window.pickerCalls[0][0]);checkMessage(aMessage,A);assert.equal(f.reads.filter(row=>row.path.endsWith('/share-link')).length,1);assert.ok(f.reads.every(row=>row.authorization==='Bearer token-A'));assert.deepEqual(f.errors,[]);await f.page.close();cases++;
    const fB=await fixture({uid:B,params:'ref='+A+'&net=network-A'}),before=await fB.page.evaluate(()=>({query:location.search,cache:localStorage.getItem('ACTMASTER_FIRST_REF_'+window.profileUid)}));
    assert.equal(await fB.page.evaluate(()=>window.pickerCalls.length),0);
    await fB.page.locator('[data-pic-share]').click();await fB.page.waitForFunction(()=>window.pickerCalls.length===1);checkMessage(await fB.page.evaluate(()=>window.pickerCalls[0][0]),B);
    assert.deepEqual(await fB.page.evaluate(()=>({query:location.search,cache:localStorage.getItem('ACTMASTER_FIRST_REF_'+window.profileUid)})),before,'own outgoing source never overwrites incoming attribution');
    assert.deepEqual(await fB.page.evaluate(()=>window.referralWrites),[[B,A,'network-A']]);assert.equal(await fB.page.evaluate(()=>window.profileReads),1);assert.deepEqual(await fB.page.evaluate(()=>window.identityEvents),['profile','first-ref']);assert.deepEqual(fB.errors,[]);await fB.page.close();cases++;
  }
  // Native card's explicit share URI opens once. Data refresh and BFCache must not replay the intent.
  {
    const f=await fixture({params:'ref='+A+'&net=network-A',intent:true});await f.page.waitForFunction(()=>window.pickerCalls.length===1);checkMessage(await f.page.evaluate(()=>window.pickerCalls[0][0]),B);cases++;
    await f.page.evaluate(async()=>{await window.controller.check();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    await f.page.waitForFunction(()=>!document.querySelector('[data-pic-primary]').disabled);assert.equal(await f.page.evaluate(()=>window.pickerCalls.length),1,'visibility refresh never reopens picker');
    await f.page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    await f.page.waitForFunction(()=>!document.querySelector('[data-pic-primary]').disabled);await f.page.waitForTimeout(200);assert.equal(await f.page.evaluate(()=>window.pickerCalls.length),1,'refresh/BFCache never reopens picker');assert.equal(f.reads.filter(row=>row.path.endsWith('/share-link')).length,1);assert.equal(await f.page.evaluate(()=>window.referralWrites.length),1);cases++;
    await f.page.locator('[data-pic-share]').click();await f.page.waitForFunction(()=>window.pickerCalls.length===2);checkMessage(await f.page.evaluate(()=>window.pickerCalls[1][0]),B);assert.deepEqual(f.errors,[]);await f.page.close();cases++;
  }
  // Unknown source/error must not open a picker. Manual retry can recover without adopting the incoming ref.
  {
    const f=await fixture({params:'ref='+A+'&net=network-A',failSource:true});await f.page.locator('[data-pic-share]').click();await f.page.waitForFunction(()=>document.querySelector('[data-pic-status]').textContent.includes('無法取得'));
    assert.equal(await f.page.evaluate(()=>window.pickerCalls.length),0);assert.equal(await f.page.locator('[data-pic-share]').isEnabled(),true);cases++;
    await f.page.evaluate(()=>window.failSource=false);await f.page.locator('[data-pic-share]').click();await f.page.waitForFunction(()=>window.pickerCalls.length===1);checkMessage(await f.page.evaluate(()=>window.pickerCalls[0][0]),B);assert.deepEqual(f.errors,[]);await f.page.close();cases++;
  }
  // Cancellation has no false confirmation and may be followed by an explicit successful retry.
  {
    const f=await fixture({params:'ref='+A+'&net=network-A',cancel:true});await f.page.locator('[data-pic-share]').click();await f.page.waitForFunction(()=>document.querySelector('[data-pic-status]').textContent.includes('未確認送出'));
    assert.equal(await f.page.evaluate(()=>window.pickerCalls.length),1);assert.ok(!(await f.page.locator('[data-pic-status]').textContent()).includes('已分享'));cases++;
    await f.page.evaluate(()=>window.cancelShare=false);await f.page.locator('[data-pic-share]').click();await f.page.waitForFunction(()=>window.pickerCalls.length===2);await f.page.waitForFunction(()=>document.querySelector('[data-pic-status]').textContent.includes('已分享'));checkMessage(await f.page.evaluate(()=>window.pickerCalls[1][0]),B);assert.deepEqual(f.errors,[]);await f.page.close();cases++;
  }
  // A native intent blocked by the client leaves a usable manual button instead of repeated automatic prompts.
  {
    const f=await fixture({intent:true,blocked:true});await f.page.waitForFunction(()=>!document.querySelector('[data-pic-share]').disabled);assert.equal(await f.page.evaluate(()=>window.pickerCalls.length),0);
    await f.page.evaluate(()=>window.blockedShare=false);await f.page.locator('[data-pic-share]').click();await f.page.waitForFunction(()=>window.pickerCalls.length===1);checkMessage(await f.page.evaluate(()=>window.pickerCalls[0][0]),B);assert.deepEqual(f.errors,[]);await f.page.close();cases++;
  }
  // A late personal-source response from a replaced account must never open a picker or share the prior UID.
  {
    const f=await fixture({params:'ref='+A+'&net=network-A',delaySource:true});await f.page.locator('[data-pic-share]').click();await f.page.waitForFunction(()=>window.delaySource===false);
    await f.page.evaluate(uid=>{window.profileUid=uid;window.currentUserProfile={userId:uid};window.testToken='token-C';},C);f.release();await f.page.waitForTimeout(300);
    assert.equal(await f.page.evaluate(()=>window.pickerCalls.length),0);assert.deepEqual(f.errors,[]);await f.page.close();cases++;
  }
  // The public preview, even with an intent flag in its URL, never calls LINE or a personal-source API.
  {
    const f=await fixture({intent:true,standalone:true});await f.page.waitForTimeout(150);assert.equal(f.reads.length,0);assert.equal(await f.page.evaluate(()=>window.pickerCalls.length),0);assert.equal(await f.page.evaluate(()=>window.profileReads),0);assert.deepEqual(f.errors,[]);await f.page.close();cases++;
  }
  console.log(`People Island personal share: ${cases} cases PASS; A/B own-source native actions, first attribution preserved, cancel/error/session/replay guards; synthetic GETs and picker only.`);
}finally{await browser.close();}
