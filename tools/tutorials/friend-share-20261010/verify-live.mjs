// Checks exact released Git blobs and public media in a read-only UI fixture.
import {createServer} from 'node:http';
import {writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const repo=process.cwd(),dir=process.env.TUTORIAL_PROOF_DIR||'.wrangler/friend-share-proof';mkdirSync(dir,{recursive:true});
const origin='https://fangwl591021.github.io/LINE-/',cache=new Map(),assets=[],checks=[];
const sha=data=>createHash('sha256').update(data).digest('hex');
async function remote(file){
  if(cache.has(file))return cache.get(file);
  const r=await fetch(origin+file,{cache:'no-store'});assert.equal(r.status,200,'live '+file);
  const bytes=Buffer.from(await r.arrayBuffer());cache.set(file,bytes);return bytes;
}
for(const file of ['index.html','css/tutorial-center.css','js/modules/tutorial-center.js']){
  const bytes=await remote(file);assert.equal(sha(bytes),sha(execFileSync('git',['show','HEAD:'+file],{cwd:repo})),'exact deployed blob '+file);
  assets.push({file,bytes:bytes.length,sha256:sha(bytes)});
}
let html=(await remote('index.html')).toString();assert.match(html,/tutorial-center\.js\?v=9/);assert.match(html,/tutorial-center\.css\?v=3/);
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,s=>/src="(?:https:\/\/cdn\.tailwindcss\.com|js\/modules\/tutorial-center\.js)/.test(s)||/tailwind\.config\s*=/.test(s)?s:'');
html=html.replace(/\son[a-z]+="[^"]*"/gi,'').replace('<body class="','<body class="home-page shared-front-banner-page ').replace('id="loading-screen" class="','id="loading-screen" class="hidden ').replace('id="page-home" class="hidden ','id="page-home" class="').replace('</head>','<style>#app{display:block!important}</style></head>');
const server=createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');
    if(u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);}
    if(!/^\/(?:css\/[\w-]+\.css|js\/modules\/tutorial-center\.js|assets\/[\w.-]+\.(?:png|svg|jpg))$/.test(u.pathname)){res.writeHead(404);return res.end();}
    const bytes=await remote(u.pathname.slice(1)),ext=u.pathname.split('.').pop();res.writeHead(200,{'Content-Type':({css:'text/css',js:'text/javascript',png:'image/png',svg:'image/svg+xml',jpg:'image/jpeg'})[ext]});res.end(bytes);
  }catch(e){res.writeHead(502);res.end(String(e));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=createRequire(import.meta.url)(process.env.TUTORIAL_PLAYWRIGHT||'playwright'),browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const width of [320,390,768,1366]){
    const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),bad=[],errors=[];let media=0;
    page.on('request',r=>{if(/\.mp4(?:\?|$)/.test(r.url()))media++;if(/workers\.dev|\/api\//.test(r.url()))bad.push(r.url());});page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});const entry=page.locator('#home-tutorial-entry');await entry.click();
    const all=[];let row;
    for(const [id,count] of [['members',4],['stores',3],['activities',6],['tasks',1]]){
      await page.locator(`[data-tutorial-category="${id}"]`).click();assert.equal(await page.locator('.tutorial-course').count(),count);
      all.push(...await page.locator('.tutorial-course').evaluateAll(items=>items.map(el=>el.dataset.course)));
      row=await page.locator('.tutorial-categories').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,items:Array.from(el.children).map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,height:r.height};})};});
      assert.equal(row.items.length,4);assert.ok(row.items.every(b=>Math.abs(b.y-row.items[0].y)<1&&b.height>=44));assert.ok(row.items.every((b,i)=>!i||b.x>row.items[i-1].x));assert.ok(row.items[0].x>=row.left&&row.items[3].right<=row.right+1);
      assert.equal(await page.locator('.tutorial-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    }
    assert.equal(new Set(all).size,14);assert.equal(all.length,14);assert.equal(media,0);
    await page.locator('[data-tutorial-category="members"]').click();await page.screenshot({path:dir+`/live-four-tabs-${width}.png`});
    await page.locator('[data-course="friend-share"]').click();await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video')?.readyState>=2,{},{timeout:60000});
    const v=page.locator('#tutorial-dialog video');assert.equal(await v.evaluate(el=>el.paused),true);assert.ok(Math.abs(await v.evaluate(el=>el.duration)-171)<.3);
    for(const time of [54.167,107.375]){
      await page.locator(`[data-time="${time}"]`).click();await page.waitForFunction(t=>{const v=document.querySelector('#tutorial-dialog video');return v&&v.currentTime>=t-.05&&!v.paused&&!v.seeking&&v.webkitAudioDecodedByteCount>0;},time,{timeout:60000});
      if(width===390)await page.screenshot({path:dir+`/live-friend-share-${time}.png`});
    }
    await v.evaluate(el=>window.retired=el);await page.locator('[data-tutorial-back]').click();assert.equal(await page.evaluate(()=>retired.paused&&!retired.getAttribute('src')),true);assert.equal(await page.locator('[data-tutorial-category="members"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-course="friend-share"]').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Escape');assert.equal(await entry.evaluate(el=>el===document.activeElement),true);assert.deepEqual(bad,[]);assert.deepEqual(errors,[]);
    checks.push({viewportWidth:width,fourLabelsOneRow:'PASS',row,allVisible:'PASS',categoryCoverage:14,noMediaBeforeSelection:true,videoDuration:171,chapterSeekAndAudio:'PASS',stopOnExit:'PASS'});await context.close();
  }
  const result={result:'PASS',verifiedAt:new Date().toISOString(),site:origin,assets,checks,productionWrites:0,realLineMessagesSent:0,sourceMode:'published exact bytes; business bootstrap stripped'};
  writeFileSync(dir+'/live-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
