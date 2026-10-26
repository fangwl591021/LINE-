import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../js/modules/mycard.js',import.meta.url),'utf8');
const start=source.indexOf('  async function generateCardFromProfile('),helpers=source.indexOf('  var islandCardFlight',start),end=source.indexOf('  async function applyMyCardTemplate(',helpers);
assert.ok(start>0&&helpers>start&&end>helpers);
const actual=source.slice(start,end);
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32);
const own=extra=>({rowId:'CARD_STD_owned',lineId:A,sourceType:'self_profile',name:'原名片',version:'standard',...extra});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
function fixture({resolved={success:false,error:'Card not found'},resolveWait,saveWait}={}){
  const calls=[],opened=[],toasts=[],clicks=[],inputs={};
  for(const id of ['myGalleryInput','file-my-v1-img'])inputs[id]={id,isConnected:true,click(){clicks.push({id,reads:calls.length});}};
  const window={currentUserProfile:{userId:A,displayName:'LINE 姓名'},currentUser:{userId:A,name:'真實姓名',phone:'0912345678'},allCards:[],liff:{getAccessToken:()=>window.token},token:'old-token',showToast:message=>toasts.push(message),currentUserCard:null};
  window.fetchAPI=async(action,payload)=>{
    calls.push({action,payload});
    if(action==='resolveMyCardVersion')return resolveWait?await resolveWait.promise:resolved;
    if(action==='saveCard')return saveWait?await saveWait.promise:{success:true,rowId:'CARD_STD_created'};
    throw Error('Unexpected write/read: '+action);
  };
  const context={window,document:{getElementById:id=>inputs[id]||null},moduleAuth:{getUserId:()=>window.currentUserProfile.userId,getUserProfile:()=>window.currentUserProfile},templateCoverUrl:'https://example.test/cover.png',introTemplate:'私人名片草稿',getTemplateButtons:phone=>[{l:'行動電話',u:'tel:'+phone}],normalizeId:value=>String(value||'').trim(),getCurrentUserIdCandidates:()=>[window.currentUserProfile.userId,window.currentUser.lineId,window.currentUser.pointLineId].filter(Boolean),getCardRowId:card=>card?.rowId||card?.row_id||'',getCardSourceType:card=>card?.sourceType||card?.source_type||'',cardVersionFromCard:card=>card?.version||(card?.sourceType==='video_profile'?'video':'standard'),setActiveMyCard:card=>{window.currentUserCard=card;},hydrateMyECardStateFromCurrentCard:()=>{},show:()=>{},$:()=>null,openMyCardWysiwyg:async(event,card,options)=>{if(options.isCurrent())opened.push(card);},load:async()=>{},openMyCardDetail:async()=>{},currentCardData:null,myEcardStateLoaded:false};
  runInNewContext(actual+'\nwindow.islandTest={createIslandCardFromProfile,prepareIslandCardUpload,selectIslandCardUpload,generateCardFromProfile};',context);
  return{window,api:window.islandTest,calls,opened,toasts,clicks,inputs};
}

test('loading helpers never writes; explicit absent-card generation creates one private pending own draft',async()=>{
  const f=fixture();assert.equal(f.calls.length,0);
  assert.equal(await f.api.createIslandCardFromProfile(null,{isCurrent:()=>true}),true);
  assert.deepEqual(f.calls.map(call=>call.action),['resolveMyCardVersion','saveCard']);
  assert.equal(f.calls[0].payload.createIfMissing,false);
  const data=f.calls[1].payload;assert.equal(data.sourceType,'self_profile');assert.equal(data.visibility,'private');assert.equal(data.aiReviewStatus,'pending');assert.equal(data.userId,A);assert.equal(JSON.parse(data['自訂名片設定']).isPrivate,true);assert.equal(f.opened.length,1);
});

test('existing owned static card and canonical aliases reopen original without writes or replacement',async()=>{
  for(const card of [own(),own({lineId:B}),own({lineId:'',creatorId:A})]){
    const before=JSON.stringify(card),f=fixture({resolved:{card}});f.window.currentUser.pointLineId=B;
    assert.equal(await f.api.createIslandCardFromProfile(null,{isCurrent:()=>true}),true);assert.deepEqual(f.calls.map(call=>call.action),['resolveMyCardVersion']);assert.equal(f.opened[0],card);assert.equal(JSON.stringify(card),before);
  }
});

