import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/modules/partner-onboarding.js',import.meta.url),'utf8');
class Element{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.attrs={};this.listeners={};this.value='';this.hidden=false;this.disabled=false;this._text='';}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
  insertBefore(node,before){node.parentElement=this;this.children.splice(this.children.indexOf(before),0,node);}
  after(node){const p=this.parentElement;node.parentElement=p;p.children.splice(p.children.indexOf(this)+1,0,node);}
  set textContent(value){this.replaceChildren();this._text=String(value);}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  setAttribute(key,value){this.attrs[key]=String(value);}removeAttribute(key){delete this.attrs[key];}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  dispatchEvent(event){for(const fn of this.listeners[event.type]||[])fn(event);}
  async fire(type,extra={}){await Promise.all((this.listeners[type]||[]).map(fn=>fn({type,preventDefault(){},...extra})));await flush();}
  find(fn){return this.children.flatMap(c=>[...(fn(c)?[c]:[]),...c.find(fn)]);}
}
const flush=async()=>{for(let n=0;n<6;n++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const result={success:true,fields:{name:'AI 店名',category:'食',summary:'<script>不執行</script>',phone:'02-12345678',address:'測試路 1 號'},warnings:['營業時間缺少'],sourceCardRowId:'owned'};
function fixture(handler){
  const doc={createElement:tag=>new Element(doc,tag),getElementById:id=>[doc.head,doc.root].flatMap(node=>node.find(c=>c.id===id))[0]};doc.head=doc.createElement('head');doc.root=doc.createElement('main');
  const panel=doc.createElement('div'),row=doc.createElement('div'),select=doc.createElement('select');row.append(select);panel.append(row);doc.root.append(panel);
  const fields={};for(const key of ['name','category','summary','phone','address']){const input=doc.createElement('input');input.id='field-'+key;fields[key]=input.id;doc.root.append(input);}
  const handleField=doc.createElement('input'),sourceField=doc.createElement('input');doc.root.append(handleField,sourceField);
  const calls=[];let token='mock-token',cards=[];
  const context=vm.createContext({window:{WORKER_URL:'https://api.test',liff:{getAccessToken:()=>token}},document:doc,URL,AbortController,setTimeout,clearTimeout,Event,
    fetch:async(url,opts)=>{calls.push({url,opts});const data=opts.body?JSON.parse(opts.body):null;const value=handler?await handler(url,data):data?result:{success:true,cards:[{rowId:'owned',name:'測試人',companyName:'測試店'}],next:''};return Response.json(value);}});
  vm.runInContext(source,context);
  const widget=context.window.PartnerOnboarding.mount({select,fields,handleField,sourceField,onCards:value=>cards=value});
  return {doc,widget,select,fields,handleField,sourceField,calls,getCards:()=>cards,setToken:value=>token=value,
    field:key=>doc.getElementById(fields[key]),button:text=>doc.root.find(n=>n.tagName==='button'&&n.textContent===text)[0],
    mode:()=>doc.root.find(n=>n.tagName==='select'&&n!==select)[0],query:()=>doc.root.find(n=>n.type==='search')[0],url:()=>doc.root.find(n=>n.type==='url')[0],text:()=>doc.root.textContent};
}
test('shared widget provides server search, explicit selection and safe preview without saving',async()=>{
  const f=fixture();await f.widget.load();assert.equal(f.getCards().length,1);assert.match(f.text(),/AI 開店/);
  await f.button('AI 分析開店資料').fire('click');assert.equal(f.calls.length,1);assert.match(f.text(),/請先搜尋並選擇/);
  f.select.value='owned';await f.button('AI 分析開店資料').fire('click');assert.equal(f.calls.length,2);assert.equal(f.field('name').value,'');assert.equal(f.button('確認帶入空白欄位').hidden,false);
  assert.match(f.text(),/需確認：營業時間缺少/);assert.match(f.text(),/<script>不執行<\/script>/);assert.equal(f.doc.root.find(n=>n.tagName==='script').length,0);
  await f.button('確認帶入空白欄位').fire('click');assert.equal(f.field('name').value,'AI 店名');assert.equal(f.sourceField.value,'owned');assert.equal(f.calls.length,2);assert.match(f.text(),/尚未建立或上架/);
  assert.ok(f.calls.every(c=>c.url.includes('/onboarding/')));assert.equal(f.calls[1].opts.headers.Authorization,'Bearer mock-token');
});
test('keeps manual values including edits made while AI runs',async()=>{
  const wait=deferred(),f=fixture((_url,data)=>data?wait.promise:{success:true,cards:[],next:''});
  f.select.value='owned';f.field('name').value='我的店名';await f.button('AI 分析開店資料').fire('click');
  f.field('phone').value='手動電話';wait.resolve(result);await flush();await f.button('確認帶入空白欄位').fire('click');
  assert.equal(f.field('name').value,'我的店名');assert.equal(f.field('phone').value,'手動電話');assert.equal(f.field('address').value,'測試路 1 號');
});
for(const change of ['reset','handle','source'])test('ignores old AI response after '+change,async()=>{
  const wait=deferred(),f=fixture(()=>wait.promise);f.select.value='owned';await f.button('AI 分析開店資料').fire('click');
  if(change==='reset')f.widget.reset();else if(change==='handle')f.handleField.value='other-partner';else{f.mode().value='website';await f.mode().fire('change');}
  wait.resolve(result);await flush();assert.equal(f.button('確認帶入空白欄位').hidden,true);assert.equal(f.field('name').value,'');
});
test('explicit paging preserves selection, query change clears it and stale search is ignored',async()=>{
  const old=deferred();let count=0;
  const f=fixture((url)=>{count++;if(url.includes('q=old'))return old.promise;return {success:true,cards:[{rowId:String(count),name:'name'+count}],next:count===1?'1':''};});
  await f.widget.load();f.select.value='1';await f.button('載入更多').fire('click');assert.equal(f.getCards().length,2);assert.equal(f.select.value,'1');
  f.query().value='old';await f.query().fire('input');await f.button('搜尋').fire('click');
  f.query().value='new';await f.query().fire('input');const newer=f.widget.load();await newer;old.resolve({success:true,cards:[{rowId:'stale',name:'stale'}],next:''});await flush();
  assert.equal(f.getCards().some(c=>c.rowId==='stale'),false);assert.equal(f.select.value,'');
});
test('analysis failure leaves manual fields intact, double click produces one request',async()=>{
  const wait=deferred(),f=fixture(()=>wait.promise);f.field('name').value='保留';f.select.value='owned';
  await f.button('AI 分析開店資料').fire('click');await f.button('AI 分析開店資料').fire('click');assert.equal(f.calls.length,1);
  wait.resolve({success:false,error:'AI 服務忙碌'});await flush();assert.match(f.text(),/AI 服務忙碌/);assert.equal(f.field('name').value,'保留');assert.equal(f.button('確認帶入空白欄位').hidden,true);
});
test('changed login prevents late private results from appearing',async()=>{
  const wait=deferred(),f=fixture(()=>wait.promise);f.select.value='owned';await f.button('AI 分析開店資料').fire('click');f.setToken('other');wait.resolve(result);await flush();assert.match(f.text(),/登入狀態已變更/);assert.equal(f.button('確認帶入空白欄位').hidden,true);
});
test('website and image empty input validations do not invoke AI',async()=>{
  const f=fixture();for(const mode of ['website','image']){f.mode().value=mode;await f.mode().fire('change');await f.button('AI 分析開店資料').fire('click');}assert.equal(f.calls.length,0);
});
test('both surfaces load shared UI before adapters and resets invalidate analysis',()=>{
  for(const [html,script]of [['admin.html','admin-partners-dashboard.js'],['index.html','admin-partners.js']]){
    const page=readFileSync(new URL('../'+html,import.meta.url),'utf8');assert.ok(page.indexOf('js/modules/partner-onboarding.js')<page.indexOf('js/modules/'+script));
    const adapter=readFileSync(new URL('../js/modules/'+script,import.meta.url),'utf8');assert.match(adapter,/PartnerOnboarding.mount/);assert.equal((adapter.match(/\.reset\(\)/g)||[]).length,2);
  }
  assert.doesNotMatch(source,/innerHTML|insertAdjacentHTML|savePointRedemptionPartner|uploadImageToR2/);
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const category=index.match(/<select id="admin-partner-category"[\s\S]*?<\/select>/)[0];
  for(const value of ['食','宿','遊','購','行','服務','製造'])assert.ok(category.includes('<option value="'+value+'">'));
});
