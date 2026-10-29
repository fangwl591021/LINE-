// Read-only loopback fixture. Browser requests and API methods are deny-by-default.
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {handSignFixture,OTHER,ADMIN,mapper} from '../fixtures/hand-sign-applications.mjs';
import {handleRewardApplications} from '../../worker/reward-applications.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/[\\/]$/,'');
const output=resolve(root,'../member-cooperation-browser');mkdirSync(output,{recursive:true});
const missingUser='U'+'d'.repeat(32);
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const source=readFileSync(join(root,'index.html'),'utf8');
const home=readFileSync(join(root,'js/modules/home.js'),'utf8');
const extractFunction=(name,next)=>{
 const start=home.indexOf('    window.'+name+' = function('),end=home.indexOf(next,start);
 assert(start>=0&&end>start,`Missing home function ${name}`);return home.slice(start,end);
};
const avatarStart=source.lastIndexOf('<button',source.indexOf('id="home-profile-avatar-button"'));
const avatarEnd=source.indexOf('</button>',avatarStart)+9;
const detailsStart=source.indexOf('<details id="details-profile-registration"');
const entryId=source.indexOf('id="member-cooperation-entry"');
const entryStart=source.lastIndexOf('<button',entryId),detailsEnd=source.indexOf('</details>',detailsStart)+10;
assert(avatarStart>=0&&avatarEnd>avatarStart&&entryStart>=0&&entryId<detailsStart&&detailsEnd>detailsStart);
const fragment=source.slice(entryStart,detailsEnd);
const navFragment=id=>{const start=source.indexOf(`<nav id="${id}"`),end=source.indexOf('</nav>',start)+6;assert(start>=0&&end>start);return source.slice(start,end);};
const sharedCss=['body.shared-front-banner-page #top-nav { display: none !important; }','body.shared-front-banner-page:not(.home-page) #main { padding-top: 0; }'].map(rule=>{assert(source.includes(rule),'Missing real shared-page CSS');return rule;}).join('\n');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/styles.css?v=7.6"><link rel="stylesheet" href="/css/home-reference-theme.css?v=2"><style>
/* Local approximation of the relevant CDN Tailwind utilities; no external requests. */
*,::before,::after{box-sizing:border-box}body{margin:0;font:16px sans-serif}.hidden{display:none!important}button{cursor:pointer}#app{width:100%;max-width:448px;height:100vh;position:relative;display:flex;flex-direction:column;overflow:hidden;margin:auto}#main{flex:1;overflow-y:auto;overflow-x:hidden;padding:112px 16px 128px}#page-home{min-height:950px}#page-admin-settings{padding-top:8px;min-height:1600px}#member-cooperation-entry{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:16px 0;margin-bottom:16px;border:0;border-radius:16px;font-weight:700}summary{padding:20px}dialog{max-width:95vw;box-sizing:border-box}
#top-nav,#bottom-nav,#bottom-nav-admin{position:fixed;left:50%;transform:translateX(-50%);width:100%;max-width:448px}#top-nav{top:0;min-height:96px;z-index:40;background:white;padding:12px 20px}#bottom-nav,#bottom-nav-admin{bottom:0;height:76px;z-index:40;background:white;display:flex;justify-content:space-evenly;align-items:center;padding:8px 4px;border-radius:24px 24px 0 0}#bottom-nav-admin{z-index:80}.nav-btn{display:flex;flex:1;min-width:48px;height:100%;flex-direction:column;align-items:center;justify-content:center}
${sharedCss}
</style><div id="app">${navFragment('top-nav')}<main id="main"><div id="page-home">${source.slice(avatarStart,avatarEnd)}</div><div id="page-admin-settings" class="hidden"><div style="height:250px" aria-hidden="true"></div>${fragment}</div><p id="toast" role="status"></p></main>${navFragment('bottom-nav')}${navFragment('bottom-nav-admin')}</div><script>
window.currentPage='home';window.currentUserProfile={userId:'${OTHER}'};window.testToken='user';window.loggedIn=true;
window.realSharedLayout=new URLSearchParams(location.search).get('layout')==='shared';
window.Config={WORKER_URL:location.origin};window.liff={isLoggedIn:()=>window.loggedIn,getAccessToken:()=>window.testToken};
window.showToast=message=>document.querySelector('#toast').textContent=message;
window.goPage=page=>{window.currentPage=page;document.body.classList.toggle('home-page',window.realSharedLayout&&page==='home');document.body.classList.toggle('shared-front-banner-page',window.realSharedLayout&&['home','card','customers','admin-settings','card-detail'].includes(page));document.querySelector('#page-home').classList.toggle('hidden',page!=='home');document.querySelector('#page-admin-settings').classList.toggle('hidden',page!=='admin-settings');document.querySelector('#bottom-nav').classList.remove('hidden');document.querySelector('#bottom-nav-admin').classList.add('hidden');};
${extractFunction('handleHomeAvatarClick','    function parseHomeBirthday_')}
${extractFunction('openProfileRegistrationPanel','    function getHomeProfileCardId_')}
</script><script src="/js/modules/member-cooperation-entry.js?v=1"></script></html>`;

let cleanup;const fixture=await handSignFixture({after:fn=>cleanup=fn});
fixture.sql.exec('PRAGMA query_only=ON');
const requests=[],responses=[],violations=[],blockedAvatarImages=[],layoutFailures=[];
const fakeLine=async(url,options)=>{assert.equal(url,'https://api.line.me/v2/profile');assert.equal(options.redirect,'manual');const identity={'Bearer admin':ADMIN,'Bearer user':OTHER,'Bearer missing-user':missingUser}[options.headers.Authorization];assert(identity,'Unexpected synthetic token');return Response.json({userId:identity});};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method!=='GET'){violations.push(`${req.method} ${url.pathname}`);res.writeHead(405).end();return;}
 if(url.pathname.startsWith('/v1/')){
  requests.push(url.pathname+url.search);
  const response=await handleRewardApplications(new Request(url,{headers:req.headers}),fixture.env,mapper,fakeLine);
  responses.push(response.status);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 const file=resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+sep)||!['.js','.mjs','.css'].includes(extname(file))){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(file));
}catch(error){res.writeHead(500).end(String(error));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const layout of ['conservative','shared'])for(const width of [320,390,1280]){
  const context=await browser.newContext({viewport:{width,height:800}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin||request.method()!=='GET'){
   if(request.method()==='GET'&&url.href==='https://upload.wikimedia.org/wikipedia/commons/4/41/LINE_logo.svg')blockedAvatarImages.push(url.href);
   else violations.push(`${request.method()} ${url.origin}${url.pathname}`);
   return route.abort();
  }return route.continue();});
  await page.goto(origin+'/?layout='+layout);await page.click('#home-profile-avatar-button');
  await page.waitForFunction(()=>document.querySelector('#details-profile-registration').open);
  await page.waitForTimeout(700);
  const position=await page.locator('#member-cooperation-entry').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};});
  if(width===390)await page.screenshot({path:join(output,`member-entry-390-${layout}-synthetic.png`)});
  const computed=await page.evaluate(()=>({topDisplay:getComputedStyle(document.querySelector('#top-nav')).display,paddingTop:getComputedStyle(document.querySelector('#main')).paddingTop,shared:document.body.classList.contains('shared-front-banner-page')}));
  if(layout==='shared')assert.deepEqual(computed,{topDisplay:'none',paddingTop:'0px',shared:true});
  else assert.notEqual(computed.topDisplay,'none');
  const hit=await page.locator('#member-cooperation-entry').evaluate(el=>{const r=el.getBoundingClientRect(),target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2),nav=document.querySelector('#bottom-nav').getBoundingClientRect();return {ok:el.contains(target),hit:target?.id||target?.tagName,navTop:nav.top};});
  const viewportOK=position.top>=0&&position.bottom<=800&&position.left>=0&&position.right<=width,bottomOK=position.bottom<=hit.navTop;
  console.log(`LAYOUT ${layout} ${width}px ${JSON.stringify({position,hit,computed,viewportOK,bottomOK})}`);
  if(!viewportOK||!bottomOK||!hit.ok){layoutFailures.push({layout,width,position,hit,viewportOK,bottomOK});await context.close();continue;}
  requests.length=0;await page.click('#member-cooperation-entry');
  const dialog=page.locator('dialog.reward-application-dialog');await dialog.waitFor();
  const tabs=dialog.locator('.ra-kind-tabs button');await tabs.first().waitFor();assert.equal(await tabs.count(),4);
  if(width===390)await page.screenshot({path:join(output,`member-dialog-390-${layout}-synthetic.png`)});
  for(const [kind,label] of [['reward','贈點單位'],['discount','特約折抵店家'],['partner','共創夥伴115.10契約'],['full','雙向完整版']]){
   await dialog.getByRole('button',{name:label,exact:true}).click();
   await page.waitForFunction(kind=>document.querySelector(`.ra-kind-tabs [data-kind="${kind}"]`)?.getAttribute('aria-pressed')==='true',kind);
   assert(requests.some(path=>path.startsWith('/v1/'+kind+'-applications')));
  }
  await page.evaluate(()=>window.currentPage='home');await dialog.waitFor({state:'detached'});
  await page.evaluate(()=>window.currentPage='admin-settings');await page.click('#member-cooperation-entry');await dialog.waitFor();
  await page.evaluate(uid=>{window.currentUserProfile={userId:uid};},ADMIN);await dialog.waitFor({state:'detached'});
  await page.evaluate(()=>{window.loggedIn=false;window.showToast('');});requests.length=0;
  await page.click('#member-cooperation-entry');await page.getByRole('status').filter({hasText:'請先使用 LINE 登入'}).waitFor();
  assert.equal(await dialog.count(),0);assert.equal(requests.length,0);
  await page.evaluate(uid=>{window.loggedIn=true;window.testToken='missing-user';window.currentUserProfile={userId:uid};window.showToast('');},missingUser);requests.length=0;responses.length=0;
  await page.click('#member-cooperation-entry');await dialog.waitFor();
  await dialog.locator('[data-message]').filter({hasText:'請先完成會員註冊'}).waitFor();
  assert.deepEqual(requests,['/v1/reward-applications']);assert.deepEqual(responses,[403]);
  assert.deepEqual(errors,[]);
  for(const kind of ['reward','discount','partner','full'])assert.equal(fixture.sql.prepare(`SELECT count(*) n FROM ${kind}_applications`).get().n,0);
  await context.close();console.log(`PASS ${layout} member cooperation entry ${width}px; GET only, four kinds, account/page changes, logged out and missing member`);
 }
 assert.deepEqual(violations,[]);assert.equal(blockedAvatarImages.length,6);assert.deepEqual(layoutFailures,[],'Navigation obscures the entry');
}finally{await browser.close();server.close();cleanup?.();}