test('API errors or ambiguous missing results never become permission to create a duplicate',async()=>{
  for(const resolved of [null,{}, {success:false,error:'D1 unavailable'}, {success:false,error:'Access Denied'}, {success:true,card:null}, {success:false,error:'Card not found '}]){
    const f=fixture({resolved});await assert.rejects(f.api.createIslandCardFromProfile(null,{isCurrent:()=>true}));assert.equal(f.calls.filter(c=>c.action==='saveCard').length,0);assert.equal(f.opened.length,0);
  }
});

test('wrong-owner, scanned, video, archived and merged cards cannot be reused or overwritten',async()=>{
  for(const card of [own({lineId:B}),own({sourceType:'private_import'}),own({sourceType:'video_profile',version:'video'}),own({archived_at:'2026-10-01'}),own({merged_into_row_id:'other'})]){
    const f=fixture({resolved:{card}});await assert.rejects(f.api.createIslandCardFromProfile(null,{isCurrent:()=>true}));assert.equal(f.calls.length,1);assert.equal(f.opened.length,0);
  }
});

test('missing saved personal fields cannot generate a card',async()=>{
  const f=fixture();f.window.currentUser.phone='';await assert.rejects(f.api.createIslandCardFromProfile(null,{isCurrent:()=>true}),/手機/);assert.equal(f.calls.filter(c=>c.action==='saveCard').length,0);
});

test('double taps share a single resolver and generation flight',async()=>{
  const wait=deferred(),f=fixture({resolveWait:wait});const a=f.api.createIslandCardFromProfile(null,{isCurrent:()=>true}),b=f.api.createIslandCardFromProfile(null,{isCurrent:()=>true});assert.equal(a,b);
  wait.resolve({success:false,error:'Card not found'});await a;assert.equal(f.calls.filter(c=>c.action==='resolveMyCardVersion').length,1);assert.equal(f.calls.filter(c=>c.action==='saveCard').length,1);
});

test('an identity change during the own-card lookup prevents generation and opening old data',async()=>{
  const wait=deferred(),f=fixture({resolveWait:wait}),job=f.api.createIslandCardFromProfile(null,{isCurrent:()=>true});f.window.currentUserProfile.userId=B;f.window.token='new-token';wait.resolve({success:false,error:'Card not found'});
  assert.equal(await job,false);assert.equal(f.calls.length,1);assert.equal(f.window.currentUserCard,null);assert.equal(f.opened.length,0);
});

test('an identity change while an explicit save is pending never displays the old result in the new session',async()=>{
  const wait=deferred(),f=fixture({saveWait:wait}),job=f.api.createIslandCardFromProfile(null,{isCurrent:()=>true});
  while(!f.calls.some(c=>c.action==='saveCard'))await new Promise(resolve=>setTimeout(resolve,0));
  f.window.currentUserProfile.userId=B;f.window.token='new-token';wait.resolve({success:true,rowId:'CARD_STD_old_owner'});
  assert.equal(await job,false);assert.equal(f.window.currentUserCard,null);assert.equal(f.opened.length,0);assert.equal(f.calls.filter(c=>c.action==='saveCard').length,1);
});

test('upload preparation is read-only; its later direct click synchronously uses the correct prepared file input',async()=>{
  for(const [resolved,target] of [[{success:false,error:'Card not found'},'myGalleryInput'],[{card:own()},'file-my-v1-img']]){
    const f=fixture({resolved});assert.equal(await f.api.prepareIslandCardUpload({isCurrent:()=>true}),true);assert.equal(f.clicks.length,0);assert.equal(f.calls.length,1);
    assert.equal(f.api.selectIslandCardUpload(null,{isCurrent:()=>true}),true);assert.deepEqual(f.clicks,[{id:target,reads:1}]);assert.equal(f.calls.length,1,'no await/API occurs between the user click and native picker');
  }
});

test('stale upload preparation or editing an absent card cannot open a picker or create data',async()=>{
  const f=fixture();await f.api.prepareIslandCardUpload({isCurrent:()=>true});assert.throws(()=>f.api.selectIslandCardUpload(null,{isCurrent:()=>true,editOnly:true}),/先上傳/);f.window.token='new-token';assert.throws(()=>f.api.selectIslandCardUpload(null,{isCurrent:()=>true}),/目標已變更/);assert.equal(f.clicks.length,0);assert.equal(f.calls.length,1);
});

test('generation API failure never publishes a success or opens an editor',async()=>{
  const wait=deferred(),f=fixture({saveWait:wait}),job=f.api.createIslandCardFromProfile(null,{isCurrent:()=>true});wait.resolve({success:false,error:'save failed'});assert.equal(await job,false);assert.equal(f.window.currentUserCard,null);assert.equal(f.opened.length,0);
});
