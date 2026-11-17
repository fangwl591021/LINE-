import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/modules/admin-commission-ledger.js',import.meta.url),'utf8');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await pause(10)}throw Error('UI test timed out')}
function setup(fetcher){
 const names=['filters','search','month','message','summary','awards','payments','selection','head','body','prev','next','page','export','reset'];
 const elements=Object.fromEntries(names.map(name=>[name,{value:'',textContent:'',innerHTML:'',disabled:false,attrs:{},handlers:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,v){this.handlers[k]=v},fire(k,event={}){return this.handlers[k]?.({preventDefault(){},...event})}}]));
 elements.filters.elements=[elements.search,elements.month];elements.filters.reset=()=>elements.filters.elements.forEach(x=>x.value='');
 const calls=[],files=[];class TestURL extends URL{}TestURL.createObjectURL=blob=>{files.push(blob);return 'blob:test'};TestURL.revokeObjectURL=()=>{};
 const document={getElementById:key=>elements[key.replace('commission-ledger-','')],body:{append(){}},createElement(){return{click(){},remove(){}}}};
 const window={liff:{isLoggedIn:()=>true,getAccessToken:()=> 'test-token'}};
 const fetch=async(url,options)=>{calls.push({url:new URL(url),options});return{ok:true,json:async()=>fetcher(new URL(url))}};
 vm.runInNewContext(source,{document,window,fetch,WORKER_URL:'https://example.test/',URL:TestURL,Blob,AbortSignal,Intl,Date,Number,String,Set,Error,setTimeout,clearTimeout});
 return{elements,window,calls,files};
}
const member=(id,extra={})=>({memberId:id,memberName:'合成會員',memberNumber:'001234',bank:{name:'合成銀行',code:'001',branch:'合成分行',holder:'合成戶名',account:'0012345678'},bankStatus:'accepted',bankReview:'accepted',bankWarning:'',bankSignedAt:'2026-11-01T00:00:00Z',bankApplicationId:'app',awardCount:1,statusAmounts:{payable:10},paymentCount:1,paymentAmount:10,legacyPaymentCount:0,legacyPaymentAmount:0,...extra});
test('summary masks accounts and clearly flags unreviewed signed information',async()=>{
 const ui=setup(()=>({success:true,pageSize:30,total:1,rows:[member('m',{bankStatus:'pending',bankWarning:'合約尚未審核通過'})],legacySource:true,unresolved:{awards:1,payments:0}}));
 ui.window.loadAdminCommissionLedger();await until(()=>ui.elements.body.innerHTML.includes('傭金明細'));
 assert.match(ui.elements.body.innerHTML,/末 5678 碼/);assert.doesNotMatch(ui.elements.body.innerHTML,/0012345678/);assert.match(ui.elements.body.innerHTML,/text-red-700/);assert.match(ui.elements.message.textContent,/需核對/);
 ui.elements.export.fire('click');await until(()=>ui.files.length===1);assert.match(await ui.files[0].text(),/未能對應會員（請查看明細）/);
 ui.elements.search.value='范';ui.elements.search.fire('input',{isComposing:true});await until(()=>ui.calls.some(c=>c.url.searchParams.get('q')==='范'));
});
test('historical dealers are visible in overview even when bank information is missing',async()=>{
 const ui=setup(()=>({success:true,pageSize:30,total:1,rows:[member('m',{memberName:'合成經銷商',historicalRoster:1,bank:null,bankStatus:'missing',bankWarning:'尚無手簽合約',awardCount:0})],legacySource:true,unresolved:{awards:0,payments:0}}));
 ui.window.loadAdminCommissionLedger();await until(()=>ui.elements.body.innerHTML.includes('合成經銷商'));assert.match(ui.elements.body.innerHTML,/管理員確認的歷史經銷商/);assert.match(ui.elements.body.innerHTML,/尚無手簽合約/);
});
test('summary export includes all pages and preserves full bank strings while escaping formulas',async()=>{
 const ui=setup(url=>({success:true,pageSize:1,total:2,rows:[member('m'+url.searchParams.get('page'),{memberName:url.searchParams.get('page')==='1'?'=danger':'第二位'})],legacySource:true,unresolved:{awards:0,payments:0}}));
 ui.window.loadAdminCommissionLedger();await until(()=>!ui.elements.export.disabled&&ui.calls.length);ui.elements.export.fire('click');await until(()=>ui.files.length===1);
 const csv=await ui.files[0].text();assert.match(csv,/"'=danger"/);assert.match(csv,/"0012345678"/);assert.match(csv,/第二位/);assert.match(csv,/舊月結已付金額/);assert.ok(ui.calls.some(c=>c.url.searchParams.get('page')==='2'));
});
test('member payment view labels bank evidence and old settlement separately',async()=>{
 const ui=setup(url=>url.searchParams.get('mode')==='payments'?{success:true,pageSize:60,total:2,legacySource:true,rows:[{paymentId:'p',statementId:'s',paidAt:'2026-11-03T00:00:00Z',amount:100,paymentRef:'bank-proof',source:'confirmed'},{paymentId:'b',statementId:'b',paidAt:'2026-11-04T00:00:00Z',amount:100,paymentRef:'',source:'legacy_marked'}]}:{success:true,pageSize:30,total:1,legacySource:true,rows:[member('m')]});
 ui.window.loadAdminCommissionLedger();await until(()=>ui.elements.body.innerHTML.includes('匯款紀錄'));
 ui.elements.body.fire('click',{target:{closest:()=>({dataset:{payments:'0'}})}});await until(()=>ui.elements.body.innerHTML.includes('bank-proof'));
 assert.match(ui.elements.body.innerHTML,/已登錄銀行付款/);assert.match(ui.elements.body.innerHTML,/舊月結已付標記（無銀行憑證）/);
});
test('historic award is labeled and exported as pending historical income',async()=>{
 const ui=setup(url=>url.searchParams.get('mode')==='awards'?{success:true,pageSize:60,total:1,legacySource:true,rows:[{memberId:'m',memberName:'合成會員',buyerName:'合成購買人',txId:'historic',orderId:'order',performanceMonth:'2026-05',bonusType:'legacy_manual_direct',amount:1500,status:'review_required'}]}:{success:true,pageSize:30,total:1,legacySource:true,rows:[member('m')]});
 ui.window.loadAdminCommissionLedger();await until(()=>ui.elements.body.innerHTML.includes('傭金明細'));ui.elements.awards.fire('click');await until(()=>ui.elements.body.innerHTML.includes('歷史推薦獎金'));
 assert.match(ui.elements.body.innerHTML,/2026-05/);assert.match(ui.elements.body.innerHTML,/合成購買人/);assert.match(ui.elements.body.innerHTML,/待核對/);ui.elements.export.fire('click');await until(()=>ui.files.length===1);assert.match(await ui.files[0].text(),/歷史推薦獎金（人工補登）/);assert.match(await ui.files[0].text(),/合成購買人/);
});
test('all-member payment export keeps multiple beneficiaries in the same legacy batch',async()=>{
 const ui=setup(url=>{const mode=url.searchParams.get('mode'),page=Number(url.searchParams.get('page'));return mode==='payments'?{success:true,pageSize:1,total:2,legacySource:true,rows:[{memberId:'m'+page,memberName:'會員'+page,paymentId:'same-batch',statementId:'same-batch',amount:100,source:'legacy_marked'}]}:{success:true,pageSize:30,total:1,legacySource:true,rows:[member('m')]}});
 ui.window.loadAdminCommissionLedger();await until(()=>ui.elements.body.innerHTML.includes('匯款紀錄'));ui.elements.payments.fire('click');await until(()=>ui.calls.at(-1).url.searchParams.get('mode')==='payments'&&!ui.elements.export.disabled);
 ui.elements.export.fire('click');await until(()=>ui.files.length===1);const csv=await ui.files[0].text();assert.match(csv,/會員1/);assert.match(csv,/會員2/);
});
