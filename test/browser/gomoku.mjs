import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createGomokuPreview} from '../../tools/preview-gomoku.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const preview=createGomokuPreview();await new Promise(r=>preview.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${preview.server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(url);await page.getByRole('button',{name:'開始和小貓下棋 →'}).waitFor();await page.locator('.meow-art').evaluate(img=>img.decode());
  const shot=async name=>page.screenshot({path:join(tmpdir(),`gomoku-${name}.png`),fullPage:true});await shot('mobile-welcome');
  await page.getByRole('button',{name:'開始和小貓下棋 →'}).click();const canvas=page.locator('canvas'),box=await canvas.boundingBox();
  await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);assert.equal(await page.evaluate(()=>gomokuPreview.getSnapshot().moves.length),0);
  await page.getByRole('button',{name:'確認落子',exact:true}).click();assert.equal(await page.evaluate(()=>gomokuPreview.getSnapshot().moves.length),1);
  await page.waitForFunction(()=>gomokuPreview.getSnapshot().moves.length===2&&!gomokuPreview.getSnapshot().busy);await shot('mobile-play');
  await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);assert.match(await page.locator('[data-note]').innerText(),/已經有棋子/);
  await page.getByRole('button',{name:'↶ 悔一步'}).click();assert.equal(await page.evaluate(()=>gomokuPreview.getSnapshot().moves.length),0);
  await page.getByRole('button',{name:'✧ 小提示'}).click();await page.waitForFunction(()=>!!gomokuPreview.getSnapshot().selected&&!gomokuPreview.getSnapshot().busy);assert.equal(await page.evaluate(()=>gomokuPreview.getSnapshot().moves.length),0);
  await page.getByRole('button',{name:'確認落子',exact:true}).click();await page.getByRole('button',{name:'↶ 悔一步'}).click();await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>gomokuPreview.getSnapshot().moves.length),0);
  await page.getByRole('button',{name:'貓王挑戰',exact:true}).click();assert.equal(await page.evaluate(()=>gomokuPreview.getSnapshot().level),'hard');
  await canvas.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await page.waitForFunction(()=>gomokuPreview.getSnapshot().moves.length===2&&!gomokuPreview.getSnapshot().busy);
  await page.getByRole('button',{name:'↻ 重開'}).click();assert.equal(await page.locator('[data-reset-dialog]').evaluate(d=>d.open),true);await page.getByRole('button',{name:'繼續這局',exact:true}).click();assert.equal(await page.evaluate(()=>gomokuPreview.getSnapshot().moves.length),2);
  await page.getByRole('button',{name:'♫ 音樂開'}).click();await page.getByRole('button',{name:'♫ 音樂關'}).waitFor();await page.getByRole('button',{name:'♪ 音效開'}).click();await page.getByRole('button',{name:'♪ 音效關'}).waitFor();
  for(const viewport of [{width:320,height:740},{width:844,height:390},{width:1280,height:900}]){await page.setViewportSize(viewport);await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot(`${viewport.width}x${viewport.height}`);}
  // Render a real, populated board: cats must remain distinguishable at phone size.
  await page.setViewportSize({width:390,height:844});await page.locator('[data-action=restart]').click();await page.locator('[data-action=reset-yes]').click();
  for(let i=0;i<12;i++){
    const move=await page.evaluate(async()=>{const g=gomokuPreview.getSnapshot();if(g.winner||g.draw)return null;const {chooseMove}=await import('/js/modules/gomoku-engine.mjs');return chooseMove(g.board,1,'normal');});if(!move)break;
    await canvas.scrollIntoViewIfNeeded();const rect=await canvas.boundingBox();await page.touchscreen.tap(rect.x+rect.width*(30+move.x*30)/480,rect.y+rect.height*(30+move.y*30)/480);await page.locator('[data-action=confirm]').click();
    await page.waitForFunction(()=>{const g=gomokuPreview.getSnapshot();return g.winner||g.draw||(g.turn===1&&!g.busy);});
  }
  assert.match(await page.locator('.meow-help').textContent(),/你先下橘貓，灰灰下灰貓/);
  const colors=await canvas.evaluate(c=>{const ctx=c.getContext('2d'),s=c.width/480,g=gomokuPreview.getSnapshot();return [1,2].map(side=>{const m=g.moves.find(m=>m.side===side);return [...ctx.getImageData(Math.round((30+m.x*30+2)*s),Math.round((30+m.y*30-3)*s),1,1).data];});});
  assert(colors[0][0]>colors[0][2]+50,'orange cat fur');assert(colors[1][2]>colors[1][0],'gray cat fur');
  await page.locator('.meow-board-wrap').screenshot({path:join(tmpdir(),'gomoku-cat-pieces-board.png')});
  await page.getByRole('button',{name:'離開預覽',exact:true}).click();await page.getByRole('heading',{name:'謝謝你陪小貓下棋 ♡'}).waitFor();assert.equal(await page.locator('canvas').count(),0);
  await page.getByRole('button',{name:'再玩一局',exact:true}).click();await page.getByRole('button',{name:'開始和小貓下棋 →'}).waitFor();assert.equal(await page.evaluate(()=>gomokuPreview.getSnapshot().moves.length),0);
  assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.startsWith(url)||r.startsWith('blob:')||r.startsWith('data:')));
  console.log('PASS touch, confirm, AI, occupied cells, hint, undo, stale-response cancellation, keyboard, reset dialog, sound toggles, 4 widths, exit/reopen, no external API.');console.log(join(tmpdir(),'gomoku-mobile-welcome.png'));console.log(join(tmpdir(),'gomoku-1280x900.png'));
}finally{await browser.close();await preview.close();}
