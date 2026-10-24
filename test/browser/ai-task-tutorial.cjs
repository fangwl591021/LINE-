// Actual task and tutorial UI, isolated SQLite fixture and local MP4. No live services.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{readFileSync,mkdirSync,writeFileSync}=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),out=path.resolve(root,'../ai-task-tutorial-20261024'),port=8846,origin='http://127.0.0.1:'+port;
const movie=readFileSync(path.join(out,'ai-task-workflow-tutorial-v1.mp4'));
(async()=>{
 const server=spawn(process.execPath,['tools/ai-advance-preview.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe'],windowsHide:true});let log='';server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);
 let browser;
 try{
  for(let i=0;;i++){try{if((await fetch(origin)).ok)break;}catch{}if(i>50)throw Error('Fixture failed '+log);await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
  for(const width of [320,390,1280]){
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],apiCalls=[];let mediaRequests=0;
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/v1/'))apiCalls.push(r.method()+' '+new URL(r.url()).pathname);});
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
    if(url.pathname.endsWith('/ai-task-workflow-tutorial-v1.mp4')){
     mediaRequests++;const m=req.headers().range?.match(/^bytes=(\d+)-(\d*)$/),start=m?Number(m[1]):0,end=m&&m[2]?Math.min(Number(m[2]),movie.length-1):movie.length-1;
     return route.fulfill({status:m?206:200,headers:{'content-type':'video/mp4','accept-ranges':'bytes','content-length':String(end-start+1),...(m?{'content-range':`bytes ${start}-${end}/${movie.length}`}:{})},body:movie.subarray(start,end+1)});
    }
    return route.abort();
   });
   await page.goto(origin);assert.equal(mediaRequests,0);
   await page.locator('#home-ai-advance-entry').click();await page.locator('[data-new]').click();await page.locator('[name=title]').fill('未儲存的示範草稿');await page.locator('[name=description]').fill('觀看教學後繼續填寫');
   assert.equal(mediaRequests,0);const before=apiCalls.length;
   await page.locator('[data-guide]').click();await page.locator('#tutorial-dialog[open]').waitFor();const video=page.locator('#tutorial-dialog video');
   await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video')?.readyState>=2,{},{timeout:30000});
   assert.ok(Math.abs(await video.evaluate(v=>v.duration)-465.875)<.2);assert.equal(await video.evaluate(v=>v.paused),true);
   await page.locator('[data-time="394.25"]').click();await page.waitForFunction(()=>{const v=document.querySelector('#tutorial-dialog video');return v?.currentTime>=394.2&&!v.paused&&!v.seeking;},{},{timeout:30000});
   await video.evaluate(v=>{window.retiredVideo=v;});await page.locator('[data-tutorial-close]').click();
   assert.equal(await page.evaluate(()=>retiredVideo.paused&&!retiredVideo.getAttribute('src')),true);
   assert.equal(await page.locator('[name=title]').inputValue(),'未儲存的示範草稿');assert.equal(await page.locator('[name=description]').inputValue(),'觀看教學後繼續填寫');
   assert.equal(apiCalls.length,before,'help must not call business API');
   assert.equal(await page.locator('[data-guide]').evaluate(b=>document.activeElement===b),true);
   assert.ok(await page.locator('.ai-advance-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth+1),'no overflow at '+width);
   const closePromise=page.waitForEvent('dialog').then(d=>d.accept());await page.locator('[data-close]').click();await closePromise;
   await page.locator('#home-tutorial-entry').click();await page.locator('[data-tutorial-category="tasks"]').click();assert.equal(await page.locator('.tutorial-course').count(),2);await page.locator('[data-course="ai-task-workflow"]').click();
   await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video')?.readyState>=2);assert.equal(await page.locator('#tutorial-dialog video').evaluate(v=>v.paused),true);
   if(width===390){mkdirSync(path.join(out,'qa'),{recursive:true});await page.screenshot({path:path.join(out,'qa/tutorial-player-390.png')});}
   await page.locator('[data-tutorial-close]').click();assert.deepEqual(errors,[]);results.push({width,draftPreserved:true,noBusinessWritesFromHelp:true,chapterSeek:true,stopsOnClose:true,noAutoplay:true});await context.close();
  }
  writeFileSync(path.join(out,'browser-verification.json'),JSON.stringify({success:true,productionWrites:0,results},null,2));console.log(JSON.stringify(results));
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
