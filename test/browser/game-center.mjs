import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createGameCenterPreview} from '../../tools/preview-game-center.mjs';
import {winningBlockReplay} from '../helpers/block-player.mjs';
import {winningReplay} from '../helpers/tank-player.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const preview=createGameCenterPreview();await new Promise(r=>preview.server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${preview.server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[],screens=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{let next=0;window.__raf=new Map();window.__time=0;performance.now=()=>__time;window.requestAnimationFrame=fn=>{const id=++next;__raf.set(id,fn);return id;};window.cancelAnimationFrame=id=>__raf.delete(id);window.__ticks=(n,step=20)=>{for(let i=0;i<n;i++){__time+=step;const callbacks=[...__raf.values()];__raf.clear();callbacks.forEach(fn=>fn(__time));}};});
 let dropCompletion=true;await page.route('**/api',async route=>{
  const body=route.request().postDataJSON();
  if(body.action==='completeGame'&&dropCompletion){dropCompletion=false;await route.abort('failed');return;}
  const response=await route.fetch();const json=await response.json();
  if(['startGame','startDailyTank'].includes(body.action)&&json.data?.sessionId){json.data.seed=1;preview.fixture.sql.prepare('UPDATE daily_tank_sessions SET seed=1,created_at=created_at-120000 WHERE id=?').run(json.data.sessionId);}
  await route.fulfill({response,json});
 });
 const until=fn=>page.waitForFunction(fn,null,{polling:20}),ticks=n=>page.evaluate(n=>__ticks(n),n),shot=async name=>{const path=join(tmpdir(),`game-center-${name}.png`);await page.screenshot({path});screens.push(path);};
 const open=async()=>{await page.getByRole('button',{name:'玩遊戲拿點數',exact:true}).click();await until(()=>document.querySelector('[data-streak]')?.textContent==='0'||document.querySelector('[data-streak]')?.textContent==='1');};
 await page.goto(origin);await until(()=>typeof openGameCenter==='function'&&typeof startDailyTankChallenge==='function');await open();assert.equal(await page.locator('.gc-cards article').count(),3);await shot('lobby-mobile');
 for(const size of [{width:393,height:852},{width:430,height:932},{width:844,height:390},{width:1366,height:768}]){await page.setViewportSize(size);assert.equal(await page.evaluate(()=>document.querySelector('.gc-dialog').scrollWidth<=document.querySelector('.gc-dialog').clientWidth),true);await shot(`${size.width}x${size.height}`);}
 await page.setViewportSize({width:390,height:844});await page.locator('[data-game="block_supply"]').click();await page.getByRole('button',{name:'開始補給',exact:true}).waitFor();await shot('block-welcome');await page.getByRole('button',{name:'開始補給',exact:true}).click();
 for(const [count,mask]of winningBlockReplay(1).replay){for(const [bit,key]of [[1,'ArrowLeft'],[2,'ArrowRight'],[4,'ArrowDown'],[8,'ArrowUp'],[16,'Space']])if(mask&bit)await page.keyboard.down(key);await ticks(count);for(const [bit,key]of [[1,'ArrowLeft'],[2,'ArrowRight'],[4,'ArrowDown'],[8,'ArrowUp'],[16,'Space']])if(mask&bit)await page.keyboard.up(key);}
 await page.locator('[data-action="confirm"]').waitFor();assert.equal(preview.fixture.sends,0);assert.equal(preview.fixture.balance,300);await shot('retry');
 // Refresh cannot turn a failed request into a speculative credit; proof is retained.
 await page.reload();await until(()=>typeof openGameCenter==='function');await open();await page.locator('[data-gc="confirm"]').click();await until(()=>document.querySelector('#preview-balance').textContent==='400');assert.equal(preview.fixture.sends,1);await page.locator('[data-gc="refresh"]').click();await until(()=>document.querySelector('[data-gc-status]').textContent.includes('已領取'));assert.match(await page.locator('[data-complete="block_supply"]').textContent(),/今日已完成/);await shot('claimed-100');
 await page.locator('[data-game="tank_defense"]').click();await until(()=>__raf.size>0);await page.evaluate(()=>__ticks(1,1000/30+.001));await shot('tank-running');
 for(const [count,mask]of winningReplay(1,2).replay){for(const [bit,key]of [[1,'ArrowUp'],[2,'ArrowRight'],[4,'ArrowDown'],[8,'ArrowLeft'],[16,'Space']])if(mask&bit)await page.keyboard.down(key);await page.evaluate(n=>__ticks(n,1000/30+.001),count);for(const [bit,key]of [[1,'ArrowUp'],[2,'ArrowRight'],[4,'ArrowDown'],[8,'ArrowLeft'],[16,'Space']])if(mask&bit)await page.keyboard.up(key);}
 await until(()=>document.querySelector('#tank-result-message').textContent.includes('今日100點已領取'));assert.equal(preview.fixture.sends,1);assert.equal(preview.fixture.balance,400);await shot('tank-practice-result');
 await page.locator('[data-tank="close"]').first().click();await until(()=>document.querySelector('[data-complete="tank_defense"]').textContent.includes('今日已完成'));assert.equal(await page.locator('[data-week]').textContent(),'2');await shot('both-completed');
 await page.locator('[data-game="block_supply"]').click();await page.getByRole('button',{name:'開始補給',exact:true}).click();await ticks(4500);await until(()=>document.querySelector('.bs-local').textContent.includes('本局成績已保存'));assert.equal(preview.fixture.sends,1);await shot('block-fail');
 await page.getByRole('button',{name:'重新挑戰',exact:true}).click();await page.getByRole('button',{name:'開始補給',exact:true}).waitFor();await page.locator('[data-action="exit"]').click();await page.locator('[data-gc="close"]').click();assert.equal(await page.evaluate(()=>__raf.size),0);assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),'');assert.deepEqual(errors,[]);
 console.log('PASS integrated game center: gallery, five sizes, network failure/refresh recovery, block-first/tank-practice shared 100-point cap, persisted scores, retry, cleanup.');console.log(screens.join('\n'));
}finally{await browser.close();await preview.close();}
