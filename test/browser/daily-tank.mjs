import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createTankPreview} from '../../tools/preview-daily-tank.mjs';
import {winningReplay} from '../helpers/tank-player.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const preview=createTankPreview();await new Promise(r=>preview.server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${preview.server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:900,height:650}}),errors=[];
 const until=fn=>page.waitForFunction(fn,null,{polling:25});
 page.on('pageerror',e=>errors.push(e.message));
 // Instrument state/clock without changing simulation or application source on disk.
 const engine=readFileSync(new URL('../../js/modules/tank-engine.mjs',import.meta.url),'utf8')
  .replace("  if(s.state!=='playing')return s;","  window.__testGame=s; if(s.state!=='playing')return s;");
 await page.route('**/tank-engine.mjs*',r=>r.fulfill({contentType:'text/javascript',body:engine}));
 await page.addInitScript(()=>{
  const Audio=window.Audio;window.__media=[];window.Audio=class extends Audio{constructor(...args){super(...args);window.__media.push(this);}};
  let next=0;window.__raf=new Map();window.__time=0;
  window.requestAnimationFrame=fn=>{const id=++next;__raf.set(id,fn);return id;};
  window.cancelAnimationFrame=id=>__raf.delete(id);
  window.__ticks=n=>{for(let i=0;i<n;i++){__time+=1000/30+.001;const callbacks=[...__raf.values()];__raf.clear();callbacks.forEach(fn=>fn(__time));}};
 });
 await page.goto(origin);await until(()=>typeof startDailyTankChallenge==='function');
 // Render the actual synthesizer to PCM: every effect must contain a non-silent signal.
 const audioLevels=await page.evaluate(async()=>{
  const {synthEffect}=await import('/js/modules/tank-audio.mjs');const levels={};
  for(const kind of ['fire','enemyFire','hit','win','lose','ready']){
   const ctx=new OfflineAudioContext(1,48000,48000);synthEffect(ctx,kind);
   const data=(await ctx.startRendering()).getChannelData(0);
   levels[kind]=Math.sqrt(data.reduce((sum,n)=>sum+n*n,0)/data.length);
  }return levels;
 });
 for(const [kind,rms] of Object.entries(audioLevels))assert.ok(rms>.005,`${kind} audible PCM energy: ${rms}`);
 // Presentation must not change anything used by the backend replay verifier.
 assert.equal(await page.evaluate(async()=>{
  const {createTankRenderer}=await import('/js/modules/tank-renderer.mjs');
  const {createGame}=await import('/js/modules/tank-engine.mjs');const s=createGame(3),before=JSON.stringify(s);
  createTankRenderer(document.createElement('canvas')).draw(s);return JSON.stringify(s)===before;
 }),true);
 assert.match(await page.locator('#daily-tank-task').textContent(),/坦克守衛挑戰/);
 await page.locator('#daily-tank-start').click();await until(()=>__raf.size>0);
 await until(()=>document.querySelector('[data-tank="sound"]').textContent==='音效：開');
 await until(()=>__media.some(a=>a.currentTime>.05));
 assert.equal(await page.evaluate(()=>__media[0].muted),false);
 await until(()=>__media.some(a=>a.loop&&!a.paused&&a.currentTime>.05));
 await page.getByRole('button',{name:'音樂：開',exact:true}).click();
 assert.equal(await page.evaluate(()=>__media.find(a=>a.loop).paused),true);
 assert.equal(await page.locator('[data-tank="sound"]').textContent(),'音效：開');
 await page.getByRole('button',{name:'音樂：關',exact:true}).click();
 await until(()=>__media.some(a=>a.loop&&!a.paused));
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 assert.equal(await page.evaluate(()=>__media.find(a=>a.loop).paused),true);
 await page.getByRole('button',{name:'繼續挑戰'}).click();
 await until(()=>__media.some(a=>a.loop&&!a.paused));
 await page.keyboard.down('a');await page.evaluate(()=>__ticks(8));await page.keyboard.up('a');
 assert.ok(await page.evaluate(()=>__testGame.player.x<276));
 await page.keyboard.down(' ');await page.evaluate(()=>__ticks(3));await page.keyboard.up(' ');
 assert.ok(await page.evaluate(()=>__testGame.bullets.some(b=>!b.enemy)));
 assert.equal(await page.locator('#daily-tank-start').textContent(),'挑戰中');
 await page.screenshot({path:join(tmpdir(),'daily-tank-desktop.png')});
 await page.getByRole('button',{name:'音效：開'}).click();assert.equal(await page.getByRole('button',{name:'音效：關'}).getAttribute('aria-pressed'),'false');
 await page.getByRole('button',{name:'返回每日任務'}).first().click();
 assert.equal(await page.evaluate(()=>__media.filter(a=>a.loop).every(a=>a.paused&&!a.getAttribute('src'))),true);
 // Fully integrated win with real browser module + handler + SQLite + synthetic mother.
 // Game seed is forced through start response route for exact test replay.
 let dropCompletion=true;
 await page.route('**/api',async route=>{
  const body=route.request().postDataJSON();
  if(body.action==='completeDailyTank'&&dropCompletion){dropCompletion=false;await route.abort('failed');return;}
  const response=await route.fetch();const json=await response.json();
  if(body.action==='startDailyTank'&&json.data){
   json.data.seed=1;preview.sql.prepare('UPDATE daily_tank_sessions SET seed=1,created_at=created_at-30000 WHERE id=?').run(json.data.sessionId);
  }
  await route.fulfill({response,json});
 });
 await page.waitForTimeout(1600);await page.locator('#daily-tank-start').click();await until(()=>__raf.size>0);
 await page.evaluate(()=>__ticks(1));
 const keyMap=[[1,'ArrowUp'],[2,'ArrowRight'],[4,'ArrowDown'],[8,'ArrowLeft'],[16,' ']];
 for(const [count,mask] of winningReplay(1,2).replay) {
  for(const [bit,key] of keyMap)if(mask&bit)await page.keyboard.down(key);
  await page.evaluate(n=>__ticks(n),count);
  for(const [bit,key] of keyMap)if(mask&bit)await page.keyboard.up(key);
 }
 await until(()=>!document.querySelector('[data-tank="retry"]').hidden);
 assert.equal(await page.evaluate(()=>__media.filter(a=>a.loop).every(a=>a.paused)),true);
 assert.equal(await page.locator('#preview-balance').textContent(),'300','network failure must not display a speculative award');
 // Unsent proof survives a page refresh; manual retry goes through the same backend reservation.
 await page.reload();await until(()=>!document.getElementById('daily-tank-confirm').hidden);
 await page.locator('#daily-tank-confirm').click();
 await until(()=>document.getElementById('daily-tank-start').textContent==='今日已完成');
 await until(()=>document.getElementById('preview-balance').textContent==='400');
 assert.equal(await page.locator('#preview-balance').textContent(),'400');
 assert.match(await page.locator('#preview-history').textContent(),/每日坦克挑戰 \+100/);
 await until(()=>document.getElementById('daily-tank-start').textContent==='今日已完成');
 assert.equal(await page.locator('#daily-tank-start').isDisabled(),true);
 await page.reload();await until(()=>document.getElementById('daily-tank-start').disabled);
 assert.equal(preview.sql.prepare("SELECT count(*) n FROM point_awards WHERE status='sent'").get().n,1);
 // Mobile pointer controls including hold fire, release and no scrolling. Blocked audio is harmless.
 await page.setViewportSize({width:844,height:390});
 await page.evaluate(()=>{window.AudioContext=class{constructor(){throw Error('audio unavailable');}};HTMLMediaElement.prototype.play=()=>Promise.reject(Error('media blocked'));});
 await page.locator('#daily-tank-practice').click();await until(()=>__raf.size>0);
 assert.equal(await page.locator('[data-tank="sound"]').textContent(),'點此開啟音效');
 assert.equal(await page.locator('[data-tank="music"]').textContent(),'點此開啟音樂');
 await page.evaluate(()=>__ticks(1));
 const box=await page.locator('#tank-stick').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+5,box.y+box.height/2);await page.evaluate(()=>__ticks(8));await page.mouse.up();
 assert.ok(await page.evaluate(()=>__testGame.player.x<276));
 const fbox=await page.locator('#tank-fire').boundingBox();
 await page.mouse.move(fbox.x+fbox.width/2,fbox.y+fbox.height/2);await page.mouse.down();await page.evaluate(()=>__ticks(4));await page.mouse.up();
 assert.ok(await page.evaluate(()=>__testGame.bullets.some(b=>!b.enemy)));
 const client=await page.context().newCDPSession(page);
 const left={x:box.x+box.width/2,y:box.y+box.height/2,id:1},right={x:fbox.x+fbox.width/2,y:fbox.y+fbox.height/2,id:2};
 const beforeTouch=await page.evaluate(()=>__testGame.player.x);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left,right]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...left,x:box.x+5},right]});
 await page.evaluate(()=>__ticks(20));
 assert.ok(await page.evaluate(x=>__testGame.player.x<x,beforeTouch),'touch joystick moves while second finger fires');
 assert.ok(await page.evaluate(()=>__testGame.bullets.some(b=>!b.enemy)));
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();
 await page.screenshot({path:join(tmpdir(),'daily-tank-mobile-landscape.png')});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.tank-dialog')).touchAction),'none');
 for(const size of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);
  for(const sel of ['#tank-stick','#tank-fire','#tank-canvas','[data-tank="music"]']){
   const r=await page.locator(sel).boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=size.width+1&&r.y+r.height<=size.height+1,sel);
  }
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(tmpdir(),'daily-tank-mobile-portrait.png')});
 await page.getByRole('button',{name:'返回每日任務'}).first().click();
 assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),'');
 assert.deepEqual(errors,[]);
 console.log('Tank browser PASS: non-silent PCM for 6 sounds, gesture audio, truthful blocked state, renderer preserves simulation, keyboard, multitouch, landscape/portrait, real replay/API reward, refresh and duplicate guard.');
}finally{await browser.close();await preview.close();}
