// Exact released Git bytes in a read-only browser; no business bootstrap or account API.
import {createServer} from 'node:http';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const repo=process.cwd(),dir=process.env.TUTORIAL_PROOF_DIR||'.wrangler/exchange-live-proof';mkdirSync(dir,{recursive:true});
const media=JSON.parse(readFileSync(process.env.TUTORIAL_ARTIFACT_DIR+'/source/export-evidence.json'));
const origin='https://fangwl591021.github.io/LINE-/',cache=new Map(),assets=[],checks=[],sha=d=>createHash('sha256').update(d).digest('hex');
async function remote(file){if(cache.has(file))return cache.get(file);const r=await fetch(origin+file,{cache:'no-store'});assert.equal(r.status,200);const b=Buffer.from(await r.arrayBuffer());cache.set(file,b);return b;}
for(const file of ['index.html','css/tutorial-center.css','js/modules/tutorial-center.js']){const b=await remote(file);assert.equal(sha(b),sha(execFileSync('git',['show','HEAD:'+file],{cwd:repo})),'exact deployed blob '+file);assets.push({file,bytes:b.length,sha256:sha(b)});}
let html=(await remote('index.html')).toString();assert.match(html,/tutorial-center\.js\?v=10/);assert.match(html,/tutorial-center\.css\?v=3/);
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,s=>/src="(?:https:\/\/cdn\.tailwindcss\.com|js\/modules\/tutorial-center\.js)/.test(s)||/tailwind\.config\s*=/.test(s)?s:'');
html=html.replace(/\son[a-z]+="[^"]*"/gi,'').replace('<body class="','<body class="home-page shared-front-banner-page ').replace('id="loading-screen" class="','id="loading-screen" class="hidden ').replace('id="page-home" class="hidden ','id="page-home" class="').replace('</head>','<style>#app{display:block!important}</style></head>');
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);}if(!/^\/(?:css\/[\w-]+\.css|js\/modules\/tutorial-center\.js|assets\/[\w.-]+\.(?:png|svg|jpg))$/.test(u.pathname)){res.writeHead(404);return res.end();}const b=await remote(u.pathname.slice(1)),ext=u.pathname.split('.').pop();res.writeHead(200,{'Content-Type':({css:'text/css',js:'text/javascript',png:'image/png',svg:'image/svg+xml',jpg:'image/jpeg'})[ext]});res.end(b);}catch(e){res.writeHead(502);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=createRequire(import.meta.url)(process.env.TUTORIAL_PLAYWRIGHT||'playwright'),browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const width of [320,390,768,1366]){
    const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),bad=[],errors=[];let mediaRequests=0;
    page.on('request',r=>{if(/\.mp4(?:\?|$)/.test(r.url()))mediaRequests++;if(/workers\.dev|\/api\//.test(r.url()))bad.push(r.url());});page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});const entry=page.locator('#home-tutorial-entry');await entry.click();const ids=[];
    for(const [id,count] of [['members',6],['stores',3],['activities',6],['tasks',1]]){
      await page.locator(`[data-tutorial-category="${id}"]`).click();assert.equal(await page.locator('.tutorial-course').count(),count);ids.push(...await page.locator('.tutorial-course').evaluateAll(xs=>xs.map(x=>x.dataset.course)));
      const row=await page.locator('.tutorial-categories').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,items:Array.from(el.children).map(x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,height:r.height};})};});
      assert.equal(row.items.length,4);assert.ok(row.items.every(x=>Math.abs(x.y-row.items[0].y)<1&&x.height>=44));assert.ok(row.items.every((x,i)=>!i||x.x>row.items[i-1].x));assert.ok(row.items[0].x>=row.left&&row.items[3].right<=row.right+1);assert.equal(await page.locator('.tutorial-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    }
    assert.equal(new Set(ids).size,16);assert.equal(ids.length,16);assert.equal(mediaRequests,0);await page.locator('[data-tutorial-category="members"]').click();await page.screenshot({path:dir+`/live-six-member-lessons-${width}.png`});
    for(const e of media){
      await page.locator(`[data-course="${e.kind}"]`).click();assert.equal(await page.locator('#tutorial-heading').innerText(),e.kind==='exchange-use'?'交流專區使用教學':'交流專區應用教學');await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video')?.readyState>=2,{},{timeout:60000});const v=page.locator('#tutorial-dialog video');assert.equal(await v.evaluate(el=>el.paused),true);assert.ok(Math.abs(await v.evaluate(el=>el.duration)-e.duration)<.3);
      for(const time of [e.chapters[4][0],e.chapters[7][0]]){await page.locator(`[data-time="${time}"]`).click();await page.waitForFunction(t=>{const v=document.querySelector('#tutorial-dialog video');return v&&v.currentTime>=t-.05&&!v.paused&&!v.seeking&&v.webkitAudioDecodedByteCount>0;},time,{timeout:60000});if(width===390)await page.screenshot({path:dir+`/live-${e.kind}-${time}.png`});}
      await v.evaluate(el=>window.retired=el);await page.locator('[data-tutorial-back]').click();assert.equal(await page.evaluate(()=>retired.paused&&!retired.getAttribute('src')),true);assert.equal(await page.locator(`[data-course="${e.kind}"]`).evaluate(el=>el===document.activeElement),true);
    }
    await page.keyboard.press('Escape');assert.equal(await entry.evaluate(el=>el===document.activeElement),true);assert.deepEqual(bad,[]);assert.deepEqual(errors,[]);checks.push({width,fourLabelsOneRow:'PASS',categoryCoverage:16,noMediaBeforeSelection:true,twoMoviesDurationPlaybackAudioSeekCleanup:'PASS'});await context.close();
  }
  const result={result:'PASS',verifiedAt:new Date().toISOString(),site:origin,assets,checks,productionWrites:0,realMessagesSent:0,sourceMode:'published exact bytes; business bootstrap stripped'};writeFileSync(dir+'/live-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}
