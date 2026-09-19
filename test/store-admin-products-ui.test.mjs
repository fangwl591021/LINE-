import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/modules/store-admin-products.js',import.meta.url),'utf8');
const ID='11111111-1111-4111-8111-111111111111';
class Element{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.attrs={};this.listeners={};this.value='';this.disabled=false;this._text='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  set textContent(value){this.replaceChildren();this._text=String(value);}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  setAttribute(name,value){this.attrs[name]=String(value);}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  async fire(type){const event={preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};await Promise.all((this.listeners[type]||[]).map(fn=>fn(event)));return event;}
  find(fn){return this.children.flatMap(child=>[...(fn(child)?[child]:[]),...child.find(fn)]);}
}
function fixture(extra={}){
  const doc={createElement:tag=>new Element(doc,tag),getElementById:id=>doc.head.children.find(node=>node.id===id)};doc.head=doc.createElement('head');
  const root=doc.createElement('main'),calls=[],uploads=[],preparations=[];let valid=true,uuidCount=0;
  const options={shopId:ID,isCurrent:()=>valid,onBack:async()=>{},prepareImage:async file=>{preparations.push(file);return 'data:image/jpeg;base64,eA==';},uploadImage:async data=>{uploads.push(data);return {success:true,url:'https://img.test/item.jpg'};},
    api:async(path,data,privateRead)=>{calls.push({path,data,privateRead});if(data)return {success:true,product_id:'created',shop_id:ID};return {success:true,shop:{id:ID,name:'選定店家',owner_name:'店主',version:3,product_count:0,product_limit:null,status:'active'},products:[]};},...extra};
  const context=vm.createContext({URL,crypto:{randomUUID:()=>{uuidCount++;return '99999999-1111-4111-8111-'+String(uuidCount).padStart(12,'0');}}});
  vm.runInContext(source.replace('export async function','async function').replaceAll('import.meta.url',JSON.stringify('https://test.invalid/js/modules/store-admin-products.js'))+'\nthis.mount=mountAdminProducts;',context);
  return {root,calls,options,uploads,preparations,mount:()=>context.mount(root,options),setValid:value=>{valid=value;},
    field:name=>root.find(node=>node.name===name)[0],form:()=>root.find(node=>node.tagName==='form')[0],save:()=>root.find(node=>'data-admin-save'in node.attrs)[0],text:()=>root.textContent,uuidCount:()=>uuidCount};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function loaded(extra={}){const f=fixture(extra);await f.mount();return f;}
function fill(f){f.field('title').value='測試商品';f.field('price').value='123.45';f.field('category').value='食';f.field('confirm').checked=true;}
test('explicit target, authenticated lazy read, draft default, no owner UID input',async()=>{
  const f=await loaded();assert.deepEqual(f.calls,[{path:'/admin/products?shop='+ID,data:null,privateRead:true}]);
  assert.match(f.text(),/代上傳商品｜選定店家/);assert.match(f.text(),/負責人：店主/);assert.equal(f.field('status').value,'draft');assert.equal(f.field('owner_uid'),undefined);
  assert.equal(f.field('redeem_value').disabled,true);assert.equal(f.field('confirm').required,true);
});
test('validates required fields and monetary precision before creating request key',async()=>{
  const f=await loaded();fill(f);
  for(const price of ['','-1','0.001','abc','1000000.01']){f.field('price').value=price;await f.form().fire('submit');}
  assert.equal(f.calls.length,1);assert.equal(f.uuidCount(),0);
  f.field('price').value='0';f.field('confirm').checked=false;await f.form().fire('submit');assert.equal(f.calls.length,1);
});
test('uploads then creates exactly once with selected shop and original image',async()=>{
  const f=await loaded();fill(f);f.field('image_file').files=[{name:'test.png'}];await f.field('image_file').fire('change');
  assert.equal(f.uploads.length,1);assert.match(f.text(),/圖片已上傳/);
  const event=await f.form().fire('submit');assert.equal(event.prevented,true);assert.equal(event.stopped,true);
  const sent=f.calls[1].data;assert.equal(sent.shop_id,ID);assert.equal(sent.shop_version,3);assert.equal(sent.image_url,'https://img.test/item.jpg');assert.equal(sent.price_cents,12345);assert.equal(sent.status,'draft');assert.equal('owner_uid'in sent,false);
  await f.form().fire('submit');assert.equal(f.calls.length,2);assert.equal(f.save().disabled,true);assert.match(f.text(),/已為「選定店家」新增商品（草稿）/);
});
test('double click is suppressed and uncertain retry keeps identical frozen request',async()=>{
  const wait=deferred();let writes=0;const sent=[];
  const g=await loaded({api:async(path,data)=>{
    if(!data)return {success:true,shop:{id:ID,name:'測試',version:1,product_count:0,product_limit:null,status:'active'},products:[]};
    writes++;sent.push(JSON.stringify(data));if(writes===1)return wait.promise;
    return {success:true,shop_id:ID,product_id:'same'};
  }});fill(g);
  const pending=g.form().fire('submit');await g.form().fire('submit');assert.equal(writes,1);assert.equal(g.field('title').disabled,true);
  wait.reject(new Error('網路中斷'));await pending;assert.equal(g.save().disabled,false);assert.equal(g.field('title').disabled,true);assert.match(g.text(),/重試會沿用同一筆資料/);
  g.field('title').value='不得換資料';await g.form().fire('submit');assert.equal(writes,2);assert.equal(sent[0],sent[1]);assert.equal(g.uuidCount(),1);
});
test('failed image upload preserves prior image and does not create any product',async()=>{
  let fail=false;const f=await loaded({uploadImage:async()=>fail?{success:false,error:'上傳失敗'}:{success:true,url:'https://img.test/old.jpg'}});fill(f);
  f.field('image_file').files=[{}];await f.field('image_file').fire('change');fail=true;await f.field('image_file').fire('change');
  assert.match(f.text(),/圖片未更新/);assert.equal(f.calls.length,1);
  await f.form().fire('submit');assert.equal(f.calls[1].data.image_url,'https://img.test/old.jpg');
});
test('stale account while preparing image prevents upload and stale response cannot update UI',async()=>{
  const wait=deferred();const f=await loaded({prepareImage:()=>wait.promise});f.field('image_file').files=[{}];
  const pending=f.field('image_file').fire('change');f.setValid(false);wait.resolve('image');await pending;
  assert.equal(f.uploads.length,0);await f.form().fire('submit');assert.equal(f.calls.length,1);
});
test('late private data is ignored after navigation',async()=>{
  const wait=deferred(),f=fixture({api:()=>wait.promise});const pending=f.mount();f.root.replaceChildren();wait.resolve({success:true,shop:{id:ID,name:'私人店名',version:1},products:[]});await pending;assert.equal(f.text(),'');
});
test('user limit and unpublished store are accurately explained',async()=>{
  const f=await loaded({api:async()=>({success:true,shop:{id:ID,name:'草稿店',version:1,product_limit:1,product_count:0,status:'draft'},products:[]})});
  assert.match(f.text(),/不會自動公開店面/);assert.equal(f.field('purchase_mode').disabled,true);assert.equal(f.field('redeem_type').disabled,true);
  const full=await loaded({api:async()=>({success:true,shop:{id:ID,name:'滿額店',version:1,product_limit:1,product_count:1,status:'active'},products:[]})});
  assert.equal(full.form(),undefined);assert.match(full.text(),/已達商品件數上限/);
});
test('untrusted names use textContent and image scheme is validated',async()=>{
  const f=await loaded({uploadImage:async()=>({success:true,url:'javascript:alert(1)'})});
  f.field('image_file').files=[{}];await f.field('image_file').fire('change');assert.match(f.text(),/圖片未更新/);
  assert.doesNotMatch(source,/innerHTML|insertAdjacentHTML/);
});
