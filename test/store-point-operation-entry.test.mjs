import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const config=readFileSync(new URL('../js/config.js',import.meta.url),'utf8');
const auth=readFileSync(new URL('../js/auth.js',import.meta.url),'utf8');
function between(source,start,end){
 const first=source.indexOf(start),last=source.indexOf(end,first);
 assert.ok(first>=0&&last>first,'Production entry definitions must remain discoverable');
 return source.slice(first,last);
}
const paramsSource=between(config,'function readActmasterInitialParams()','function hasNfcCheckinParams');
const cleanSource=between(config,'window.buildActmasterCleanLiffUrl = function()','window.recoverActmasterInvalidLiffAuthorization = function(error)');
const routeStart=auth.indexOf("    const shopSection = urlParams.get('shopSection');");
const identityStart=auth.lastIndexOf('window.applyRegisteredUserSession(checkRes.info, { skipHome: directStoreManage });',routeStart);
const routeEnd=auth.indexOf("    if (!shareCardId && !claimCardId && !likeCardId && (urlParams.get('shopQr')",routeStart);
assert.ok(identityStart>=0&&identityStart<routeStart&&routeEnd>routeStart,'Cashier route must follow confirmed registration');
const routeSource=auth.slice(identityStart,routeEnd);

function readParams(search){
 const window={location:{search,origin:'https://line.example.test',pathname:'/LINE-/'}};
 const context={window,URLSearchParams,decodeURIComponent,console};
 vm.runInNewContext(paramsSource+';window.readActmasterInitialParams=readActmasterInitialParams;',context);
 return {params:window.readActmasterInitialParams(),context};
}
async function route(search){
 const {params,context}=readParams(search),events=[];
 const info={userId:'U'+'a'.repeat(32),role:'store'};
 context.checkRes={isRegistered:true,info};
 context.directStoreManage=false;
 context.urlParams=params;
 context.shareCardId=params.get('shareCardId');
 context.claimCardId=params.get('claim');
 context.likeCardId=params.get('likeCardId');
 context.window.applyRegisteredUserSession=(value,options)=>{
  assert.equal(options.skipHome,false,'cashier retains the normal session path');
  assert.equal(value,info);
  context.window.currentUser=value;
  events.push({type:'identity',role:value.role});
 };
 context.window.openStoreShop=async(...args)=>{
  assert.equal(context.window.currentUser,info,'Confirmed identity must be applied before opening the shop');
  events.push({type:'shop',args});
 };
 await vm.runInNewContext('(async()=>{'+routeSource+'})()',context);
 return events;
}

test('actual LIFF parameter parser preserves direct and nested cashier intent',()=>{
 for(const search of [
  '?shopSection=cashier',
  '?liff.state='+encodeURIComponent('/?shopSection=cashier'),
  '?state='+encodeURIComponent('/?shopSection=cashier'),
  '?liff.state='+encodeURIComponent(encodeURIComponent('/?shopSection=cashier'))
 ])assert.equal(readParams(search).params.get('shopSection'),'cashier',search);
});

test('outer navigation overrides nested LIFF state without replacing unrelated intent',()=>{
 const search='?shopSection=mine&liff.state='+encodeURIComponent('/?shopSection=cashier&ref=test-ref');
 const {params}=readParams(search);
 assert.equal(params.get('shopSection'),'mine');
 assert.equal(params.get('ref'),'test-ref');
});

test('clean OAuth redirect retains cashier intent and strips only authorization transport parameters',()=>{
 const search='?liff.state='+encodeURIComponent('/?shopSection=cashier&ref=test-ref')+'&code=test-code&state=unused&liffClientId=test&liffRedirectUri=test&error=test&error_description=test';
 const {context}=readParams(search);
 vm.runInNewContext(cleanSource,context);
 const clean=new URL(context.window.buildActmasterCleanLiffUrl());
 assert.equal(clean.origin,'https://line.example.test');
 assert.equal(clean.pathname,'/LINE-/');
 assert.deepEqual([...clean.searchParams],[['shopSection','cashier'],['ref','test-ref']]);
});

test('cashier route opens only after the confirmed member session is applied',async()=>{
 for(const search of ['?shopSection=cashier','?liff.state='+encodeURIComponent('/?shopSection=cashier')]){
  assert.deepEqual(await route(search),[
   {type:'identity',role:'store'},
   {type:'shop',args:['','','','cashier']}
  ]);
 }
});

test('cashier intent does not supersede NFC check-in or activity verification',async()=>{
 for(const key of ['checkin','nfcAct','nfcCheckin','verifyCheckin','checkinRowId','registrationId']){
  for(const nested of [false,true]){
   const query='shopSection=cashier&'+key+'=test-only';
   const search=nested?'?liff.state='+encodeURIComponent('/?'+query):'?'+query;
   assert.deepEqual(await route(search),[{type:'identity',role:'store'}],key+(nested?' nested':''));
  }
 }
});

test('claim, share, like and product routes retain priority over cashier entry',async()=>{
 for(const key of ['claim','c','shareCardId','s','likeCardId','shopQr','memberProduct','shopProduct']){
  const search='?shopSection=cashier&'+key+'=test-only';
  assert.deepEqual(await route(search),[{type:'identity',role:'store'}],key);
 }
});

test('the new conflict rule leaves existing non-cashier sections unchanged',async()=>{
 for(const section of ['list','mine','manage','sales','online-manage']){
  assert.deepEqual(await route('?shopSection='+section+'&checkin=test-only'),[
   {type:'identity',role:'store'},
   {type:'shop',args:['','','',section]}
  ],section);
 }
});

test('unknown navigation is ignored and explicit outer sections remain authoritative at routing',async()=>{
 assert.deepEqual(await route('?shopSection=unknown'),[{type:'identity',role:'store'}]);
 const search='?shopSection=mine&liff.state='+encodeURIComponent('/?shopSection=cashier');
 assert.deepEqual(await route(search),[
  {type:'identity',role:'store'},
  {type:'shop',args:['','','','mine']}
 ]);
});
