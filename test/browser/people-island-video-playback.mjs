// Real published media in the new public preview; no LINE initialization or business API.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const read=path=>readFileSync(new URL('../../'+path,import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,locale:'zh-TW'});
 const writes=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://island-video.test/**',route=>{
  const req=route.request(),path=new URL(req.url()).pathname.slice(1)||'people-island-card.html';
  if(req.method()!=='GET'||path.includes('/v1/')){writes.push(path);return route.abort();}
  try{return route.fulfill({contentType:path.endsWith('.js')||path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':'text/html',body:read(path)});}catch{return route.abort();}
 });
 await page.goto('https://island-video.test/people-island-card.html');
 await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1,{},{timeout:60000});
 const metadata=await page.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,paused:v.paused,autoplay:v.autoplay}));
 assert.equal(metadata.width,1080);assert.equal(metadata.height,1920);assert.ok(Math.abs(metadata.duration-45)<0.3);assert.equal(metadata.paused,true);assert.equal(metadata.autoplay,false);
 await page.locator('video').evaluate(v=>v.play());
 await page.waitForFunction(()=>document.querySelector('video').currentTime>0.5);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
 assert.equal(await page.locator('video').evaluate(v=>v.paused),true);
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 mkdirSync(new URL('../../../people-island-video-output/',import.meta.url),{recursive:true});
 await page.screenshot({path:new URL('../../../people-island-video-output/browser-preview-390.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
 console.log(JSON.stringify({realPublishedMedia:metadata,browserPlayback:true,pagehidePauses:true,realWrites:0,errors}));
}finally{await browser.close();}
