import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/modules/store-buyer-profile.js',import.meta.url),'utf8');
const {requestBuyerProfile:request}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const owner='U'+'b'.repeat(32);
function setup(){globalThis.window={currentUserProfile:{userId:owner},liff:{isLoggedIn:()=>true,getAccessToken:()=> 'token-b'}};}
test('private profile request uses authenticated endpoint without client UID or browser storage',async()=>{
 setup();let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://example.test/v1/store-commerce/buyer-profile');assert.equal(options.headers.Authorization,'Bearer token-b');assert.equal(options.method,'GET');return Response.json({success:true,profile:{name:'本人',version:1}});};
 assert.deepEqual(await request({base:'https://example.test/'}),{name:'本人',version:1});assert.equal(calls,1);
 assert.doesNotMatch(source,/(?:localStorage|sessionStorage)\s*\.|saveCard\(|updateUserProfile\(|registerUser\(/);
});
test('late private response is rejected after account, token or page changes',async()=>{
 for(const kind of ['owner','token','page']){
  setup();let release,current=true;
  globalThis.fetch=()=>new Promise(r=>release=r);
  const pending=request({base:'https://example.test',isCurrent:()=>current});
  if(kind==='owner')window.currentUserProfile.userId='U'+'c'.repeat(32);
  if(kind==='token')window.liff.getAccessToken=()=> 'token-c';
  if(kind==='page')current=false;
  release(Response.json({success:true,profile:{name:'previous owner'}}));await assert.rejects(pending,/身分或頁面已變更/);
 }
});
test('anonymous and stale calls never fetch; private errors never become an empty success',async()=>{
 setup();globalThis.fetch=()=>{throw Error('unexpected');};
 window.liff.isLoggedIn=()=>false;await assert.rejects(request({base:'https://example.test'}),/請先登入/);
 setup();await assert.rejects(request({base:'https://example.test',isCurrent:()=>false}),/請先登入/);
 globalThis.fetch=async()=>Response.json({success:false,error:'請重新讀取'},{status:409});
 await assert.rejects(request({base:'https://example.test'}),/請重新讀取/);
});
test('private saves send only explicit payload and do not invoke order endpoints',async()=>{
 setup();const data={version:1,consent:true,name:'本人'};
 globalThis.fetch=async(url,options)=>{assert(url.endsWith('/buyer-profile'));assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),data);return Response.json({success:true,profile:{name:'本人',version:2}});};
 assert.equal((await request({base:'https://example.test'},data)).version,2);
});
