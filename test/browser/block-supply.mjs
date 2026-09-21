import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createBlockPreview} from '../../tools/preview-block-supply.mjs';
import {winningBlockReplay} from '../helpers/block-player.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const preview=createBlockPreview();await new Promise(r=>preview.server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${preview.server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
const artifacts=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const engine=readFileSync(new URL('../../js/modules/block-supply-engine.mjs',import.meta.url),'utf8').replace(" if(s.state!=='playing')return s;"," window.__state=s; if(s.state!=='playing')return s;");
 await page.route('**/block-supply-engine.mjs',r=>r.fulfill({contentType:'text/javascript',body:engine}));
 await page.addInitScript(()=>{
  const Base=window.Audio;window.__media=[];window.Audio=class extends Base{constructor(...args){super(...args);__media.push(this);}};
  let next=0;window.__raf=new Map();window.__time=0;performance.now=()=>__time;
  window.requestAnimationFrame=fn=>{const id=++next;__raf.set(id,fn);return id;};window.cancelAnimationFrame=id=>__raf.delete(id);
  window.__ticks=n=>{for(let i=0;i<n;i++){__time+=20;const callbacks=[...__raf.values()];__raf.clear();callbacks.forEach(fn=>fn(__time));}};
 });
 const ticks=n=>page.evaluate(n=>__ticks(n),n),until=fn=>page.waitForFunction(fn,null,{polling:20});
 const shot=async name=>{const path=join(tmpdir(),`block-supply-${name}.png`);await page.screenshot({path});artifacts.push(path);};
 const load=async()=>{await page.goto(origin);await until(()=>!!window.blockPreview);};
 const start=async()=>{await page.getByRole('button',{name:'開始補給',exact:true}).click();await ticks(1);};
 async function checkLayout(){
  const outside=await page.evaluate(()=>[...document.querySelectorAll('.bs-game button:not([disabled]),.bs-board canvas,.bs-next,.bs-hud')].filter(e=>e.getClientRects().length).filter(e=>{const r=e.getBoundingClientRect();return r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5;}).map(e=>e.textContent||e.tagName));
  assert.deepEqual(outside,[],'all controls and board within viewport');
  for(const b of await page.locator('[data-input]').all()){const r=await b.boundingBox();assert(r.height>=44&&r.width>=44);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 await load();assert.equal(await page.evaluate(()=>__media.length),0,'no audio before gesture');await checkLayout();await shot('welcome');await start();
 await until(()=>__media.some(a=>a.loop&&!a.paused&&a.currentTime>0));
 assert.equal(await page.evaluate(async()=>{const {createGame}=await import('/js/modules/block-supply-engine.mjs'),{createBlockRenderer}=await import('/js/modules/block-supply-renderer.mjs');const s=createGame(1),before=JSON.stringify(s);createBlockRenderer(document.createElement('canvas'),document.createElement('canvas')).draw(s);return before===JSON.stringify(s);}),true);
 const x=await page.evaluate(()=>__state.active.x);await page.keyboard.down('ArrowLeft');await ticks(12);await page.keyboard.up('ArrowLeft');assert(await page.evaluate(x=>__state.active.x<x,x));
 const cells=await page.evaluate(()=>JSON.stringify(__state.active.cells));await page.keyboard.press('z');await ticks(2);assert.notEqual(await page.evaluate(()=>JSON.stringify(__state.active.cells)),cells);
 await page.keyboard.down('ArrowDown');await ticks(6);await page.keyboard.up('ArrowDown');assert(await page.evaluate(()=>__state.active.y>0));
 await page.keyboard.press('p');const paused=await page.evaluate(()=>blockPreview.getResult().durationMs);await ticks(100);assert.equal(await page.evaluate(()=>blockPreview.getResult().durationMs),paused);assert.equal(await page.evaluate(()=>__raf.size),0);assert(await page.evaluate(()=>__media.every(a=>a.paused)));
 await page.keyboard.press('p');await ticks(1);assert.equal(await page.evaluate(()=>__raf.size),1);
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await page.locator('.bs-game').getAttribute('data-mode'),'paused');await page.getByRole('button',{name:'繼續補給'}).click();
 await page.evaluate(()=>{__time+=2000;__ticks(1);});assert.equal(await page.locator('.bs-game').getAttribute('data-mode'),'paused','a background frame gap pauses instead of jumping ahead');await page.getByRole('button',{name:'繼續補給'}).click();
 // Real touch start / hold / end through browser input dispatch.
 const cdp=await context.newCDPSession(page),button=await page.getByRole('button',{name:'向右',exact:true}).boundingBox();
 const before=await page.evaluate(()=>__state.active.x);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:button.x+button.width/2,y:button.y+button.height/2}]});await ticks(18);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert(await page.evaluate(x=>__state.active.x>x,before));const after=await page.evaluate(()=>__state.active.x);await ticks(12);assert.equal(await page.evaluate(()=>__state.active.x),after);assert.equal(await page.evaluate(()=>scrollY),0);
 await page.getByRole('button',{name:'旋轉',exact:true}).tap();await ticks(2);
 const placed=await page.evaluate(()=>__state.placed);await page.getByRole('button',{name:'快速落下',exact:true}).tap();await ticks(2);assert.equal(await page.evaluate(()=>__state.placed),placed+1);
 await checkLayout();await shot('playing');
 for(const viewport of [{width:393,height:852},{width:430,height:932},{width:844,height:390},{width:1366,height:768}]){
  await page.setViewportSize(viewport);await checkLayout();await shot(`${viewport.width}x${viewport.height}`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'音樂 開',exact:true}).click();assert(await page.evaluate(()=>__media.filter(a=>a.loop).every(a=>a.paused)));assert.equal(await page.getByRole('button',{name:'音效 開',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'音效 開',exact:true}).click();await page.reload();await until(()=>!!window.blockPreview);assert.equal(await page.getByRole('button',{name:'音樂 關',exact:true}).getAttribute('aria-pressed'),'false');assert.equal(await page.getByRole('button',{name:'音效 關',exact:true}).getAttribute('aria-pressed'),'false');
 await start();await page.evaluate(()=>{blockPreview.restart();blockPreview.restart();});assert.equal(await page.evaluate(()=>__raf.size),1);
 // A host mounts through the public adapter; completion/failure callbacks fire once.
 await page.evaluate(async()=>{blockPreview.destroy();const {createBlockSupply}=await import('/js/modules/block-supply-controller.mjs');window.__completed=[];window.__failed=[];window.blockPreview=createBlockSupply(document.querySelector('#game'),{seed:1,onComplete:(r,p)=>__completed.push({r,p}),onFail:r=>__failed.push(r),onExit:()=>document.querySelector('#launcher').hidden=false});});
 await page.getByRole('button',{name:'開始補給',exact:true}).click();
 // Play the complete winning sequence through keyboard events, no board/state writes.
 const win=winningBlockReplay(1),keyMap=[[1,'ArrowLeft'],[2,'ArrowRight'],[4,'ArrowDown'],[8,'ArrowUp'],[16,'Space']];
 for(const [count,mask]of win.replay){for(const [bit,key]of keyMap)if(mask&bit)await page.keyboard.down(key);await ticks(count);for(const [bit,key]of keyMap)if(mask&bit)await page.keyboard.up(key);}
 assert.equal(await page.locator('.bs-game').getAttribute('data-mode'),'won');assert.deepEqual(await page.evaluate(()=>blockPreview.getResult()),win.result);assert.equal(await page.evaluate(()=>__raf.size),0);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.match(await page.locator('.bs-panel').textContent(),/尚未串接每日獎勵/);await shot('win');
 await ticks(20);assert.equal(await page.evaluate(()=>__completed.length),1);assert.deepEqual(await page.evaluate(()=>__completed[0].p.replay),win.replay);
 await page.getByRole('button',{name:'再玩一次',exact:true}).click();await ticks(4500);assert.equal(await page.locator('.bs-game').getAttribute('data-mode'),'lost');assert.equal(await page.evaluate(()=>__raf.size),0);await shot('lose');
 await ticks(20);assert.equal(await page.evaluate(()=>__failed.length),1);
 await page.setViewportSize({width:844,height:390});await checkLayout();await shot('landscape-result');
 await page.getByRole('button',{name:'返回遊戲館',exact:true}).click();assert.equal(await page.evaluate(()=>__raf.size),0);assert(await page.evaluate(()=>__media.every(a=>a.paused&&!a.getAttribute('src'))));
 await page.getByRole('button',{name:'重新開啟試玩'}).click();await checkLayout();await shot('landscape-welcome');await start();await ticks(1);assert.equal(await page.evaluate(()=>blockPreview.getResult().durationMs),40,'only new instance advances');
 await page.evaluate(()=>{blockPreview.destroy();blockPreview.destroy();});assert.equal(await page.evaluate(()=>__raf.size),0);await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>__raf.size),0);
 // Autoplay failure must not block start or controls.
 await load();await page.evaluate(()=>{HTMLMediaElement.prototype.play=()=>Promise.reject(Error('autoplay blocked'));});await page.getByRole('button',{name:'音樂 關',exact:true}).click();await page.getByRole('button',{name:'音效 關',exact:true}).click();await start();await until(()=>document.querySelector('.bs-audio-status').textContent.includes('音訊受限'));await ticks(10);assert.equal(await page.locator('.bs-game').getAttribute('data-mode'),'playing');
 assert.deepEqual(errors,[]);assert(requests.every(u=>u.startsWith(origin)||u.startsWith('blob:')),'preview never calls remote member/reward services');
 console.log('PASS block UI: keyboard/touch, five viewports, real win/loss, pause/restart/cleanup, audio/preferences/blocked autoplay, renderer purity.');console.log(artifacts.join('\n'));
}finally{await browser.close();await preview.close();}
