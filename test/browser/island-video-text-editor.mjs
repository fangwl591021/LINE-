// Actual shared mycard canvas/field handlers. Synthetic callbacks only; no API,
// personal card writes, real LINE or media requests are permitted.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const code=readFileSync(new URL('../../js/modules/mycard.js',import.meta.url),'utf8');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:850}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',route=>route.abort());
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui}button,input,textarea{font:inherit;max-width:100%}.hidden{display:none!important}.w-full{width:100%}.block{display:block}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1;min-height:0}.h-full{height:100%}.overflow-y-auto{overflow-y:auto}.items-center{align-items:center}.justify-between{justify-content:space-between}.gap-2{gap:8px}
#my-card-wysiwyg-modal{position:fixed;inset:0;z-index:20;background:#1A1B1E;color:white;overflow:auto;padding:12px}
#my-card-wysiwyg-preview{max-width:390px;margin:auto}#my-card-wysiwyg-editor-modal{position:fixed;inset:0;z-index:30;background:#000a;display:flex;align-items:center;justify-content:center;padding:18px}
#my-card-wysiwyg-editor-modal>div{background:white;color:#142f3b;padding:16px;max-width:360px;width:100%}input:not([type=radio]),textarea{display:block;width:100%}.my-wysiwyg-card-shell{color:#173f34}h3{overflow-wrap:anywhere}
</style></head><body><input name="my-ecard-layout" type="radio" value="landscape" checked><input id="my-v1-img-url"><input id="my-v1-video-url"></body></html>`);
await page.evaluate(()=>{
 window.currentUserProfile={userId:'U'+'a'.repeat(32),displayName:'合成會員'};window.userRole='user';window.Config={POINT_LIFF_ID:'1660923784-vViMTZ1y'};
 window.personalCalls=[];window.fetchAPI=async(action,payload)=>{window.personalCalls.push({action,payload});throw Error('Personal API forbidden');};window.toasts=[];window.showToast=m=>window.toasts.push(m);
 window.actor='owner-A';window.token='fresh-A';window.saved={title:'我的人脈島',desc:'原本已儲存的介紹'};window.saves=[];window.shares=[];window.closed=0;
 window.openCampaign=()=>{const actor=window.actor,token=window.token;window.handle=window.MyCardModule.openVideoCardTextEditor({...window.saved,videoUrl:'https://media.invalid/island.mp4',thumbnailUrl:'https://media.invalid/island.jpg',buttons:[{l:'加入點數通・探索人脈島',c:'#087657'},{l:'分享好友',c:'#487568'}],isCurrent:()=>window.actor===actor&&window.token===token,onSave:async data=>{window.saves.push({...data});if(window.failSave)throw Error('409 其他頁面已更新');if(window.holdSave)await new Promise(resolve=>{window.releaseSave=resolve;});window.saved={...data};},onShare:async()=>{window.shares.push({...window.saved});},onClose:()=>{window.closed++;}});};
});
await page.addScriptTag({content:code});
// Establish a real personal editor state, then close it before the independent
// campaign. Its exact object reference/config must survive every campaign action.
await page.evaluate(async()=>{
 window.personal={rowId:'CARD_STD_original',name:'原始本人名片',lineId:window.currentUserProfile.userId,customConfig:JSON.stringify({title:'PERSONAL_KEEP',desc:'PERSONAL_DESCRIPTION_KEEP',layoutStyle:'landscape',imgUrl:'https://media.invalid/personal.jpg',buttons:[{l:'個人網站',u:'https://example.com',c:'#087657'}]})};
 window.personalVideo={rowId:'CARD_VIDEO_existing',customConfig:'{"title":"EXISTING_VIDEO_KEEP","videoUrl":"https://media.invalid/original.mp4"}'};window.allCards=[window.personal,window.personalVideo];
 await window.MyCardModule.openMyCardWysiwyg(null,window.personal);window.closeMyCardWysiwyg();
 window.originalPersonal=window.currentUserCard;window.personalBefore=JSON.stringify([window.personal,window.personalVideo,window.currentUserCard]);window.openCampaign();
});
assert.equal(await page.locator('[data-video-card-text-canvas] video').getAttribute('style').then(s=>s.includes('9/16')),true);
assert.equal(await page.locator('[onclick*="setMyCardWysiwygLayout"]').count(),0);
assert.equal(await page.locator('[onclick*="addMyCardWysiwygButton"]').count(),0);
assert.equal(await page.locator('[onclick*="editMyCardWysiwygButton"]').count(),0);
await page.locator('[data-video-card-text-title]').click();
assert.equal(await page.locator('#my-wysiwyg-title-input').getAttribute('maxlength'),'80');
await page.locator('#my-wysiwyg-title-input').fill('合作機會 <img src=x onerror=alert(1)>');
await page.locator('#my-card-wysiwyg-editor-body button').click();
assert.equal(await page.locator('[data-video-card-text-title] img').count(),0);
await page.locator('[data-video-card-text-desc]').click();
assert.equal(await page.locator('#my-wysiwyg-desc-input').getAttribute('maxlength'),'800');
assert.equal(await page.locator('#my-card-business-generate').count(),0);
await page.locator('#my-wysiwyg-desc-input').fill('第一行：互相認識\n第二行：交流合作');
await page.locator('#my-card-wysiwyg-editor-body button').click();
await page.locator('[data-video-card-text-share]').click();
assert.deepEqual(await page.evaluate(()=>window.shares),[{title:'我的人脈島',desc:'原本已儲存的介紹'}],'share callback receives no unsaved editor config');
await page.evaluate(()=>{window.failSave=true;});
await page.locator('button[onclick="window.saveMyCardWysiwyg(this)"]').click();
assert.match(await page.locator('#my-video-card-text-status').textContent(),/409.*草稿仍保留/);
assert.equal(await page.locator('#my-card-wysiwyg-modal').isVisible(),true);
assert.match(await page.locator('[data-video-card-text-desc]').textContent(),/第一行/);
await page.evaluate(async()=>{
 await window.saveMyECardConfig();await window.shareMyCard();await window.MyCardModule.openMyCardVideoFlow();await window.generateCardFromProfile();
 window.setMyUploadImage('https://media.invalid/forbidden.jpg');window.applyMyVideoCardMedia('https://media.invalid/forbidden.mp4','https://media.invalid/forbidden.jpg');
 window.editMyCardWysiwygField('image');window.addMyCardWysiwygButton();window.removeMyCardWysiwygButton();window.completeMyCardLinks();window.setMyCardWysiwygAlign('end');
 window.MyCardModule.updateButton();
});
assert.equal(await page.locator('#my-card-wysiwyg-editor-modal').isVisible(),false);
assert.equal(await page.evaluate(()=>window.personalCalls.length),0);
await page.evaluate(()=>{window.failSave=false;window.holdSave=true;window.pendingSave=Promise.all([window.saveMyCardWysiwyg(),window.saveMyCardWysiwyg()]);});
assert.equal(await page.evaluate(()=>window.saves.length),2,'one failed save plus one new in-flight save; duplicate click is ignored');
await page.evaluate(()=>{window.releaseSave();});
await page.evaluate(()=>window.pendingSave);
assert.equal(await page.locator('#my-card-wysiwyg-modal').isVisible(),false);
assert.equal(await page.evaluate(()=>window.saved.title),'合作機會 <img src=x onerror=alert(1)>');
assert.equal(await page.evaluate(()=>window.personalBefore===JSON.stringify([window.personal,window.personalVideo,window.currentUserCard])&&window.currentUserCard===window.originalPersonal),true);
await page.evaluate(()=>{window.holdSave=false;window.openCampaign();});
assert.match(await page.locator('[data-video-card-text-title]').textContent(),/合作機會/,'reopen reads persisted callback data');
await page.locator('[data-video-card-text-title]').click();await page.locator('#my-wysiwyg-title-input').fill('未儲存的取消內容');await page.locator('#my-card-wysiwyg-editor-body button').click();
const beforeCancel=await page.evaluate(()=>window.saves.length);await page.evaluate(()=>window.closeMyCardWysiwyg());assert.equal(await page.evaluate(()=>window.saves.length),beforeCancel);
await page.evaluate(()=>window.openCampaign());assert.notEqual(await page.locator('[data-video-card-text-title]').textContent(),'未儲存的取消內容');
await page.evaluate(()=>{window.token='other-token';});await page.waitForFunction(()=>document.getElementById('my-card-wysiwyg-modal').classList.contains('hidden'));
await page.evaluate(()=>{window.openCampaign();window.holdSave=true;window.pendingSave=window.saveMyCardWysiwyg();});
await page.evaluate(()=>{window.actor='owner-B';});await page.waitForFunction(()=>document.getElementById('my-card-wysiwyg-modal').classList.contains('hidden'));
await page.evaluate(()=>{window.releaseSave();});await page.evaluate(()=>window.pendingSave);
assert.equal(await page.locator('#my-card-wysiwyg-modal').isVisible(),false,'late old-owner result may not reopen the editor');
assert.equal(await page.evaluate(()=>window.personalCalls.length),0);
assert.equal(await page.evaluate(()=>window.personalBefore===JSON.stringify([window.personal,window.personalVideo,window.currentUserCard])&&window.currentUserCard===window.originalPersonal),true);
await page.evaluate(()=>{window.holdSave=false;window.openCampaign();});
for(const width of [320,390,1280]){await page.setViewportSize({width,height:850});await page.screenshot({path:join(tmpdir(),'island-video-text-editor-'+width+'.png')});const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.outerHTML.slice(0,160))}));assert.equal(layout.overflow,false,JSON.stringify({width,...layout}));}
await page.evaluate(()=>window.handle.close());
await page.evaluate(async()=>{await window.MyCardModule.openMyCardWysiwyg(null,window.personal);});
assert.match(await page.locator('#my-card-wysiwyg-preview').textContent(),/PERSONAL_KEEP/,'normal personal editor remains usable after campaign close');
await page.evaluate(()=>window.closeMyCardWysiwyg());
assert.deepEqual(errors,[]);
const result={passed:true,personalWrites:await page.evaluate(()=>window.personalCalls.length),widths:[320,390,1280],cases:['shared-title-description-controls','readonly-media-buttons','escaped-copy','saved-copy-share','409-draft-retained','singleflight','cancel-no-write','owner-token-fences','personal-state-reference-restored','regular-editor-reopens']};
writeFileSync(join(tmpdir(),'island-video-text-editor-result.json'),JSON.stringify(result,null,2));
console.log('PASS shared video editor text adapter: actual controls, saved share, 409 draft, single-flight, cancel, actor/token fence, personal state restored, 320/390/1280; personal writes=0');
await browser.close();
