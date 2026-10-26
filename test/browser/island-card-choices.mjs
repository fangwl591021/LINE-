// Actual entry/controller and profile-save function; synthetic accounts and methods only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const read=file=>readFileSync(new URL('../../'+file,import.meta.url));
const index=read('index.html').toString(),auth=read('js/auth.js').toString();
const profileMarkup=index.slice(index.indexOf('<details id="details-profile-registration"'),index.indexOf('<details id="details-local-gpt-key"'));
const profileSave=auth.slice(auth.indexOf('window.saveProfileRegistration = async function'),auth.indexOf('window.submitClaimRegistration = async function'));
const B='U'+'b'.repeat(32);
const browser=await chromium.launch({channel:'chrome',headless:true});let cases=0;

async function fixture({width=390,stage='review',mount=false,existing=false}={}){
 const page=await browser.newPage({viewport:{width,height:850}}),errors=[],reads=[],navigations=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://choices.test/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  assert.equal(request.method(),'GET','isolated browser tests must never send production writes');
  if(path.startsWith('/v1/island-entry/')){
   reads.push(path);
   if(path.endsWith('/status'))return route.fulfill({json:{success:true,stage:await page.evaluate(()=>window.testStage)}});
   if(path.endsWith('/members'))return route.fulfill({json:{success:true,items:[],next:''}});
   throw Error('Unexpected API '+path);
  }
  if(path==='/')return route.fulfill({contentType:'text/html;charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="main"><div id="page-business-island"></div><div id="page-admin-settings">'+profileMarkup+'<details id="details-my-ecard"><summary>我的名片</summary><input type="file" id="myGalleryInput"><input type="file" id="file-my-v1-img"></details></div><div id="page-register"></div></main></body></html>'});
  if(path==='/js/modules/business-island-world.mjs')return route.fulfill({contentType:'text/javascript',body:'export function createIslandWorld(){return{renderMembers(){},destroy(){},pause(){},roll:async()=>null,sailTo:async()=>null};}'});
  const file=path.slice(1);assert.ok(!file.includes('..'));
  return route.fulfill({contentType:/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/html;charset=utf-8',body:read(file)});
 });
 await page.route('https://liff.line.me/**',route=>{navigations.push(route.request().url());return route.fulfill({contentType:'text/html',body:'<p>Captured isolated navigation</p>'});});
 await page.route('https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/**',route=>route.abort());
 await page.addInitScript(({uid,stage,existing})=>{
  window.testStage=stage;window.testToken='synthetic-token';window.currentPage='home';window.currentUserProfile={userId:uid,displayName:'合成會員'};
  window.currentUser={userId:uid,name:'合成會員',phone:'0912345678',industry:'行銷設計媒體',networkId:'original-net',referrerId:'original-ref'};
  window.Config={WORKER_URL:'https://choices.test/'};window.DEFAULT_LIFF_ID='1660923784-vViMTZ1y';window.POINT_OA_URL='https://lin.ee/sDW7u4T';
  window.generations=[];window.uploadInputs=[];window.uploadPreparations=0;window.editedExisting=0;window.mockOperations=[];window.toasts=[];window.failSave=false;window.delaySave=false;window.existingCard=existing;
  window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken,getProfile:async()=>window.currentUserProfile};
  window.goPage=page=>{window.currentPage=page;window.lastPage=page;};
  window.applyRegisteredUserSession=info=>{window.currentUser={...info};};window.applyUnregisteredHomeSession=()=>{};
  window.focusMyECardSection=()=>{document.querySelector('#details-my-ecard').open=true;};window.initMyECard=async()=>{};
  window.showToast=message=>window.toasts.push(message);window.getSocialLikeActorId=()=>window.currentUserProfile.userId;
  window.requirePrivacyTermsAgreement=id=>document.getElementById(id)?.checked===true;
  window.fetchAPI=async(action,payload)=>{
   window.mockOperations.push({action,payload});
   if(action==='checkUser')return{isRegistered:true,info:{...window.currentUser}};
   if(action==='updateUserProfile'||action==='registerUser'){
    if(window.delaySave){window.delaySave=false;await new Promise(resolve=>{window.releaseSave=resolve;});}
    if(window.failSave)return{success:false,error:'合成儲存失敗'};
    window.currentUser={...window.currentUser,...payload};return{success:true};
   }
   throw Error('Unexpected mocked action '+action);
  };
  window.MyCardModule={
   createIslandCardFromProfile:async(_event,options)=>{window.generations.push({current:options?.isCurrent?.(),userId:window.currentUserProfile.userId});return true;},
   prepareIslandCardUpload:async options=>{if(options?.isCurrent?.()===false)return false;window.uploadPreparations++;return true;},
   selectIslandCardUpload:(_event,options)=>{if(options?.isCurrent?.()===false)return false;if(options?.editOnly){window.editedExisting++;return true;}const id=window.existingCard?'file-my-v1-img':'myGalleryInput';window.uploadInputs.push(id);document.getElementById(id).click();return true;}
  };
 },{uid:B,stage,existing});
 await page.addInitScript('function registrationBirthdayToISO(value){return value||"";} function resolveReferralForRegistration(){return{referrerId:"original-ref",networkId:"original-net"};}\n'+profileSave);
 await page.goto('https://choices.test/?peopleIslandCard=1&ref=original-ref&net=original-net');
 await page.evaluate(async mount=>{window.entry=await import('/js/modules/people-island-card.js');for(const id of ['myGalleryInput','file-my-v1-img'])document.getElementById(id).addEventListener('click',event=>event.preventDefault());if(mount)await window.entry.mountPeopleIslandCard({params:new URLSearchParams(location.search),embedded:true});},mount);
 return{page,errors,reads,navigations};
}

