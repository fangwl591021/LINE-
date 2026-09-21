// Local synthetic UI only. Never contacts LINE, production APIs or an AI provider.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent('<html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:12px;color:#16372b;font-family:system-ui"><h3>收藏配對 · 本機合成驗收</h3><p>無正式資料、無外部 AI 呼叫</p><input id="search-card-input" aria-label="搜尋"><div id="card-list"></div></body></html>');
  await page.addStyleTag({content:readFileSync(new URL('../../css/styles.css',import.meta.url),'utf8')+' .flex{display:flex}.flex-1{flex:1}.items-center{align-items:center}.justify-between{justify-content:space-between}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.gap-3{gap:12px}.text-right{text-align:right}.w-14{width:56px}.h-14{height:56px}.rounded-full{border-radius:50%}.truncate{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.border-b{border-bottom:1px solid #eee}.py-3{padding:12px 0}.px-3{padding:0 12px}.material-symbols-outlined{font-size:0}.material-symbols-outlined:after{content:"›";font-size:20px}'});
  await page.evaluate(()=>{
    window.currentUserProfile={userId:'TEST'};window.currentUser={userId:'TEST'};window.currentUserCard={自訂名片設定:'{}'};
    const base={sourceType:'private_import',scannerUserId:'TEST',公司名稱:'合成公司',職稱:'合作夥伴',業種:'工商專業服務'};
    window.harvestCards=[{...base,rowId:'OLD',姓名:'既有名片',created_at:'2026-09-01',aiMatch:{status:'completed',score:82,source:'ai',basis:'previous',intentKey:'',reason:'原本儲存的合作理由，保留而不重新計算。',updatedAt:'2026-09-01'}},{...base,rowId:'NEW',姓名:'新收藏名片',created_at:'2026-09-21',aiMatch:{status:'pending',score:null,autoEligible:true}}];
    window.allCards=window.harvestCards;window.__calls=0;window.fetchAPI=()=>{window.__calls++;return new Promise(r=>window.__complete=r);};
  });
  for(const file of ['cards.js','collection-match-auto.js'])await page.addScriptTag({content:readFileSync(new URL('../../js/modules/'+file,import.meta.url),'utf8')});
  await page.evaluate(()=>window.renderCardList(window.harvestCards));
  assert.match(await page.locator('#card-list').innerText(),/82%/);assert.equal(await page.evaluate(()=>__calls),1);
  assert.doesNotMatch(await page.locator('#card-list').innerText(),/先填需求/);
  await page.evaluate(()=>__complete({processed:1,cards:harvestCards.map(c=>c.rowId==='NEW'?{...c,aiMatch:{status:'completed',score:71,source:'ai',basis:'profile',reason:'本機測試綜合配對理由。'}}:c)}));
  await page.getByRole('button',{name:/71%/}).waitFor();
  await page.getByRole('button',{name:'配對排名',exact:true}).click();
  assert.equal(await page.locator('.collection-score').first().innerText(),'82%\n既有 AI 配對');
  await page.screenshot({path:join(tmpdir(),'collection-match-restored-mobile.png')});
  await page.getByRole('button',{name:/82%/}).click();
  assert.match(await page.locator('dialog').innerText(),/沿用既有需求評估/);assert.match(await page.locator('dialog').innerText(),/2026-09-01/);
  await page.getByRole('button',{name:'關閉',exact:true}).click();
  await page.setViewportSize({width:1280,height:800});await page.screenshot({path:join(tmpdir(),'collection-match-restored-desktop.png')});
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>__calls),1);
  console.log('PASS mobile/desktop: existing 82% before AI, new 71% after mock completion, ranking, historical reason, no forced rescore.');
  console.log(join(tmpdir(),'collection-match-restored-mobile.png'));
}finally{await browser.close();}
