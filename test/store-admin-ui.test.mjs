import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/modules/store-admin.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/store-admin.css',import.meta.url),'utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
class Element{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.attrs={};this.listeners={};this.value='';this.hidden=false;this.disabled=false;this._text='';}
  append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this._text='';this.append(...nodes);}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  set textContent(value){this.replaceChildren();this._text=String(value);}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  setAttribute(name,value){this.attrs[name]=String(value);}
  getAttribute(name){return this.attrs[name]??null;}
  addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);}
  dispatch(type){const event={target:this,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};for(const callback of this.listeners[type]||[])callback(event);return event;}
  matches(selector){if(selector.startsWith('.'))return String(this.className||'').split(' ').includes(selector.slice(1));const match=selector.match(/^\[([^=\]]+)(?:="?([^"\]]+)"?)?\]$/);if(match)return match[2]===undefined?match[1]in this.attrs:this.attrs[match[1]]===match[2];return this.tagName===selector;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function fixture(){
  const doc={createElement:tag=>new Element(doc,tag),getElementById:id=>doc.head.children.find(node=>node.id===id)||null};doc.head=doc.createElement('head');
  const root=doc.createElement('main'),requests=[],viewed=[],backs=[];let valid=true;
  const context=vm.createContext({URL,URLSearchParams});
  vm.runInContext(source.replace('export async function','async function').replaceAll('import.meta.url',JSON.stringify('https://example.test/LINE-/js/modules/store-admin.js'))+'\nthis.mount=mountStoreAdmin;',context);
  const options={api:(...args)=>new Promise((resolve,reject)=>requests.push({args,resolve,reject})),isCurrent:()=>valid,onView:id=>viewed.push(id),onBack:()=>backs.push(true)};
  return {root,doc,requests,options,viewed,backs,mount:()=>context.mount(root,options),setValid:value=>{valid=value;},
    action:name=>root.querySelector('[data-admin-action='+name+']'),form:()=>root.querySelector('form'),status:()=>root.querySelector('.store-admin-status')};
}
const shop=(extra={})=>({id:A,name:'測試店家',status:'active',category:'食',address:'台北市',phone:'02-12345678',owner_uid:'U_PRIVATE',owner_name:'店主',owner_role:'store',product_count:3,active_product_count:2,online_product_count:1,public_visible:true,...extra});
const report=(extra={})=>({success:true,shops:[shop()],summary:{total:5,active:3,draft:2},filtered_total:5,next:'',...extra});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function loaded(data=report()){const s=fixture();const pending=s.mount();s.requests[0].resolve(data);await pending;return s;}

