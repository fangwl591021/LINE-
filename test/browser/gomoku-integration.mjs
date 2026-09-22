import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createGameCenterPreview} from '../../tools/preview-game-center.mjs';
import {gomokuWin} from '../helpers/gomoku-player.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const preview=createGameCenterPreview();await new Promise(r=>preview.server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${preview.server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 let dropped=false;await page.route('**/api',async route=>{
  const {action}=route.request().postDataJSON(),response=await route.fetch(),json=await response.json();
  if(action==='startGame'&&json.data?.sessionId){json.data.seed=1;preview.fixture.sql.prepare('UPDATE daily_tank_sessions SET seed=1,created_at=created_at-120000 WHERE id=?').run(json.data.sessionId);}
  // Server has committed; the client must not assume receipt until reconfirmed.
  if(action==='completeGame'&&!dropped){dropped=true;await route.abort('failed');return;}
  await route.fulfill({response,json});
 });
 const shot=async name=>page.screenshot({path:join(tmpdir(),`gomoku-integrated-${name}.png`),fullPage:true});
 const open=async()=>{await page.getByRole('button',{name:'玩遊戲拿點數',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-streak]')?.textContent!=='—');};
 const moves=async replay=>{for(let i=0;i<replay.length;i++){
  const [x,y]=replay[i],canvas=page.locator('.meow-board');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();await page.touchscreen.tap(box.x+box.width*(30+x*30)/480,box.y+box.height*(30+y*30)/480);
  await page.locator('.meow-app [data-action=confirm]').click();
  if(i<replay.length-1)await page.waitForFunction(n=>document.querySelector('[data-count]').textContent===`第 ${n} 手`&&!document.querySelector('.meow-app').classList.contains('thinking'),(i+1)*2);
 }};
 await page.goto(origin);await page.waitForFunction(()=>typeof openGameCenter==='function');await open();assert.equal(await page.locator('.gc-cards article').count(),3);
 await page.locator('[data-gc=practice]').click();await page.locator('[data-action=start]').click();await page.locator('[data-level=hard]').click();assert.equal(preview.fixture.sql.prepare('SELECT count(*) n FROM daily_tank_sessions').get().n,0);assert.equal(preview.fixture.sends,0);
 await page.getByRole('button',{name:'返回遊戲館',exact:true}).click();await page.locator('[data-game=gomoku]').click();await page.getByRole('button',{name:'開始今日挑戰 →'}).waitFor();
 assert.equal(await page.locator('[data-action=hint]').isVisible(),false);assert.equal(await page.locator('[data-action=undo]').isVisible(),false);assert.equal(await page.locator('.meow-levels').isVisible(),false);
 await shot('mobile-welcome');await page.getByRole('button',{name:'開始今日挑戰 →'}).click();await moves(gomokuWin);
 await page.locator('[data-action=confirm-reward]').waitFor();assert.equal(preview.fixture.sends,1);assert.equal(preview.fixture.balance,400);assert.equal(await page.locator('#preview-balance').textContent(),'300');assert.doesNotMatch(await page.locator('[data-result]').textContent(),/已入帳/);await shot('retry');
 // Pending proof survives refresh; retry cannot issue a second credit.
 await page.reload();await page.waitForFunction(()=>typeof openGameCenter==='function');await open();await page.locator('[data-gc=confirm]').click();await page.waitForFunction(()=>document.querySelector('#preview-balance').textContent==='400');assert.equal(preview.fixture.sends,1);
 await page.locator('[data-gc=refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-complete=gomoku]').textContent.includes('今日已完成'));
 await page.locator('[data-game=gomoku]').click();await page.getByRole('button',{name:'開始今日挑戰 →'}).click();await moves(gomokuWin);await page.waitForFunction(()=>document.querySelector('[data-result]')?.textContent.includes('今日100點已領取'));assert.equal(preview.fixture.sends,1);
 await shot('already-claimed');await page.locator('[data-action=again]').click();await page.getByRole('button',{name:'開始今日挑戰 →'}).waitFor();assert.equal(preview.fixture.sql.prepare("SELECT count(*) n FROM daily_tank_sessions WHERE game_id='gomoku'").get().n,3);
 await page.locator('[data-action=start]').click();await page.locator('canvas').focus();await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-count]').textContent==='第 2 手');
 await page.locator('[data-action=restart]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.gc-dialog').evaluate(d=>d.open),true);
 for(const viewport of [{width:320,height:740},{width:844,height:390},{width:1366,height:900}]){await page.setViewportSize(viewport);assert.equal(await page.locator('.gc-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true);await shot(`${viewport.width}x${viewport.height}`);}
 await page.evaluate(()=>{window.currentUserProfile.userId='changed';});await page.locator('[data-action=restart]').click();assert.match(await page.locator('[data-note]').textContent(),/身分已變更/);assert.equal(preview.fixture.sends,1);
 await page.locator('.meow-exit').click();await page.locator('[data-gc=close]').click();assert.equal(await page.locator('canvas').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),'');
 assert.deepEqual(errors,[]);assert(requests.every(r=>r.startsWith(origin)||r.startsWith('blob:')||r.startsWith('data:')));
 console.log('PASS integrated Gomoku: practice isolation, legal touch victory, committed-response loss/reload/retry, same-day cap, new session on replay, keyboard, nested Escape, three sizes, identity change, cleanup.');
}finally{await browser.close();await preview.close();}
