import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor(id = '') { this.id=id; this.children=[]; this.parentElement=null; this.previousElementSibling=null; this.textContent=''; this.hidden=false; this.handlers={}; this.classList={toggle(){}}; }
  setAttribute() {}
  append(...nodes) { for (const node of nodes) { node.parentElement=this; this.children.push(node); } }
  prepend(...nodes) { for (const node of nodes) node.parentElement=this; this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children=[]; this.append(...nodes); }
  addEventListener(name, handler) { this.handlers[name]=handler; }
  remove() { if (this.parentElement) this.parentElement.children=this.parentElement.children.filter(n => n!==this); }
}
const tab = new Element('tab-finance');
for (const id of ['stat-users','stat-cards','stat-acts','stat-regs']) {
  const card=new Element(), label=new Element(), counter=new Element(id);
  counter.previousElementSibling=label; card.append(label,counter); tab.append(card);
}
function find(root,id) { return root.id===id ? root : root.children.map(child => find(child,id)).find(Boolean); }
globalThis.document={getElementById:id=>find(tab,id),createElement:()=>new Element(),createTextNode:text=>{const node=new Element();node.textContent=text;return node;},addEventListener(){}};
globalThis.window={setInterval(){}};
const overview = await import('../js/modules/admin-finance-overview.mjs');
let current={role:'admin',uid:'test-admin',token:'test-token'};
const options={workerUrl:'https://example.test',session:()=>({...current})};
const payload={memberRecordCount:462,cardRecordCount:0,publishedActivityCount:12,activeRegistrationCount:33};
const visible=key=>document.getElementById(`finance-overview-${key}`).textContent;

test('shows full verified counts including zero and keeps legacy CRM updates off the report', async()=>{
  let called=0;
  globalThis.fetch=async (url,init)=>{called++;assert.equal(url.pathname,'/v1/admin/overview-stats');assert.equal(init.headers.Authorization,'Bearer test-token');return {ok:true,status:200,json:async()=>({success:true,data:payload})};};
  await overview.load(options);
  assert.equal(called,1); assert.equal(visible('memberRecordCount'),'462'); assert.equal(visible('cardRecordCount'),'0');
  assert.match(document.getElementById('finance-overview-memberRecordCount').previousElementSibling.textContent,/含自動建檔、未完成/);
  assert.match(document.getElementById('finance-overview-cardRecordCount').previousElementSibling.textContent,/含已合併/);
  document.getElementById('stat-users').textContent='10';
  document.getElementById('stat-cards').textContent='20';
  assert.equal(visible('memberRecordCount'),'462');assert.equal(visible('cardRecordCount'),'0');
});

test('never turns missing fields, denied roles or unavailable API into fabricated zero',async()=>{
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({success:true,data:{...payload,cardRecordCount:undefined}})});
  await overview.load(options);
  assert.equal(visible('memberRecordCount'),'—');
  assert.match(document.getElementById('finance-overview-feedback').children[0].textContent,/無法讀取/);
  let called=0;current={...current,role:'store'};globalThis.fetch=async()=>{called++;throw Error('must not call');};
  await overview.load(options);assert.equal(called,0);
  assert.match(document.getElementById('finance-overview-feedback').children[0].textContent,/僅總管/);
  current={...current,role:'admin'};globalThis.fetch=async()=>({ok:false,status:403,json:async()=>({success:false})});
  await overview.load(options);
  assert.equal(visible('memberRecordCount'),'—');assert.match(document.getElementById('finance-overview-feedback').children[0].textContent,/確認總管權限/);
});

test('account change during a response discards old results and retry can recover',async()=>{
  let finish;globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
  const waiting=overview.load(options);current={...current,uid:'other-admin',token:'other-token'};
  finish({ok:true,status:200,json:async()=>({success:true,data:payload})});await waiting;
  assert.equal(visible('memberRecordCount'),'—');assert.match(document.getElementById('finance-overview-feedback').children[0].textContent,/已變更/);
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({success:true,data:payload})});
  await overview.load(options);assert.equal(visible('memberRecordCount'),'462');
});
