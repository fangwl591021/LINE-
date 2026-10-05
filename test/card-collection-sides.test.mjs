import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as sides from '../js/modules/card-collection-sides.mjs';
import {CardLinks} from '../worker/card-links.mjs';

const source=readFileSync(new URL('../js/modules/a-kaffit-card-scanner-adapter.js',import.meta.url),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
const front='https://example.com/front.jpg',back='https://example.com/back.jpg';
function runtime(){
  const notices=[],calls=[];
  const ctx=vm.createContext({...sides,URL,console,structuredClone,crypto,AbortSignal,setTimeout(){},
    document:{getElementById(){return null},querySelector(){return null},querySelectorAll(){return []}},
    window:{currentUserProfile:{userId:'ACTOR'},canEditCardRecord:()=>true,buildRecognizedCardButtons:()=>[],showToast:m=>notices.push(m)},
    FileReader:class {readAsDataURL(){this.result='data:image/png;base64,dGVzdA==';this.onload()}},
    normalizedVisionLocalization:x=>x,cropByVisionLocalization:async x=>x});
  vm.runInContext(source.replace(/^import[^\n]*\n/gm,''),ctx);
  ctx.window.fetchAPI=async(action,payload)=>{calls.push({action,payload:plain(payload)});if(action==='uploadImageToR2')return {url:back};return {rowId:payload.rowId,success:true}};
  function state(value){ctx.seed=value;vm.runInContext('scanState=seed',ctx);return value;}
  function modal(values={姓名:'測試者',服務項目:'背面服務'}){
    const error={},button={textContent:'儲存'},inputs=Object.entries(values).map(([akField,value])=>({dataset:{akField},value}));
    const fields={querySelectorAll:()=>inputs,querySelector:sel=>inputs.find(x=>sel.includes('"'+x.dataset.akField+'"'))||null};
    return {error,querySelector:sel=>sel==='#ak-review-save'?button:sel==='#ak-review-error'?error:sel==='#ak-review-fields'?fields:null,querySelectorAll:()=>[]};
  }
  return {ctx,state,modal,calls,notices};
}

test('old formats resolve front; image injection is rejected; config is non-mutating',()=>{
  assert.equal(sides.collectionImages({'名片圖檔':front}).front,front);
  assert.equal(sides.collectionImages({customConfig:JSON.stringify({imgUrlLandscape:front})}).front,front);
  assert.equal(sides.imageUrl('javascript:alert(1)'), '');
  assert.deepEqual(sides.cardConfig({customConfig:'invalid'}),{});
  const original={layoutStyle:'portrait',buttons:[{l:'自訂',u:'https://example.com/'}],industryClassification:{primary:'教育培訓'}};
  const updated=sides.withCollectionImages(original,front,back);
  assert.equal(original.collectionImages,undefined);
  assert.deepEqual(updated.buttons,original.buttons);
  assert.deepEqual(updated.industryClassification,original.industryClassification);
  for(const enabled of [true,false])assert.deepEqual(CardLinks.saveConfig(original,updated,enabled).collectionImages,{front,back});
});
test('existing identity/contact values win, missing contacts fill and services merge',()=>{
  const merged=sides.mergeReviewedFields({姓名:'原姓名',手機號碼:'0912000000',服務項目:'原服務',社群LINE:'https://lin.ee/old'}, {姓名:'新姓名',手機號碼:'0912111111',電子郵件:'new@example.com',服務項目:'背面服務',社群LINE:'https://lin.ee/new'});
  assert.equal(merged.fields.姓名,'原姓名');assert.equal(merged.fields.手機號碼,'0912000000');
  assert.equal(merged.fields.電子郵件,'new@example.com');assert.equal(merged.fields.服務項目,'原服務\n背面服務');
  assert.deepEqual(merged.conflicts,['姓名','手機號碼','社群LINE']);
});
test('front-only save stays compatible, one record with private ownership',async()=>{
  const h=runtime();h.state({actorId:'ACTOR',newRowId:'ONE',savedFrontUrl:front});
  await h.ctx.saveReviewedCard(h.modal());
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'saveCard');
  assert.equal(h.calls[0].payload.rowId,'ONE');assert.equal(h.calls[0].payload.userId,'');assert.equal(h.calls[0].payload.creatorId,'ACTOR');
  const cfg=JSON.parse(h.calls[0].payload['自訂名片設定']);assert.equal(cfg.isPrivate,true);assert.deepEqual(cfg.collectionImages,{front,back:''});
});
test('new paired card saves both images on exactly one record',async()=>{
  const h=runtime();h.state({actorId:'ACTOR',newRowId:'PAIR',savedFrontUrl:front,savedBackUrl:back,backCrop:{}});
  await h.ctx.saveReviewedCard(h.modal());
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'saveCard');
  assert.deepEqual(JSON.parse(h.calls[0].payload['自訂名片設定']).collectionImages,{front,back});
});
test('add back uses updateCard original ID, retains buttons/layout/industry and server revision',async()=>{
  const h=runtime(),cfg={buttons:[],layoutStyle:'portrait',industryClassification:{primary:'科技資訊'},contactLinksV2:{buttons:[],title:'保留標題'},_cardLinksRevision:3};
  const existing={rowId:'OLD',姓名:'原姓名',sourceType:'private_import',creatorId:'ACTOR',customConfig:JSON.stringify(cfg)};
  h.ctx.window.allCards=[existing];let shown;h.ctx.window.openCardDetail=c=>shown=c;
  h.ctx.window.fetchAPI=async(action,payload)=>{
    h.calls.push({action,payload:plain(payload)});
    return {rowId:'OLD',customConfig:JSON.stringify(CardLinks.saveConfig(cfg,payload.data['自訂名片設定'],true))};
  };
  h.state({existing,actorId:'ACTOR',frontUrl:front,savedBackUrl:back,backCrop:{}});
  await h.ctx.saveReviewedCard(h.modal({姓名:'原姓名'}));
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'updateCard');assert.equal(h.calls[0].payload.rowId,'OLD');
  assert.equal(h.calls[0].payload.data.userId,undefined);
  const saved=sides.cardConfig(shown);assert.deepEqual(saved.buttons,[]);assert.equal(saved.layoutStyle,'portrait');assert.equal(saved._cardLinksRevision,4);
  assert.deepEqual(saved.contactLinksV2,cfg.contactLinksV2);assert.deepEqual(saved.collectionImages,{front,back});assert.equal(shown.creatorId,'ACTOR');
});
test('failed write can retry same ID; no duplicate image uploads or silent success',async()=>{
  const h=runtime();const state=h.state({actorId:'ACTOR',newRowId:'RETRY',savedFrontUrl:front,backCrop:{}}),modal=h.modal();
  let writes=0;const api=h.ctx.window.fetchAPI;
  h.ctx.window.fetchAPI=async(a,p)=>{if(a==='saveCard'&&++writes===1){h.calls.push({action:a,payload:plain(p)});throw Error('暫時失敗')}return api(a,p)};
  await h.ctx.saveReviewedCard(modal);assert.match(modal.error.textContent,/暫時失敗/);assert.equal(state.busy,false);assert.equal(h.notices.length,0);
  await h.ctx.saveReviewedCard(modal);
  assert.equal(h.calls.filter(x=>x.action==='uploadImageToR2').length,1);
  assert.deepEqual(h.calls.filter(x=>x.action==='saveCard').map(x=>x.payload.rowId),['RETRY','RETRY']);
});
test('changed login or claimed/read-only permission blocks all upload/write calls',async()=>{
  for(const reason of ['login','claimed']){
    const h=runtime();h.state({actorId:reason==='login'?'OTHER':'ACTOR',existing:{rowId:'OLD'},backCrop:{}});
    if(reason==='claimed')h.ctx.window.canEditCardRecord=()=>false;
    const m=h.modal();await h.ctx.saveReviewedCard(m);assert.equal(h.calls.length,0);assert.match(m.error.textContent,/權限/);
  }
});
test('double-click guard blocks concurrent write and readonly card has no back-edit button',async()=>{
  const h=runtime();h.state({busy:true});await h.ctx.saveReviewedCard(h.modal());assert.equal(h.calls.length,0);
  h.ctx.window.canEditCardRecord=()=>false;
  assert.doesNotMatch(h.ctx.window.renderCollectedCardSides({customConfig:JSON.stringify({collectionImages:{front,back}})}),/<button/);
});
test('front/back OCR is one call, returns review before any card write',async()=>{
  const h=runtime();const localization={incomplete:true};h.state({actorId:'ACTOR',processedFile:{},back:{processedFile:{}}});
  let reviewed=false;h.ctx.showReview=()=>{reviewed=true};h.ctx.window.fetchAPI=async(a,p)=>{h.calls.push({action:a,payload:p});return {displayName:'兩面測試',cardLocalization:localization,backCardLocalization:localization}};
  await h.ctx.runOcrAndReview();assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'recognizeCardWithGPT4o');
  assert.ok(h.calls[0].payload.base64Image);assert.ok(h.calls[0].payload.base64BackImage);assert.equal(reviewed,true);
});
test('every uploaded face requires confirmation and a missing back never silently saves',async()=>{
  for(const cropConfirmed of [{front:false,back:true},{front:true,back:false}]){
    const h=runtime();h.state({actorId:'ACTOR',savedFrontUrl:front,back:{},backCrop:{},cropConfirmed});
    const modal=h.modal();await h.ctx.saveReviewedCard(modal);assert.equal(h.calls.length,0);assert.match(modal.error.textContent,/確認圖片完整/);
  }
  const h=runtime();h.state({actorId:'ACTOR',savedFrontUrl:front,back:{},cropConfirmed:{front:true,back:true}});
  const modal=h.modal();await h.ctx.saveReviewedCard(modal);assert.equal(h.calls.length,0);assert.match(modal.error.textContent,/背面圖片/);
});
test('failed localization keeps each complete source for review, not a missing back',async()=>{
  const h=runtime(),frontFile={side:'front'},backFile={side:'back'};
  const state=h.state({actorId:'ACTOR',processedFile:frontFile,back:{processedFile:backFile}});
  h.ctx.cropByVisionLocalization=async()=>null;h.ctx.showReview=()=>{};
  h.ctx.window.fetchAPI=async()=>({displayName:'測試',cardLocalization:{},backCardLocalization:{}});
  await h.ctx.runOcrAndReview();
  assert.equal(state.cropFile,frontFile);assert.equal(state.backCrop,backFile);
  assert.deepEqual(plain(state.cropConfirmed),{front:false,back:false});
});
test('image-only repair updates same ID with no OCR/contact or identity edits; cancellation writes nothing',async()=>{
  for(const cancel of [false,true]){
    const h=runtime(),cfg={collectionImages:{front,back},imgUrl:front,buttons:[{l:'保留',u:'https://example.com'}],layoutStyle:'portrait'};
    h.ctx.window.currentCard={rowId:'ORIGINAL',姓名:'原姓名',手機號碼:'0912000000',customConfig:JSON.stringify(cfg)};
    h.ctx.fetch=async()=>({ok:true,blob:async()=>({type:'image/png'})});h.ctx.File=class{};
    h.ctx.editCardSideImage=async()=>cancel?null:{};
    await h.ctx.window.repairCollectedCardSide('front');
    if(cancel){assert.equal(h.calls.length,0);continue;}
    assert.deepEqual(h.calls.map(c=>c.action),['uploadImageToR2','updateCard']);
    const payload=h.calls[1].payload;assert.equal(payload.rowId,'ORIGINAL');
    assert.deepEqual(Object.keys(payload.data),['自訂名片設定']);
    const saved=JSON.parse(payload.data['自訂名片設定']);assert.deepEqual(saved.buttons,cfg.buttons);assert.equal(saved.layoutStyle,'portrait');assert.equal(saved.collectionImages.back,back);
  }
});
test('image repair rechecks actor after editor and after upload',async()=>{
  for(const stage of ['editor','upload']){
    const h=runtime();h.ctx.window.currentCard={rowId:'ORIGINAL',customConfig:JSON.stringify({collectionImages:{front,back}})};
    h.ctx.fetch=async()=>({ok:true,blob:async()=>({type:'image/png'})});h.ctx.File=class{};
    h.ctx.editCardSideImage=async()=>{if(stage==='editor')h.ctx.window.currentUserProfile.userId='OTHER';return {};};
    const api=h.ctx.window.fetchAPI;h.ctx.window.fetchAPI=async(a,p)=>{const r=await api(a,p);if(a==='uploadImageToR2')h.ctx.window.currentUserProfile.userId='OTHER';return r;};
    await h.ctx.window.repairCollectedCardSide('back');assert.equal(h.calls.filter(c=>c.action==='updateCard').length,0);
  }
});
test('card save waits for both archives and rechecks actor afterwards',async()=>{
  for(const changedLogin of [false,true]){
    const h=runtime();let release;const pending=new Promise(r=>release=r);
    const task={status:'uploading',cancel(){},ensure:()=>pending};
    h.state({actorId:'ACTOR',newRowId:'ARCHIVED',savedFrontUrl:front,savedBackUrl:back,backCrop:{},archive:task,back:{archive:task}});
    const modal=h.modal(),saving=h.ctx.saveReviewedCard(modal);
    await Promise.resolve();assert.equal(h.calls.length,0);assert.match(modal.querySelector('#ak-review-save').textContent,/照片上傳/);
    if(changedLogin)h.ctx.window.currentUserProfile.userId='OTHER';release();await saving;
    assert.equal(h.calls.filter(c=>c.action==='saveCard').length,changedLogin?0:1);
  }
});
test('failed archive blocks record write and preserves retry ID and review draft',async()=>{
  const h=runtime();let attempts=0;
  const task={status:'failed',cancel(){},async ensure(){if(++attempts===1)throw Error('網路離線');}};
  const state=h.state({actorId:'ACTOR',newRowId:'ARCHIVE_RETRY',savedFrontUrl:front,archive:task});
  const modal=h.modal({姓名:'人工核對'});await h.ctx.saveReviewedCard(modal);
  assert.equal(h.calls.length,0);assert.equal(state.busy,false);assert.match(modal.error.textContent,/原照上傳未完成/);
  await h.ctx.saveReviewedCard(modal);assert.equal(h.calls[0].payload.rowId,'ARCHIVE_RETRY');assert.equal(h.calls[0].payload.姓名,'人工核對');
});
