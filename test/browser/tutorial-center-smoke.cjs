// Uses real markup and module in an isolated local preview. No production record writes.
// NODE_PATH must identify installed Playwright dependencies. Media is read from public R2.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mkdirSync}=require('node:fs');
(async()=>{
  const {startPreview}=await import('./tutorial-center-preview.mjs');
  const server=await startPreview(0);
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const checks=[];
  try{
    for(const width of [320,390,768,1366]){
      const context=await browser.newContext({viewport:{width,height:844}});
      const page=await context.newPage();
      let mediaRequests=0;
      const badRequests=[];
      page.on('request',r=>{if(r.url().endsWith('.mp4'))mediaRequests++;if(/workers\.dev|\/api\//.test(r.url()))badRequests.push(r.url());});
      await page.goto(base,{waitUntil:'networkidle'});
      assert.equal(mediaRequests,0,'home must not fetch videos');
      const entry=page.locator('#home-tutorial-entry');
      await entry.click();
      await page.locator('#tutorial-dialog[open]').waitFor();
      assert.equal(await page.locator('.tutorial-course').count(),4);
      assert.equal(await page.locator('button.tutorial-course').count(),3);
      assert.equal(mediaRequests,0,'list must not fetch videos');
      assert.equal(await page.locator('[data-course="merchant"]').innerText().then(t=>t.includes('即將推出')),true);
      await page.locator('[data-course="collection"]').click();
      await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video')?.readyState>=2,{},{timeout:60000});
      assert.equal(await page.locator('#tutorial-dialog video').evaluate(v=>v.paused),true,'no autoplay');
      assert.equal(Math.round(await page.locator('#tutorial-dialog video').evaluate(v=>v.duration)),386);
      assert.equal(await page.locator('#tutorial-dialog video').evaluate(v=>v.muted),false);
      await page.locator('[data-time="156.096"]').click();
      await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video')?.currentTime>=156);
      await page.waitForFunction(()=>!document.querySelector('#tutorial-dialog video')?.paused);
      await page.waitForFunction(()=>{const v=document.querySelector('#tutorial-dialog video');return v&&!v.seeking&&v.readyState>=2;},{},{timeout:60000});
      const bounds=await page.locator('#tutorial-dialog').boundingBox();
      assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1);
      const closeBounds=await page.locator('[data-tutorial-close]').boundingBox();
      assert.ok(closeBounds.y>=0 && closeBounds.y+closeBounds.height<=844);
      assert.equal(await page.locator('.tutorial-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
      if(width===390){
        mkdirSync('.wrangler/tutorial-proof',{recursive:true});
        await page.screenshot({path:'.wrangler/tutorial-proof/player-390.png'});
      }
      await page.evaluate(()=>window.retiredVideo=document.querySelector('#tutorial-dialog video'));
      await page.locator('[data-tutorial-back]').click();
      assert.equal(await page.evaluate(()=>retiredVideo.paused&&!retiredVideo.getAttribute('src')),true);
      if(width===390)await page.screenshot({path:'.wrangler/tutorial-proof/list-390.png'});
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#tutorial-dialog').count(),0);
      assert.equal(await entry.evaluate(e=>e===document.activeElement),true);
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
      if(width===390){await entry.scrollIntoViewIfNeeded();await page.screenshot({path:'.wrangler/tutorial-proof/home-390.png'});}
      // Contextual registration help must retain a typed draft in its original DOM.
      await page.evaluate(()=>{
        document.getElementById('page-home').classList.add('hidden');
        document.getElementById('page-admin-settings').classList.remove('hidden');
        document.getElementById('details-profile-registration').open=true;
        document.getElementById('profile-name').value='測試中的草稿';
      });
      await page.locator('[data-tutorial-open="registration"]').click();
      await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video')?.readyState>=1,{},{timeout:60000});
      await page.evaluate(()=>window.retiredVideo=document.querySelector('#tutorial-dialog video'));
      await page.locator('[data-tutorial-close]').click();
      assert.equal(await page.locator('#profile-name').inputValue(),'測試中的草稿');
      assert.equal(await page.evaluate(()=>retiredVideo.paused&&!retiredVideo.getAttribute('src')),true);
      await page.evaluate(()=>openTutorialCenter('mycard'));
      await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video')?.readyState>=2,{},{timeout:60000});
      await page.locator('[data-time="131.01"]').click();
      await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video')?.currentTime>=131);
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
      assert.equal(await page.locator('#tutorial-dialog video').evaluate(v=>v.paused),true,'background pauses');
      await page.evaluate(()=>{delete document.hidden;closeTutorialCenter();});
      // Idempotent reopen and page-hide cleanup.
      await page.evaluate(()=>{openTutorialCenter();openTutorialCenter();});
      assert.equal(await page.locator('#tutorial-dialog').count(),1);
      await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
      assert.equal(await page.locator('#tutorial-dialog').count(),0);
      await page.route('**/tutorials/2026-10-05/*.mp4',route=>route.abort());
      await page.evaluate(()=>openTutorialCenter('collection'));
      await page.locator('.tutorial-retry:not([hidden])').waitFor();
      assert.match(await page.locator('.tutorial-status').innerText(),/載入失敗/);
      await page.unroute('**/tutorials/2026-10-05/*.mp4');
      await page.locator('.tutorial-retry').click();
      await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video')?.readyState>=2,{},{timeout:60000});
      await page.locator('[data-tutorial-close]').click();
      assert.deepEqual(badRequests,[]);
      checks.push(`${width}px: list, actual playback, chapter, cleanup, focus, draft PASS`);
      await context.close();
    }
    console.log(checks.join('\n'));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
