import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const report=readFileSync(new URL('../js/modules/checkin-mall-report.js',import.meta.url),'utf8');
const entry=readFileSync(new URL('../js/modules/store-shop-entry.js',import.meta.url),'utf8');
const card='11111111-1111-4111-8111-111111111111';
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attrs={};this.isConnected=true;this.value='';this.hidden=false;this.disabled=false;this._text='';}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
  set textContent(value){this.replaceChildren();this._text=String(value);}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  setAttribute(k,v){this.attrs[k]=String(v);}find(tag){return this.children.flatMap(c=>[...(c.tagName===tag?[c]:[]),...c.find(tag)]);}
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const response=(next='')=>({success:true,summary:{entries:2,people:1,mall:1,details:1},cards:{total:1,accepted:1,unknown:0,failed:0},rows:[{actor_name:'<img onerror=alert(1)>',action:'mall',clicked_at:1792382400000,card_id:card}],next});
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
test('report renders names as literal text, labels verified entries honestly, exposes filters and keyset more',async()=>{
  const root=new Element('div'),calls=[],context={window:{},document:{createElement:tag=>new Element(tag)},URLSearchParams,Date,Number,String};
  vm.runInNewContext(report,context);
  await context.window.mountCheckinMallReport(root,{api:async path=>{calls.push(path);return response(calls.length===1?'50':'');}});
  assert.match(root.textContent,/不是已讀/);assert.match(root.textContent,/<img onerror=alert\(1\)>/);assert.equal(root.find('img').length,0);assert.match(root.textContent,/不重複進入者 1 人/);
  const more=root.find('button').find(x=>x.textContent==='載入更多');assert.equal(more.hidden,false);more.onclick();await flush();assert.match(calls[1],/after=50/);assert.equal(more.hidden,true);
  const form=root.find('form')[0];form.onsubmit({preventDefault(){}});await flush();assert(!calls[2].includes('after='));
});
test('report distinguishes failure/empty results and discards data when leaving or changing identity',async()=>{
  for(const kind of ['fail','stale','empty']){
    const root=new Element('div'),pending=deferred(),context={window:{},document:{createElement:tag=>new Element(tag)},URLSearchParams,Date,Number,String};let current=true;
    vm.runInNewContext(report,context);const run=context.window.mountCheckinMallReport(root,{api:()=>pending.promise,isCurrent:()=>current});
    if(kind==='stale')current=false;
    if(kind==='fail')pending.resolve({success:false});else pending.resolve({...response(),rows:kind==='empty'?[]:response().rows});
    await run;if(kind==='stale')assert(!root.textContent.includes('<img'));else assert.match(root.textContent,kind==='fail'?/不完整/:/尚無/);
  }
});
function entryFixture(params={},fetchImpl=async()=>Response.json({success:true})){
  const root=new Element('div'),p=new Element('p');root.querySelector=()=>p;root.prepend=()=>{};
  const calls=[],mounts=[];const window={currentUserProfile:{userId:'user-a'},liff:{isLoggedIn:()=>true,getAccessToken:()=>'token-a'},WORKER_URL:'https://worker.test/',readActmasterInitialParams:()=>new URLSearchParams(params),StoreShop:{mount:(...args)=>mounts.push(args)},goPage:name=>window.currentPage=name};
  const context={window,document:{getElementById:()=>root,createElement:tag=>new Element(tag)},location:{search:''},URL,URLSearchParams,AbortSignal,setTimeout,clearTimeout,fetch:async(url,options)=>{calls.push({url,options});return fetchImpl(url,options);}};
  vm.runInNewContext(entry,context);return {window,calls,mounts,root};
}
for(const action of ['mall','details'])test('verified '+action+' entry preserves destination on analytics failure and sends no client UID/name',async()=>{
  const f=entryFixture({shopSection:'list',checkinCard:card,checkinAction:action},async()=>{throw Error('offline');});
  await f.window.openStoreShop('','','','list');assert.equal(f.calls.length,1);assert.equal(f.mounts[0][5],action==='mall'?'discovery':'point-history');
  assert.equal(f.calls[0].options.headers.Authorization,'Bearer token-a');assert.deepEqual(JSON.parse(f.calls[0].options.body),{cardId:card,action});
});
test('ordinary, mixed, malformed, logged-out and non-entry navigation never write tracking',async()=>{
  for(const params of [{},{shopSection:'list',checkinCard:'bad',checkinAction:'mall'},{shopSection:'list',checkinCard:card,checkinAction:'mall',shareCardId:'other'}]){
    const f=entryFixture(params);await f.window.openStoreShop('','','','list');assert.equal(f.calls.length,0);assert.equal(f.mounts[0][5],'list');
  }
  const f=entryFixture({shopSection:'list',checkinCard:card,checkinAction:'mall'});f.window.liff.isLoggedIn=()=>false;await f.window.openStoreShop('','','','list');assert.equal(f.calls.length,0);
});
test('identity/page changes while entry request is pending cannot mount a stale private view',async()=>{
  const pending=deferred(),f=entryFixture({shopSection:'list',checkinCard:card,checkinAction:'mall'},()=>pending.promise);
  const run=f.window.openStoreShop('','','','list');f.window.currentUserProfile={userId:'user-b'};pending.resolve(Response.json({success:true}));await run;assert.equal(f.mounts.length,0);
});
test('served index/admin surfaces wire only the dedicated entry/report, both destinations retain return controls',()=>{
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8'),admin=readFileSync(new URL('../admin.html',import.meta.url),'utf8'),shop=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');
  assert.match(index,/store-shop-entry\.js\?v=59/);assert.match(admin,/nav-checkin-mall-report/);assert.match(admin,/checkin-mall-report\.js\?v=1/);assert.match(admin,/loadAdminCheckinMallReport/);
  assert.match(admin,/switchTab\('users'\).*返回會員管理/);assert.match(shop,/section==='discovery'\)await discover/);assert.match(shop,/section==='point-history'/);assert.match(shop,/spending-history/);
  assert.doesNotMatch(report,/\.innerHTML|point_line_id|gift_money|\/message\/push/);
});
