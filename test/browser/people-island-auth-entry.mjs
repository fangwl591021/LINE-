// Runs the actual auth/config/bootstrap scripts and actual loading-screen HTML.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const read=file=>readFileSync(new URL('../../'+file,import.meta.url));
const index=read('index.html').toString();
const style=index.match(/<style id="login-bootstrap-style">[\s\S]*?<\/style>/)[0];
const loading=index.slice(index.indexOf('<div id="loading-screen"'),index.indexOf('<div id="toast-container"'));
const browser=await chromium.launch({channel:'chrome',headless:true});let cases=0;
try{
  for(const mode of ['joined-entry','api-failure','module-failure','style-failure','profile-failure','late-replaced-scene','leave-home']){
    const page=await browser.newPage({viewport:{width:390,height:850}}),calls=[],errors=[];
    let release;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://auth-island.test/**',async route=>{
      const req=route.request(),u=new URL(req.url()),file=u.pathname.slice(1);
      assert.equal(req.method(),'GET','auth entry must never create application data');
      if(file==='')return route.fulfill({contentType:'text/html;charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${style}<style>.hidden{display:none!important}</style></head><body>${loading}<div id="app"><main id="main"><div id="page-home" class="hidden">首頁內容</div><div id="page-business-island" class="hidden"></div></main></div><script src="/js/config.js"></script><script>window.Config.WORKER_URL='https://auth-island.test/';</script><script src="/js/login-bootstrap.js"></script><script src="/js/auth.js"></script></body></html>`});
      if(file==='js/modules/people-island-card.js'&&mode==='module-failure')return route.fulfill({status:503,body:'module temporarily unavailable'});
      if(file==='css/people-island-card.css'&&mode==='style-failure')return route.fulfill({status:503,body:'style temporarily unavailable'});
      if(file==='v1/island-entry/status'){
        calls.push(file);
        if(mode==='late-replaced-scene'||mode==='leave-home')await new Promise(resolve=>{release=resolve;});
        return route.fulfill(mode==='api-failure'?{status:503,json:{success:false,error:'資格服務暫時無法確認，請重試。'}}:{json:{success:true,stage:'join'}});
      }
      assert.ok(!file.startsWith('v1/'),'unexpected business request: '+file);
      assert.ok(!file.includes('..'));
      return route.fulfill({contentType:file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'image/png',body:read(file)});
    });
    await page.route('https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/**',route=>route.abort());
    await page.addInitScript(({failProfile})=>{
      sessionStorage.setItem('ACTMASTER_STARTUP_RECOVERY_V1',String(Date.now()));
      window.normalActions=[];window.fetchAPI=async action=>{window.normalActions.push(action);throw Error('normal member flow must not run for a visitor');};
      window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=>'synthetic-token',getProfile:async()=>{if(failProfile)throw Error('合成 LINE profile 暫時無法讀取');return{userId:'synthetic-viewer',displayName:'合成參觀者'};}};
      window.goPage=(page)=>{window.currentPage=page;document.querySelectorAll('[id^="page-"]').forEach(node=>node.classList.add('hidden'));document.getElementById('page-'+page)?.classList.remove('hidden');};
    },{failProfile:mode==='profile-failure'});
    await page.goto('https://auth-island.test/?peopleIslandCard=1&ref=original-ref&net=original-net');
    if(mode==='module-failure'||mode==='style-failure'||mode==='profile-failure'){
      await page.locator('#actmaster-startup-retry').waitFor({state:'visible'});
      assert.equal(await page.locator('#loading-screen').isVisible(),true,'failed mount retains an actionable startup overlay');
      assert.ok((await page.locator('#loading-text').textContent()).includes('暫時無法連線'));
    }else{
      if(mode==='late-replaced-scene'||mode==='leave-home'){
        for(let tries=0;!release&&tries<100;tries++)await page.waitForTimeout(20);
        assert.ok(release,'status read reached server');assert.equal(await page.locator('#loading-screen').isVisible(),true,'loading screen remains until visitor status or retry view is ready');
        if(mode==='late-replaced-scene')await page.evaluate(()=>{document.getElementById('page-business-island').innerHTML='<p id="regular-island">新的正常人脈島畫面</p>';});
        else await page.evaluate(()=>window.goPage('home',true));
        release();
      }
      await page.locator('#loading-screen').waitFor({state:'hidden',timeout:6000}).catch(async error=>{console.log(JSON.stringify({mode,calls,errors,text:await page.locator('body').textContent()}));throw error;});
      if(mode==='api-failure'){
        await page.locator('[data-pic-retry]').waitFor({state:'visible'});assert.ok((await page.locator('[data-pic-status]').textContent()).includes('無法確認'));assert.equal(await page.locator('[data-pic-visit]').isVisible(),false);
      }else if(mode==='late-replaced-scene'){
        await page.waitForTimeout(1150);assert.equal(await page.locator('#regular-island').textContent(),'新的正常人脈島畫面');assert.equal(await page.locator('.pic-shell').count(),0,'old visitor cleanup cannot overwrite replacement scene');
      }else if(mode==='leave-home'){
        await page.waitForTimeout(1150);assert.equal(await page.locator('#page-home').isVisible(),true);assert.equal(await page.evaluate(()=>window.currentPage),'home');assert.equal(await page.locator('[data-pic-visit]').isVisible(),false);
      }else await page.locator('[data-pic-add]').waitFor({state:'visible'});
    }
    assert.deepEqual(await page.evaluate(()=>window.normalActions),[],'no checkUser, automatic registration or LINE sends');assert.deepEqual(errors,[]);
    assert.ok(calls.every(call=>call==='v1/island-entry/status'));cases++;
    await page.close();
  }
  console.log(`People Island actual auth entry: ${cases} cases PASS; real loading shell/config/bootstrap/auth, synthetic identity, zero writes.`);
}finally{await browser.close();}
