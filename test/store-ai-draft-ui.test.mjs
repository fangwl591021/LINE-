import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sampleFields,SOURCE} from './fixtures/store-ai-draft.mjs';
const source=readFileSync(new URL('../js/modules/store-ai-draft.js',import.meta.url),'utf8').replace('export function openStoreDraft','function openStoreDraft');
class Element{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.listeners={};this.attrs={};this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.isConnected=true;this._text='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
  set textContent(v){this.replaceChildren();this._text=String(v);}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  setAttribute(k,v){this.attrs[k]=String(v);}
  addEventListener(k,f){(this.listeners[k]??=[]).push(f);}removeEventListener(k,f){this.listeners[k]=(this.listeners[k]||[]).filter(x=>x!==f);}
  dispatchEvent(e){for(const f of this.listeners[e.type]||[])f(e);}
  find(fn){return this.children.flatMap(c=>[...(fn(c)?[c]:[]),...c.find(fn)]);}
  querySelector(selector){return this.find(c=>selector==='[data-store-ai-draft]'?c.attrs['data-store-ai-draft']!==undefined:c.name===selector.match(/name="(.*?)"/)?.[1])[0];}
  focus(){}scrollIntoView(){}
  fire(type){this.dispatchEvent({type,target:this});}
}
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const good=()=>({success:true,match:'matched',fields:{...sampleFields},warnings:['營業時間請核對'],sources:[{url:SOURCE,title:'官網'}]});
function fixture(t,handler=()=>good()){
  const doc={createElement:tag=>new Element(doc,tag)},form=doc.createElement('form'),panel=doc.createElement('div');panel.setAttribute('data-store-ai-draft','');form.append(panel);
  const fields={};for(const key of [...Object.keys(sampleFields),'status','image_url','version']){const input=doc.createElement('input');input.name=key;fields[key]=input;form.append(input);}fields.name.value='原店名';fields.status.value='draft';fields.version.value='3';fields.image_url.value='原圖';
  let token='original-token',current=true;const calls=[];
  const context=vm.createContext({window:{liff:{isLoggedIn:()=>true,getAccessToken:()=>token}},URL,Event,AbortController,setInterval,clearInterval,setTimeout,clearTimeout,fetch:async(url,opts)=>{calls.push({url,opts});return Response.json(await handler());}});vm.runInContext(source,context);
  let widget;const open=()=>widget=context.openStoreDraft({form,base:'https://worker.test',isCurrent:()=>current});t.after(()=>widget?.dispose());
  const button=text=>panel.find(c=>c.tagName==='button'&&c.textContent===text)[0];const check=key=>panel.find(c=>c.attrs['data-ai-field']===key)[0];
  const edit=(key,value)=>{fields[key].value=value;form.dispatchEvent({type:'input',target:fields[key]});};
  return {form,panel,fields,calls,open,button,check,edit,setCurrent:v=>current=v,setToken:v=>token=v,text:()=>panel.textContent};
}
test('preview only; empty fields selected, existing unchecked; explicit apply never saves',async t=>{
  const f=fixture(t);f.open();await flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].opts.headers.Authorization,'Bearer original-token');assert.equal(f.fields.address.value,'');assert.equal(f.check('name').checked,false);assert.equal(f.check('phone').checked,true);
  f.button('確認帶入勾選欄位').fire('click');assert.equal(f.fields.name.value,'原店名');assert.equal(f.fields.address.value,sampleFields.address);assert.equal(f.fields.status.value,'draft');assert.equal(f.fields.image_url.value,'原圖');assert.equal(f.fields.version.value,'3');assert.equal(f.calls.length,1);assert.match(f.text(),/尚未儲存/);
  assert.ok(f.panel.find(c=>c.tagName==='input').every(c=>!c.name));
});
test('existing contents replace only via explicit checkbox',async t=>{const f=fixture(t);f.fields.phone.value='原電話';f.open();await flush();assert.equal(f.check('phone').checked,false);f.check('name').checked=true;f.check('phone').checked=true;f.button('確認帶入勾選欄位').fire('click');assert.equal(f.fields.name.value,sampleFields.name);assert.equal(f.fields.phone.value,sampleFields.phone);});
test('manual edits during analysis and after preview always win even if reverted',async t=>{
  const wait=deferred(),f=fixture(t,()=>wait.promise);f.open();f.edit('phone','手動電話');f.edit('phone','');wait.resolve(good());await flush();assert.equal(f.check('phone').disabled,true);
  f.edit('address','手動地址');assert.equal(f.check('address').disabled,true);f.check('address').checked=true;f.button('確認帶入勾選欄位').fire('click');assert.equal(f.fields.address.value,'手動地址');assert.equal(f.fields.phone.value,'');
});
for(const reason of ['cancel','close','name','hint','token','navigate'])test('stale response after '+reason+' cannot modify form',async t=>{
  const wait=deferred(),f=fixture(t,()=>wait.promise);f.open();
  if(reason==='cancel')f.button('取消分析').fire('click');if(reason==='close')f.button('關閉草稿').fire('click');if(reason==='name')f.edit('name','別家店');
  if(reason==='hint')f.panel.find(c=>c.placeholder==='例如：新北板橋、分店名稱')[0].fire('input');if(reason==='token')f.setToken('different');if(reason==='navigate')f.setCurrent(false);
  wait.resolve(good());await flush();assert.equal(f.fields.address.value,'');assert.equal(f.button('確認帶入勾選欄位')?.hidden??true,true);
});
test('repeated open/click does not duplicate request; cancel aborts transport',async t=>{const wait=deferred(),f=fixture(t,()=>wait.promise);f.open();f.open();f.button('重新產生草稿').fire('click');assert.equal(f.calls.length,1);f.button('取消分析').fire('click');assert.equal(f.calls[0].opts.signal.aborted,true);wait.resolve(good());await flush();assert.match(f.text(),/取消/);});
test('changed auth after preview cannot apply old results',async t=>{const f=fixture(t);f.open();await flush();f.setCurrent(false);f.button('確認帶入勾選欄位').fire('click');assert.equal(f.fields.address.value,'');});
test('untrusted output is text, never HTML; source links are explicit and safe',async t=>{const value=good();value.fields.description='<img src=x onerror=alert(1)>';const f=fixture(t,()=>value);f.open();await flush();assert.match(f.text(),/<img/);assert.equal(f.panel.find(c=>c.tagName==='img').length,0);const a=f.panel.find(c=>c.tagName==='a')[0];assert.equal(a.rel,'noopener noreferrer');assert.equal(a.href,SOURCE);});
test('invalid result or unsafe URL returns visible failure without changing form',async t=>{const f=fixture(t,()=>({...good(),fields:{...sampleFields,status:'active'}}));f.open();await flush();assert.match(f.text(),/格式不完整/);assert.equal(f.fields.address.value,'');});
test('blank name does not call AI, panel retains close control',async t=>{const f=fixture(t);f.fields.name.value='';f.open();await flush();assert.equal(f.calls.length,0);assert.match(f.text(),/至少 2 字/);assert.ok(f.button('關閉草稿'));});
test('optional website cannot prevent the existing manual save validation',async t=>{const f=fixture(t);f.open();await flush();const url=f.panel.find(c=>c.placeholder==='https://公司官網')[0];assert.equal(url.type,'text');assert.equal(url.inputMode,'url');assert.equal(url.name,undefined);});
test('integration is lazy, narrow and cache versions updated together',()=>{
  const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');const shop=read('js/modules/store-shop.js');assert.match(shop,/import\('\.\/store-ai-draft.js\?v=1'\)/);assert.match(shop,/data-do="store-ai-draft"/);assert.match(shop,/owner===window.currentUserProfile\?\.userId/);
  for(const p of ['store-shop.html','js/modules/store-shop-entry.js']){assert.match(read(p),/store-shop.js\?v=48/);assert.match(read(p),/store-shop.css\?v=28/);}
});
