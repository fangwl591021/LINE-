import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('js/modules/mycard.js');
const methods=source.slice(source.indexOf('  function cardBusinessInput('),source.indexOf('  function renderWysiwygEditor('));
const render=source.slice(source.indexOf('  function renderWysiwygEditor('),source.indexOf('  function closeMyCardWysiwyg()'));
const copy='提供網站設計與維護，\n讓線上資訊更清楚地呈現。\n從網站畫面到日常內容整理，\n歡迎交流你的網站需求。';
const response={success:true,data:{service:copy,sources:[{url:'https://www.merchant.com/',title:'合成公司產品服務'}],warnings:[]}};
function element(){return {value:'',textContent:'',children:[],isConnected:true,classList:{contains:()=>false},appendChild(el){this.children.push(el);},replaceChildren(){this.children=[];}};}
function fixture(api=async()=>response){
  const ids=Object.fromEntries(['my-wysiwyg-desc-input','my-card-business-brief','my-card-business-result','my-card-business-status','my-card-wysiwyg-editor-modal'].map(k=>[k,element()]));
  ids['my-wysiwyg-desc-input'].value='原說明';
  const card={name:'合成聯絡人',company:'合成公司',phone:'0912345678',website:'www.merchant.com',title:'經理',services:'原說明',birthday:'private'};
  let actor='owner';const calls=[];
  const context=vm.createContext({URL,document:{getElementById:id=>ids[id]||null,createElement:element},
    window:{fetchAPI:async(...args)=>{calls.push(args);return api(...args);}},moduleAuth:{getUserId:()=>actor},
    currentCardData:card,wysiwygState:{cfg:{desc:'原說明'},field:'desc'},cardBusinessRequest:null,cardBusinessDraft:null,
    readCardValue:(record,keys)=>keys.map(k=>record[k]).find(Boolean)||'',parseMyCardSocials:()=>[]});
  vm.runInContext(methods,context);
  return {context,ids,card,calls,button:element(),run:()=>context.generateMyCardBusinessCopy(),actor:v=>actor=v};
}

test('research creates source preview only; explicit apply edits textbox, never saves or mutates the card',async()=>{
  const f=fixture(),before=JSON.stringify(f.card);await f.run();
  assert.equal(f.ids['my-wysiwyg-desc-input'].value,'原說明');assert.equal(f.context.wysiwygState.cfg.desc,'原說明');assert.equal(JSON.stringify(f.card),before);
  const children=f.ids['my-card-business-result'].children;assert.equal(children[0].textContent,copy);assert.equal(children[1].href,'https://www.merchant.com/');assert.equal(children[1].rel,'noopener noreferrer');
  children.at(-1).onclick();assert.equal(f.ids['my-wysiwyg-desc-input'].value,copy);assert.equal(f.context.wysiwygState.cfg.desc,'原說明');assert.equal(JSON.stringify(f.card),before);
  assert.match(f.ids['my-card-business-status'].textContent,/套用.*儲存/);assert.deepEqual(f.calls.map(c=>c[0]),['generateCardCopy']);
  assert.equal(f.calls[0][1].card.jobTitle,'經理');assert.equal(f.calls[0][1].card.birthday,undefined);
});

