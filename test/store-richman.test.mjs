import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const board=read('js/modules/business-richman.js'),provider=read('js/modules/store-richman.js'),entry=read('js/modules/store-shop-entry.js');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const shop=n=>({id:id(n),name:'商城 '+n,status:'active',category:'食',image_url:'https://images.example.test/shop.png'});
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};

// DOM boundary stub; browser preview separately verifies real layout and lazy storefront mounting.
function dom(){
 const ids=new Map();
 function node(){
  let html='',text='';const classes=new Set(),selectors=new Map();
  const e={dataset:{},style:{},children:[],listeners:{},hidden:false,disabled:false,
   classList:{add:(...x)=>x.forEach(v=>classes.add(v)),remove:(...x)=>x.forEach(v=>classes.delete(v)),toggle(v,on){if(on)classes.add(v);else classes.delete(v);},contains:v=>classes.has(v)},
   setAttribute(k,v){this[k]=v;},appendChild(c){this.children.push(c);if(c.id)ids.set(c.id,c);return c;},append(c){this.appendChild(c);},prepend(c){this.children.unshift(c);},after(){},focus(){},remove(){},
   addEventListener(k,fn){this.listeners[k]=fn;},showModal(){this.open=true;},close(){this.open=false;},
   querySelector(s){if(!selectors.has(s))selectors.set(s,node());return selectors.get(s);},querySelectorAll(){return [];}
  };
  Object.defineProperty(e,'innerHTML',{get:()=>html,set:value=>{html=value;e.children=[];for(const m of value.matchAll(/id="([^"]+)"/g))ids.set(m[1],node());}});
  Object.defineProperty(e,'textContent',{get:()=>text,set:value=>{text=value;e.children=[];}});
  return e;
 }
 for(const name of ['page-business-richman','page-store-shop'])ids.set(name,node());
 const document={head:node(),body:node(),documentElement:node(),getElementById:name=>ids.get(name)||null,createElement:node,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
 return {document,ids,node};
}
function setup({hold=false}={}){
 const d=dom(),storage=new Map(),calls=[],opened=[],queue=[];let shops=[shop(1),shop(2)],response,cardLoads=0,cardOpens=[];
 const window={currentPage:'home',currentUserProfile:{userId:'member-a'},Config:{WORKER_URL:'https://worker.example.test/'},crypto:{getRandomValues:b=>b.fill(0)},
  sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  goPage(page){window.currentPage=page;},setTimeout(fn){if(hold)queue.push(fn);else queueMicrotask(fn);},
  async openStoreShop(...args){opened.push(args);window.goPage('store-shop');},
  async loadCardData(){cardLoads++;window.harvestCards=[{rowId:'card-1',name:'原收藏名片'}];},
  async fetchAPI(action){calls.push(action);assert.equal(action,'listPublicBusinessCards');return [];},
  async openCardDetailById(key){cardOpens.push(key);}
 };
 const fetch=async(url,options)=>{calls.push({url,options});if(response)return response(url,options);const key=new URL(url).searchParams.get('shop');return {ok:true,json:async()=>key?{success:true,shop:shops.find(s=>s.id===key)}:{success:true,shops}};};
 const context={window,document:d.document,fetch,URL,Uint32Array,AbortController,setTimeout,clearTimeout,console:{error(){},warn(){}},Promise};
 vm.createContext(context);vm.runInContext(board,context);vm.runInContext(provider,context);
 const registered={};const register=window.registerBusinessRichmanProvider;
 window.registerBusinessRichmanProvider=(key,value)=>{registered[key]=value;register(key,value);};vm.runInContext(provider,context);
 return {window,context,...d,storage,calls,opened,queue,provider:registered.store,cardOpens,cardLoads:()=>cardLoads,setShops:v=>shops=v,setResponse:v=>response=v,
  saved:mode=>JSON.parse([...storage].find(([key])=>key.endsWith(':'+mode))?.[1]||'null')};
}

test('public random sample filters drafts, bad IDs, duplicates and unsafe images without auth',async()=>{
 const f=setup();f.setShops([shop(1),shop(1),{...shop(2),status:'draft'},{...shop(3),id:'bad'}, {...shop(4),name:' '},{...shop(5),image_url:'javascript:alert(1)'},...Array.from({length:50},(_,n)=>shop(n+10))]);
 const tiles=await f.provider.load();assert.equal(tiles.length,40);assert.equal(tiles[0].id,id(1));assert.equal(tiles[1].image,'');assert(tiles.every(t=>t.type==='store'));assert.equal(new Set(tiles.map(t=>t.id)).size,40);
 const call=f.calls[0];assert.match(call.url,/\/v1\/store-shop\?seed=[a-f0-9]{16}$/);assert.equal(call.options.method,'GET');assert.equal(call.options.credentials,'omit');assert.equal(call.options.body,undefined);assert.equal(call.options.headers,undefined);assert.equal(f.cardLoads(),0);
});
test('random choice avoids consecutive same shop, permits one shop, handles zero',()=>{
 const f=setup(),tiles=[{id:id(1)},{id:id(2)},{id:id(3)}];
 for(let i=0;i<30;i++)assert.notEqual(f.provider.choose(tiles,id(1)).id,id(1));
 assert.equal(f.provider.choose([tiles[0]],id(1)),tiles[0]);assert.equal(f.provider.choose([]),undefined);
});
test('store roll opens a live store in-page, resumes round/position, and uses no card or reward APIs',async()=>{
 const f=setup();let exited=0;await f.window.openStoreRichman({onExit:()=>exited++});assert.equal(f.window.currentPage,'business-richman');
 const firstRoll=f.window.rollBusinessRichman();await f.window.rollBusinessRichman();await firstRoll;
 assert.equal(f.opened.length,1);assert.equal(f.cardLoads(),0);assert.equal(f.window.currentPage,'store-shop');
 assert.deepEqual(f.opened[0].slice(0,5),['','','','store',id(2)]);
 const saved=f.saved('store');assert.equal(saved.position,2);assert.equal(saved.round,2);
 await f.opened[0][5].onBack();assert.equal(f.window.currentPage,'business-richman');assert.deepEqual(f.saved('store'),saved);
 await f.window.rollBusinessRichman();assert.equal(f.opened.length,2);assert.notEqual(f.opened[1][4],f.opened[0][4]);
 await f.opened[1][5].onBack();f.window.exitBusinessRichman();assert.equal(exited,1);
 assert(f.calls.every(c=>typeof c==='object'&&c.options.method==='GET'));assert.equal(f.storage.size,1);
});
test('card mode keeps original loader, card popup/open action and isolated progress',async()=>{
 const f=setup();await f.window.openStoreRichman();await f.window.rollBusinessRichman();const storeSaved=f.saved('store');
 await f.window.openBusinessRichman();assert.equal(f.cardLoads(),1);assert.equal(f.saved('card').round,1);
 await f.window.rollBusinessRichman();assert.equal(f.opened.length,1);await f.window.openBusinessRichmanCard();assert.deepEqual(f.cardOpens,['card-1']);
 assert.deepEqual(f.saved('store'),storeSaved);assert.equal(f.saved('card').round,2);
 await f.window.openStoreRichman();assert.equal(f.cardLoads(),1);assert.equal(f.saved('store').position,storeSaved.position);
 f.window.currentUserProfile.userId='member-b';await f.window.openStoreRichman();
 assert.equal(JSON.parse([...f.storage].find(([k])=>k.includes(':member-b:')&&k.endsWith(':store'))[1]).round,1);
});
test('empty catalog displays an empty state; network, schema and server failures remain retryable errors',async()=>{
 const f=setup();f.setShops([]);await f.window.openStoreRichman();assert.match(f.ids.get('business-richman-content').innerHTML,/目前沒有可探索/);await f.window.rollBusinessRichman();assert.equal(f.opened.length,0);
 for(const response of [async()=>{throw Error('offline');},async()=>({ok:false,status:500}),async()=>({ok:true,json:async()=>({success:true})})]){
  f.setResponse(response);await f.window.retryBusinessRichman();assert.match(f.ids.get('business-richman-content').innerHTML,/商城載入失敗/);
 }
 f.setResponse(undefined);f.setShops([shop(1)]);await f.window.retryBusinessRichman();await f.window.rollBusinessRichman();assert.equal(f.opened.length,1);
});
test('landing revalidates active status and identity; failures do not open a store or consume points',async()=>{
 for(const result of [{ok:false,status:404},{ok:true,json:async()=>({success:true,shop:{...shop(1),status:'draft'}})},{ok:true,json:async()=>({success:true,shop:shop(2)})}]){
  const f=setup();f.setResponse(async()=>result);await assert.rejects(()=>f.provider.open({id:id(1)},{isCurrent:()=>true,onBack(){}}));assert.equal(f.opened.length,0);
 }
 const f=setup();f.setShops([shop(1)]);await f.window.openStoreRichman();f.setResponse(async()=>({ok:false,status:404}));await f.window.rollBusinessRichman();
 const feedback=f.ids.get('business-richman-feedback');assert.equal(feedback.hidden,false);assert.match(feedback.textContent,/下架/);assert.equal(f.opened.length,0);
 f.setResponse(undefined);await feedback.children[0].onclick();assert.equal(f.opened.length,1);
});
test('leaving, changing mode or account during animation cancels arrival; reset is ignored while rolling',async()=>{
 for(const action of ['leave','mode','account']){
  const f=setup({hold:true});await f.window.openStoreRichman();const p=f.window.rollBusinessRichman();
  f.window.resetBusinessRichman();assert.equal(f.calls.length,1);
  if(action==='leave')f.window.exitBusinessRichman();
  if(action==='mode')await f.window.openBusinessRichman();
  if(action==='account')f.window.currentUserProfile.userId='member-b';
  for(let i=0;i<20;i++){while(f.queue.length)f.queue.shift()();await flush();}await p;assert.equal(f.opened.length,0);
 }
});
test('late shop validation after navigation/account switch cannot reopen storefront',async()=>{
 const f=setup();let release;f.setResponse(()=>new Promise(resolve=>release=resolve));
 let active=true;const p=f.provider.open({id:id(1)},{isCurrent:()=>active,onBack(){}});active=false;
 release({ok:true,json:async()=>({success:true,shop:shop(1)})});await p;assert.equal(f.opened.length,0);
});
test('optional board return survives lazy storefront load and is absent from ordinary callers',async()=>{
 const f=setup();let mounts=0,backs=0;
 f.window.StoreShop={mount(root){mounts++;root.innerHTML='<p>Storefront</p>';}};vm.runInContext(entry,f.context);
 await f.window.openStoreShop('','','','store',id(1));assert.equal(mounts,1);assert.equal(f.ids.get('page-store-shop').children.length,0);
 await f.window.openStoreShop('','','','store',id(1),{onBack(){backs++;f.window.goPage('business-richman');}});
 const back=f.ids.get('page-store-shop').children[0];assert.equal(back.textContent,'← 返回棋盤');back.onclick();assert.equal(backs,1);
 delete f.window.StoreShop;const p=f.window.openStoreShop('','','','store',id(1),{onBack(){f.window.goPage('business-richman');}});
 f.ids.get('page-store-shop').children[0].onclick();f.window.StoreShop={mount(){mounts++;}};
 f.document.head.children.find(c=>c.src?.includes('store-shop.js')).onload();await p;assert.equal(mounts,2,'Returning during load cannot mount a late storefront');
});
test('game-center independent exploration card bypasses reward/play path and returns to original page',async()=>{
 const f=setup(),events=[];let options;
 f.window.openStoreRichman=o=>{options=o;};f.window.currentPage='daily-checkin';
 Object.assign(f.context,{gameUser:()=>f.window.currentUserProfile.userId,gameAPI:async action=>{events.push(action);return {games:[],message:'available'};},gameEvent:type=>events.push(type),pendingGame:()=>null,setTimeout:()=>0});
 const code=read('js/modules/game-center.mjs').replace(/^import .*\r?\n/,'').replaceAll('import.meta.url',"'https://fixture.test/js/modules/game-center.mjs'").replace('export function openGameCenter','function openGameCenter');
 vm.runInContext(code,f.context);f.window.openGameCenter();await flush();const dialog=f.document.body.children[0];
 const card=dialog.querySelector('.gc-cards').children[0];assert.match(card.innerHTML,/商城大富翁/);assert.match(card.innerHTML,/不贈點/);assert.doesNotMatch(card.innerHTML,/data-game=/);
 events.length=0;dialog.listeners.click({target:{closest:()=>({dataset:{gc:'explore-store'}})}});await flush();assert.deepEqual(events,[]);assert.equal(dialog.open,false);assert(options);
 options.onExit();assert.equal(f.window.currentPage,'daily-checkin');assert.equal(dialog.open,true);
 assert.doesNotMatch(provider,/startGame|completeGame|fetchAPI|gameEvent|localStorage/);
});