async function setup(page,method,isRegistered=true){
 await page.evaluate(async({method,isRegistered})=>{await window.entry.routePeopleIslandSetup({params:new URLSearchParams('peopleIsland=1&islandSetup='+method+'&ref=original-ref&net=original-net'),checkRes:{isRegistered,info:isRegistered?window.currentUser:null},refId:'original-ref',netId:'original-net'});},{method,isRegistered});
}
async function validProfile(page){
 await page.locator('#profile-name').fill('合成會員');await page.locator('#profile-phone').fill('0912345678');await page.locator('#profile-privacy-agree').check();
}

try{
 for(const width of [320,390,1280]){
  const f=await fixture({width,mount:true});
  for(const stage of ['review','card']){
   if(stage==='card')await f.page.evaluate(async()=>{window.testStage='card';await window.entry.mountPeopleIslandCard({params:new URLSearchParams(location.search),embedded:true});});
   const pair=f.page.locator('.pic-intro .pic-card-choices'),left=pair.locator('[data-pic-create="upload"]'),right=pair.locator('[data-pic-create="line"]');
   assert.ok((await left.textContent()).includes('上傳名片'));assert.ok((await right.textContent()).replace(/\s/g,'').includes('用LINE生成'));
   const [a,b]=await Promise.all([left.boundingBox(),right.boundingBox()]);assert.ok(Math.abs(a.y-b.y)<2&&a.x<b.x&&Math.abs(a.width-b.width)<2,'creation choices remain equal left/right columns');
   assert.ok((await pair.textContent()).match(/個資|個人資料/));assert.equal(await f.page.locator('[data-pic-share]').count(),1);
   assert.equal(await f.page.locator('[data-pic-primary]').isVisible(),false);assert.equal(await f.page.evaluate(()=>window.generations.length+window.uploadInputs.length),0);
   assert.ok(await f.page.locator('.pic-shell').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
  }
  if(width===390&&process.env.ISLAND_CHOICES_SCREENSHOT)await f.page.screenshot({path:process.env.ISLAND_CHOICES_SCREENSHOT,fullPage:true});
  assert.deepEqual(f.errors,[]);cases++;await f.page.close();
 }
 for(const method of ['upload','line']){
  const f=await fixture({mount:true});await f.page.locator('.pic-intro [data-pic-create="'+method+'"]').click();await f.page.waitForURL('https://liff.line.me/**');
  const url=new URL(f.navigations[0]);assert.equal(url.searchParams.get('peopleIsland'),'1');assert.equal(url.searchParams.get('islandSetup'),method);assert.equal(url.searchParams.get('ref'),'original-ref');assert.equal(url.searchParams.get('net'),'original-net');cases++;await f.page.close();
 }
 {
  const f=await fixture();await setup(f.page,'line',false);assert.equal(await f.page.evaluate(()=>window.lastPage),'register');assert.equal(await f.page.evaluate(()=>window.generations.length+window.uploadInputs.length),0);assert.equal(await f.page.locator('[data-pic-return]').count(),1);cases++;await f.page.close();
 }
 {
  const f=await fixture();await setup(f.page,'line');assert.equal(await f.page.locator('#details-profile-registration').getAttribute('open'),'');assert.equal(await f.page.locator('[data-pic-confirm-line]').count(),1);assert.equal(await f.page.evaluate(()=>window.generations.length),0);
  await f.page.locator('#profile-name').fill('');await f.page.locator('#profile-phone').fill('');await f.page.locator('[data-pic-confirm-line]').click();assert.equal(await f.page.evaluate(()=>window.generations.length),0);
  await f.page.locator('#profile-name').fill('合成會員');await f.page.locator('#profile-phone').fill('0912345678');await f.page.locator('#profile-privacy-agree').uncheck();await f.page.locator('[data-pic-confirm-line]').click();assert.equal(await f.page.evaluate(()=>window.generations.length),0);assert.equal(await f.page.evaluate(()=>window.mockOperations.length),0);cases++;
  await validProfile(f.page);await f.page.evaluate(()=>window.failSave=true);await f.page.locator('[data-pic-confirm-line]').click();await f.page.waitForFunction(()=>window.toasts.some(message=>message.includes('合成儲存失敗')));assert.equal(await f.page.evaluate(()=>window.generations.length),0);cases++;
  await f.page.evaluate(()=>window.failSave=false);await f.page.locator('[data-pic-confirm-line]').click();await f.page.waitForFunction(()=>window.generations.length===1);assert.equal(await f.page.evaluate(()=>window.generations[0].current),true);assert.equal(await f.page.evaluate(()=>window.generations[0].userId),B);assert.deepEqual(f.errors,[]);cases++;await f.page.close();
 }
 {
  const f=await fixture();await setup(f.page,'line');await validProfile(f.page);await f.page.evaluate(()=>window.delaySave=true);await f.page.locator('[data-pic-confirm-line]').click();await f.page.waitForFunction(()=>typeof window.releaseSave==='function');await f.page.evaluate(()=>{window.testToken='other-token';window.currentUserProfile={userId:'U'+'c'.repeat(32)};window.releaseSave();});await f.page.waitForFunction(()=>!document.querySelector('[data-pic-confirm-line]').disabled);assert.equal(await f.page.evaluate(()=>window.generations.length),0);cases++;await f.page.close();
 }
 for(const existing of [false,true]){
  const f=await fixture({existing});await setup(f.page,'upload');assert.equal(await f.page.locator('[data-pic-select-upload]').count(),1);assert.equal(await f.page.evaluate(()=>window.uploadPreparations),1);assert.equal(await f.page.evaluate(()=>window.uploadInputs.length),0);
  await f.page.locator('[data-pic-select-upload]').click();await f.page.waitForFunction(()=>window.uploadInputs.length===1);assert.equal(await f.page.evaluate(()=>window.uploadInputs[0]),existing?'file-my-v1-img':'myGalleryInput');assert.equal(await f.page.evaluate(()=>window.mockOperations.length),0);assert.equal(await f.page.evaluate(()=>window.generations.length),0);assert.deepEqual(f.errors,[]);cases++;await f.page.close();
 }
 console.log(`Island card choices: ${cases} cases PASS; 320/390/1280 horizontal choices, separate intent routes, real profile-save validation, cancellation/failure/account fences; no real uploads or writes.`);
}finally{await browser.close();}
