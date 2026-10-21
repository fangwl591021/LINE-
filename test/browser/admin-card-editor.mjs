// Isolated Chromium fixture: production HTML + real editor functions, no production writes.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium} = createRequire(import.meta.url)('playwright');
const read = path => fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const file of ['admin.html','admin-v2.html']) {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.route('**/*',route=>route.abort());
    const html=read(file);
    await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/g,''), {waitUntil:'domcontentloaded'});
    await page.addScriptTag({content:read('js/shared/card-links.js')});
    await page.addScriptTag({content:read('js/shared/admin-card-editor.js')});
    await page.addScriptTag({content:`
      const WORKER_URL='https://fixture.example';
      let currentAdminCardSession=null,adminCardOpenSequence=0,currentAdminEcardImgs={},currentAdminEcardRatios={},currentEditButtons=[];
      let stored={rowId:'CARD_fixture','姓名':'測試名片','自訂名片設定':JSON.stringify(CardLinks.saveConfig({desc:'舊版',buttons:[]},{_cardLinksEditing:'v2',desc:'新版',buttons:[]},true))};
      let allCardsData=[structuredClone(stored)];
      window.messages=[];window.writes=0;
      window.fetch=async()=>({ok:true,json:async()=>({enabled:true})});
      function showToast(message){messages.push(message);}
      function renderAdminCardButtons(){}
      function switchModalTab(){document.getElementById('modal-body-visual').style.display='block';}
      function refreshAdminCardShareUrls(){}
      function updateAdminCardPreview(){}
      function syncAdminEcardImageInput(){}
      function getAdminCardLayout(){return 'landscape';}
      function loadCards(){}
      async function fetchAPI(action,payload){
        try{const cfg=CardLinks.saveConfig(stored['自訂名片設定'],payload.data['自訂名片設定'],true);
          stored={...stored,...payload.data,'自訂名片設定':JSON.stringify(cfg)};writes++;return structuredClone(stored);
        }catch(e){showToast(e.message);return null;}
      }
      window.savedConfig=()=>JSON.parse(stored['自訂名片設定']);
      window.concurrentEdit=()=>{stored['自訂名片設定']=JSON.stringify(CardLinks.saveConfig(stored['自訂名片設定'],{...CardLinks.project(stored['自訂名片設定'],{},true),_cardLinksEditing:'v2',desc:'其他頁修改'},true));};
    `});
    for(const name of ['openEditCardModal','saveCardEdit','closeEditCardModal']) {
      const start=html.search(new RegExp('    (?:async )?function '+name+'\\('));
      const next=html.slice(start+1).search(/\n    (?:async )?function /);
      await page.addScriptTag({content:html.slice(start,start+1+next)});
    }
    await page.addStyleTag({content:'.hidden{display:none} #modal-card-edit{position:fixed;inset:0;background:white;overflow:auto;z-index:9999}'});
    await page.evaluate(()=>openEditCardModal('CARD_fixture'));
    const draft='房屋整修、居家修繕。\n拆除打石，準備空間改造。\n垃圾清運，整理工程廢棄物。\n歡迎洽詢整修需求。';
    await page.locator('#edit-v-desc').fill(draft);
    await page.locator('#btn-save-card').click();
    await page.waitForFunction(()=>window.writes===1);
    assert.equal(await page.evaluate(()=>savedConfig().contactLinksV2.desc),draft);
    await page.evaluate(()=>openEditCardModal('CARD_fixture'));
    assert.equal(await page.locator('#edit-v-desc').inputValue(),draft);
    await page.evaluate(()=>concurrentEdit());
    await page.locator('#edit-v-desc').fill(draft+'（保留草稿）');
    await page.locator('#btn-save-card').click();
    await page.waitForFunction(()=>messages.some(m=>m.includes('其他頁面更新')));
    assert.equal(await page.evaluate(()=>writes),1);
    assert.equal(await page.evaluate(()=>savedConfig().contactLinksV2.desc),'其他頁修改');
    assert.equal(await page.locator('#edit-v-desc').inputValue(),draft+'（保留草稿）');
    console.log(file+': Chromium save/reopen/conflict/draft PASS');
    await page.close();
  }
} finally {await browser.close();}