test('does not mount, load CSS, or request private data without the current admin scope',async()=>{
  const s=fixture();s.setValid(false);await s.mount();assert.equal(s.requests.length,0);assert.equal(s.root.children.length,0);assert.equal(s.doc.head.children.length,0);
});
test('awaits first authenticated read, renders compact totals and useful owner details, no UID exposure',async()=>{
  const s=fixture();let completed=false;const pending=s.mount().then(()=>{completed=true;});
  assert.deepEqual(s.requests[0].args,['/admin/stores',null,true]);assert.equal(completed,false);assert.match(s.status().textContent,/讀取/);
  s.requests[0].resolve(report());await pending;assert.equal(completed,true);
  assert.equal(s.root.querySelector('[data-admin-count=total]').textContent,'5');assert.match(s.root.textContent,/負責人：店主/);assert.match(s.root.textContent,/商品 2 \/ 3網購 1/);
  assert.doesNotMatch(s.root.textContent,/U_PRIVATE/);assert.equal(s.root.querySelector('.store-admin-list').getAttribute('aria-busy'),'false');
  assert.equal(s.action('previous').disabled,true);assert.equal(s.action('next').disabled,true);
  assert.equal(s.doc.head.children[0].href,'https://example.test/LINE-/css/store-admin.css?v=1');
});
test('all server text is textContent, only explicitly public valid shops get view actions',async()=>{
  const s=await loaded(report({shops:[shop({name:'<img src=x onerror=alert(1)>',owner_name:'<script>bad()</script>'}),shop({id:B,status:'draft',public_visible:false,owner_name:''}),shop({id:'javascript:alert(1)',public_visible:true}),shop({id:B,public_visible:false})]}));
  assert.equal(s.root.querySelectorAll('img').length,0);assert.equal(s.root.querySelectorAll('script').length,0);assert.match(s.root.textContent,/<img src=x/);assert.match(s.root.textContent,/未填姓名/);
  assert.equal(s.root.querySelectorAll('[data-admin-action=view]').length,1);s.action('view').dispatch('click');await flush();assert.deepEqual(s.viewed,[A]);assert.equal(s.requests.length,1);
});
test('search stops bubbling, encodes literal input and status, and clears cursor',async()=>{
  const s=await loaded();const inputs=s.form().querySelectorAll('input');inputs[0].value=' 店家 & 100% ';s.form().querySelector('select').value='draft';
  const event=s.form().dispatch('submit');assert.equal(event.prevented,true);assert.equal(event.stopped,true);
  const parsed=new URL('https://test.invalid'+s.requests[1].args[0]);assert.equal(parsed.searchParams.get('q'),'店家 & 100%');assert.equal(parsed.searchParams.get('status'),'draft');assert.equal(parsed.searchParams.has('after'),false);
  s.requests[1].resolve(report({shops:[],filtered_total:0}));await flush();assert.match(s.root.textContent,/沒有符合條件/);assert.match(s.status().textContent,/0 家/);
});
test('next and previous page use server cursor and retain search, refresh returns first page',async()=>{
  const s=await loaded(report({next:A}));s.action('next').dispatch('click');assert.match(s.requests[1].args[0],new RegExp('after='+A));
  s.requests[1].resolve(report({shops:[shop({id:B})],next:B}));await flush();assert.match(s.root.querySelector('.store-admin-pager').textContent,/第 2 頁/);assert.equal(s.action('previous').disabled,false);
  s.action('previous').dispatch('click');assert.equal(s.requests[2].args[0],'/admin/stores');s.requests[2].resolve(report({next:A}));await flush();
  s.action('next').dispatch('click');s.requests[3].resolve(report({next:B}));await flush();s.action('refresh').dispatch('click');assert.equal(s.requests[4].args[0],'/admin/stores');s.requests[4].resolve(report());await flush();assert.match(s.root.querySelector('.store-admin-pager').textContent,/第 1 頁/);
});
test('search limit matches the 80 character server contract even for programmatic input',async()=>{
  const s=await loaded(),input=s.form().querySelector('input');assert.equal(input.maxLength,80);input.value='店'.repeat(90);s.form().dispatch('submit');
  const q=new URL('https://test.invalid'+s.requests[1].args[0]).searchParams.get('q');assert.equal(q.length,80);s.requests[1].resolve(report());await flush();
});
test('read failure clears private rows and offers retry of the same failed page',async()=>{
  const s=await loaded(report({next:A}));s.action('next').dispatch('click');s.requests[1].reject(new Error('private SQL or token details'));await flush();
  assert.equal(s.action('retry').hidden,false);assert.match(s.status().textContent,/無法讀取/);assert.doesNotMatch(s.root.textContent,/private SQL|測試店家/);
  s.action('retry').dispatch('click');assert.equal(s.requests[2].args[0],s.requests[1].args[0]);s.requests[2].resolve(report());await flush();assert.match(s.root.querySelector('.store-admin-pager').textContent,/第 2 頁/);
});
test('malformed unsuccessful response cannot be shown as a successful directory',async()=>{
  const s=await loaded({success:false,shops:[shop()],summary:{total:500}});assert.match(s.status().textContent,/無法讀取/);assert.equal(s.action('retry').hidden,false);assert.equal(s.root.querySelector('[data-admin-count=total]').textContent,'—');
});
test('newer search wins when prior request finishes late',async()=>{
  const s=fixture();const first=s.mount();s.form().querySelector('input').value='第二家';s.form().dispatch('submit');
  s.requests[1].resolve(report({shops:[shop({name:'第二家'})]}));await flush();s.requests[0].resolve(report({shops:[shop({name:'過期第一家'})]}));await first;
  assert.match(s.root.textContent,/第二家/);assert.doesNotMatch(s.root.textContent,/過期第一家/);
});
test('privilege loss in flight discards data and prevents every follow-up request',async()=>{
  const s=fixture();const pending=s.mount();s.setValid(false);s.requests[0].resolve(report());await pending;
  assert.doesNotMatch(s.root.textContent,/測試店家|店主/);s.form().dispatch('submit');s.action('refresh').dispatch('click');s.action('back').dispatch('click');assert.equal(s.requests.length,1);assert.equal(s.backs.length,0);
});
test('detached mount never writes late private results into a replacement page',async()=>{
  const s=fixture();const pending=s.mount();s.root.replaceChildren(s.doc.createElement('aside'));s.requests[0].resolve(report());await pending;assert.equal(s.root.textContent,'');
});
test('each remount reloads private data but stylesheet is shared safely',async()=>{
  const s=await loaded();const pending=s.mount();assert.equal(s.requests.length,2);assert.equal(s.doc.head.children.length,1);assert.doesNotMatch(s.root.textContent,/測試店家/);s.requests[1].resolve(report({shops:[],filtered_total:0}));await pending;assert.match(s.root.textContent,/目前沒有店家/);
});
test('back works without reads, navigation rejection is handled without unhandled promise',async()=>{
  const s=await loaded();s.action('back').dispatch('click');await flush();assert.equal(s.backs.length,1);assert.equal(s.requests.length,1);
  s.options.onBack=async()=>{throw new Error('do not leak');};const pending=s.mount();s.requests[1].resolve(report());await pending;s.action('back').dispatch('click');await flush();assert.match(s.status().textContent,/無法開啟頁面/);
});
test('styles are scoped, compact on mobile, and back toolbar remains sticky',()=>{
  assert.match(css,/\.store-admin \.store-admin-toolbar\{position:sticky;top:0/);assert.match(css,/@media\(max-width:520px\)/);assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(source,/innerHTML|localStorage|sessionStorage|fetch\(/);assert.doesNotMatch(source,/data-do/);
});