test('failure keeps original and permits explicit retry; no local fallback writes',async()=>{
  const f=fixture(async()=>({success:false,error:'未找到同一商家'}));await f.run();await f.run();
  assert.equal(f.calls.length,2);assert.equal(f.ids['my-wysiwyg-desc-input'].value,'原說明');assert.equal(f.ids['my-card-business-result'].children.length,0);assert.match(f.ids['my-card-business-status'].textContent,/原說明未變更/);
  const legacy=read('js/modules/cardmaster.js');const method=legacy.slice(legacy.indexOf('  window.generateMyCardCopy ='),legacy.indexOf("  document.addEventListener('DOMContentLoaded'"));
  assert.doesNotMatch(method,/updateCardConfig|buildLocalCopy|setField\(|cfg.desc/);assert.doesNotMatch(legacy,/function buildLocalCopy/);
});

test('double-click charges one request; edited textbox, actor, record, config, close or changed hint invalidate late results',async()=>{
  for(const change of [f=>f.ids['my-wysiwyg-desc-input'].value='手寫新內容',f=>f.actor('another'),f=>f.context.currentCardData={...f.card},f=>f.context.wysiwygState.cfg={desc:'其他版本'},f=>f.context.cardBusinessRequest=null,f=>f.ids['my-card-business-brief'].value='新提示',f=>f.card.company='另一家公司']){
    let resolve;const f=fixture(()=>new Promise(r=>resolve=r));const pending=f.run();await f.run();assert.equal(f.calls.length,1);change(f);resolve(response);await pending;
    assert.equal(f.ids['my-card-business-result'].children.length,0);assert.equal(f.context.cardBusinessDraft,null);assert.notEqual(f.ids['my-wysiwyg-desc-input'].value,copy);
  }
});

test('editing after preview refuses stale apply; unsafe source is not an active link and content stays text',async()=>{
  const f=fixture(async()=>({success:true,data:{...response.data,service:'<img src=x onerror=alert(1)>',sources:[{url:'javascript:alert(1)',title:'bad'},{url:'https://www.merchant.com/',title:'<script>bad</script>'}]}}));await f.run();
  const children=f.ids['my-card-business-result'].children;assert.equal(children.length,3);assert.equal(children[0].textContent,'<img src=x onerror=alert(1)>');
  assert.equal(children[1].textContent,'<script>bad</script> ↗');f.ids['my-wysiwyg-desc-input'].value='使用者已修改';children.at(-1).onclick();assert.equal(f.ids['my-wysiwyg-desc-input'].value,'使用者已修改');
  assert.match(f.ids['my-card-business-status'].textContent,/重新搜尋/);
});

test('reachable desc entry has optional hints, visible preview/source explanation, close and bounded scrolling',()=>{
  assert.match(render,/AI 搜尋並美化說明/);assert.match(render,/選填，不必重填名片/);assert.match(source,/max-height:calc\(100dvh - 3rem\);overflow-y:auto/);
  assert.match(source,/data-card-business-shortcut onclick="window.startMyCardBusinessCopy\(\)"/);
  assert.match(render,/4～5 行短句/);
  assert.match(source,/onclick="window.closeMyCardWysiwygEditor\(\)"/);
  assert.match(read('js/core.js'),/action === 'generateCardCopy' \? 100000/);
  const index=read('index.html');assert.match(index,/mycard.js\?v=8.97/);assert.match(index,/cardmaster.js\?v=1.6/);assert.match(index,/core.js\?v=7.38/);
});

test('Chromium mobile viewport: actual editor renders, searches, previews then applies without a save', {skip:!process.env.RUN_CARD_BUSINESS_BROWSER_TESTS},async()=>{
  const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);const {chromium}=require('playwright');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await page.route('**/*',route=>route.abort());
    await page.setContent('<style>.hidden{display:none}.flex{display:flex}button,input,textarea{box-sizing:border-box;width:100%;margin:4px 0;padding:10px}#my-card-wysiwyg-editor-modal{position:fixed;inset:0;padding:24px 16px;background:#eee}#pop{max-height:calc(100dvh - 3rem);overflow-y:auto;background:#fff;padding:16px}p{font:14px sans-serif}a{display:block}</style><div id="my-card-wysiwyg-editor-modal" class="hidden"><div id="pop"><button id="close">關閉</button><h3 id="my-card-wysiwyg-editor-title"></h3><div id="my-card-wysiwyg-editor-body"></div></div></div>');
    await page.addScriptTag({content:`var currentCardData={name:'合成聯絡人',company:'合成公司',phone:'0912345678',website:'www.merchant.com'},wysiwygState={cfg:{desc:'原說明'},field:'desc'},cardBusinessRequest=null,cardBusinessDraft=null;var moduleAuth={getUserId:()=> 'owner'},apiCalls=[];function readCardValue(c,keys){return keys.map(k=>c[k]).find(Boolean)||''}function parseMyCardSocials(){return []}function escapeHTML(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}function escapeAttr(s){return escapeHTML(s).replaceAll('"','&quot;')}function safeCssColor(s,f){return s||f}window.fetchAPI=async(a,p)=>{apiCalls.push(a);return ${JSON.stringify(response)}};${methods}${render}window.generateMyCardBusinessCopy=generateMyCardBusinessCopy;window.applyMyCardWysiwygEditor=()=>{wysiwygState.cfg.desc=document.getElementById('my-wysiwyg-desc-input').value};document.getElementById('close').onclick=()=>{cardBusinessRequest=null;document.getElementById('my-card-wysiwyg-editor-modal').classList.add('hidden')};renderWysiwygEditor('desc');`});
    const closeEditor=source.slice(source.indexOf('  function closeMyCardWysiwygEditor()'),source.indexOf('  function editMyCardWysiwygField('));
    await page.evaluate(()=>{const meta=document.createElement('meta');meta.name='viewport';meta.content='width=device-width, initial-scale=1';document.head.appendChild(meta);});
    await page.addStyleTag({content:'.whitespace-pre-wrap{white-space:pre-wrap}textarea{font:15px/1.5 sans-serif}'});
    await page.addScriptTag({content:closeEditor+";document.getElementById('close').onclick=closeMyCardWysiwygEditor;"});
    await page.getByRole('button',{name:'AI 搜尋並美化說明'}).click();
    await page.getByRole('button',{name:'核對後帶入說明'}).waitFor();assert.equal(await page.locator('#my-wysiwyg-desc-input').inputValue(),'原說明');
    assert.equal(await page.getByRole('link').getAttribute('href'),'https://www.merchant.com/');
    await page.getByRole('button',{name:'核對後帶入說明'}).click();assert.equal(await page.locator('#my-wysiwyg-desc-input').inputValue(),copy);
    assert.equal(await page.evaluate(()=>wysiwygState.cfg.desc),'原說明');assert.deepEqual(await page.evaluate(()=>apiCalls),['generateCardCopy']);
    await page.getByRole('button',{name:'套用',exact:true}).click();assert.equal(await page.evaluate(()=>wysiwygState.cfg.desc),copy);
    await page.getByRole('button',{name:'關閉',exact:true}).click();assert.equal(await page.locator('#my-card-wysiwyg-editor-modal').isVisible(),false);
    // Use the real canvas shortcut markup and handler, not a test-only button.
    const shortcut=source.match(/<button type="button" data-card-business-shortcut[^]*?<\/button>/)[0];
    await page.evaluate(html=>document.body.insertAdjacentHTML('beforeend',html),shortcut);
    await page.getByRole('button',{name:'✨ AI 美化介紹 · 4～5 行'}).click();
    await page.getByRole('button',{name:'核對後帶入說明'}).waitFor();
    assert.deepEqual(await page.evaluate(()=>apiCalls),['generateCardCopy','generateCardCopy']);
    assert.equal((await page.locator('#my-card-business-result p').textContent()).split('\n').length,4);
    assert.equal(await page.evaluate(()=>wysiwygState.cfg.desc),copy);
    if(process.env.CARD_COPY_SCREENSHOT)await page.screenshot({path:process.env.CARD_COPY_SCREENSHOT,fullPage:true});
  }finally{await browser.close();}
});
