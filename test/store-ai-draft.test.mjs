import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStoreShop} from '../worker/store-shop.mjs';
import {createFixture,UID,OTHER,SOURCE,sampleFields,sampleDraft,providerResult,REGISTRY_TAX,registryCompany} from './fixtures/store-ai-draft.mjs';
import {registryApis,lookupStoreRegistration} from '../worker/store-registration.mjs';
const fixture=t=>{const f=createFixture();t.after(f.close);return f;};
test('store draft reuses actor: no unregistered/expired/forged identity; no existing shop required',async t=>{
  const f=fixture(t);for(const [uid,status]of [[null,401],['expired',401],['U'+'c'.repeat(32),403]])assert.equal((await f.call(undefined,uid)).status,status);
  assert.equal((await f.call({name:sampleFields.name,uid:OTHER})).status,400);assert.equal(f.writes.length,0);
  for(const role of ['user','store','admin','用戶','店長','總管']){f.resetQuota();f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role,UID);assert.equal((await f.call()).status,200);}
  assert.ok(f.writes.every(q=>q.startsWith('INSERT INTO partner_onboarding_ai_usage')));
  assert.equal(f.sql.prepare('SELECT count(*) n FROM store_shop_stores').get().n,0);assert.equal(f.metrics.saves,0);
});
test('bounded allowlisted inputs, content type and server-only key/model',async t=>{
  const f=fixture(t);
  for(const data of [{name:' '},{name:'a'},{name:'x'.repeat(81)},{name:'測試',hint:'x'.repeat(121)},{name:'測試',websiteUrl:'https://127.0.0.1'},{name:'測試',role:'admin'},{name:'測試',key:'evil'},{name:'測試',model:'evil'},{name:'測試',status:'active'}])assert.equal((await f.call(data)).status,400);
  assert.equal((await f.call({name:'x'.repeat(5000)})).status,413);assert.equal((await f.call(undefined,UID,{headers:{'Content-Type':'text/plain'}})).status,415);assert.equal(f.writes.length,0);
  f.setNoKey(true);assert.equal((await f.call()).status,503);assert.equal(f.writes.length,0);f.setNoKey(false);
  const r=await f.call(undefined,UID,{env:{OPENAI_MODEL:'gpt-4.1'}});assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.doesNotMatch(JSON.stringify(r),/server-only/);
  const request=f.calls.find(c=>c.url.includes('openai'));const sent=JSON.parse(request.opts.body);
  assert.equal(request.opts.headers.Authorization,'Bearer server-only-test-secret');assert.equal(request.opts.redirect,'manual');assert.equal(sent.model,'gpt-4.1');assert.equal(sent.store,false);assert.equal(sent.tool_choice,'required');assert.deepEqual(sent.include,['web_search_call.action.sources']);assert.equal(sent.text.format.strict,true);assert.equal(sent.tools[0].type,'web_search');assert.match(sent.instructions,/不可信資料/);
});
test('Workers-compatible no-follow fetch covers provider and source DNS; rejects provider redirects without business writes',async t=>{
  const f=fixture(t);
  const strictFetch=async(url,opts)=>{if(opts.redirect==='error')throw new TypeError('Invalid redirect value');return f.fetcher(url,opts);};
  const {generateStoreDraft}=await import('../worker/store-ai-draft.mjs');
  const result=await generateStoreDraft({name:sampleFields.name},f.env(),UID,strictFetch);
  assert.deepEqual(result.fields,sampleFields);
  assert.ok(f.calls.filter(c=>c.url.includes('dns-query')).every(c=>c.opts.redirect==='manual'&&!c.opts.headers.Authorization));
  f.resetQuota();f.setStatus(302);f.setOutput({redirect:'private secret'});
  const warnings=[];t.mock.method(console,'warn',value=>warnings.push(JSON.parse(value)));
  await assert.rejects(generateStoreDraft({name:sampleFields.name},f.env(),UID,strictFetch),/AI 服務暫時/);
  assert.equal(warnings[0].stage,'provider');assert.equal(warnings[0].providerStatus,302);
  assert.doesNotMatch(JSON.stringify(warnings),/server-only|private secret|merchant\.com|a{32}/);
  assert.equal(f.calls.filter(c=>c.url.includes('openai')).length,2);assert.equal(f.metrics.saves,0);
});
test('actual consulted and fetched evidence protects contact facts; fabricated source/value stripped',async t=>{
  const f=fixture(t);const result=await f.call();assert.deepEqual(result.fields,sampleFields);assert.equal(result.sources[0].url,SOURCE);
  const page=f.calls.find(c=>c.url===SOURCE);assert.equal(page.opts.headers.Authorization,undefined);assert.equal(page.opts.credentials,'omit');
  f.resetQuota();const d=sampleDraft();d.fields.phone='0900-999999';d.evidence.find(e=>e.field==='hours').url='https://forged.com/';f.setOutput(providerResult(d));
  const r=await f.call();assert.equal(r.fields.phone,'');assert.equal(r.fields.hours,'');assert.equal(r.fields.address,sampleFields.address);assert.match(r.warnings.join(''),/來源文字核對/);assert.equal(f.calls.some(c=>c.url.includes('forged')),false);
});
test('source blocked, unreadable or identity unproven leaves all facts blank, not invented',async t=>{
  const f=fixture(t);f.setPrivate(true);let r=await f.call();assert.equal(r.status,200);assert.ok(Object.values(r.fields).every(v=>v===''));assert.equal(r.sources.length,0);
  f.resetQuota();f.setPrivate(false);f.setHtml('<h1>不同公司</h1><p>'+Object.values(sampleFields).slice(1).join(' ')+'</p>');r=await f.call();assert.equal(r.fields.phone,'');assert.match(r.warnings.join(''),/尚未確認/);
});
for(const match of ['ambiguous','not_found'])test(match+' never mixes store fields',async t=>{const f=fixture(t);f.setOutput(providerResult({...sampleDraft(),match}));const r=await f.call();assert.equal(r.status,200);assert.ok(Object.values(r.fields).every(v=>v===''));assert.match(r.warnings.join(''),/商家/);assert.equal(f.calls.filter(c=>c.url===SOURCE).length,0);});
test('official website is safe single-call extraction, no token forwarding or search',async t=>{
  const f=fixture(t);const r=await f.call({name:sampleFields.name,websiteUrl:SOURCE});assert.deepEqual(r.fields,sampleFields);const sent=JSON.parse(f.calls.find(c=>c.url.includes('openai')).opts.body);assert.equal(sent.tools,undefined);assert.match(sent.input[0].content[0].text,/source/);assert.equal(f.calls.filter(c=>c.url===SOURCE).length,1);
  f.resetQuota();f.setPrivate(true);assert.equal((await f.call({name:sampleFields.name,websiteUrl:SOURCE})).status,422);assert.equal(f.metrics.analyses,1);
});
test('quota is atomic, namespaced, Taipei daily, 20/day and 15s; no business writes',async t=>{
  const f=fixture(t);const results=await Promise.all([f.call(),f.call()]);assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);const row=f.sql.prepare('SELECT * FROM partner_onboarding_ai_usage').get();assert.equal(row.actor_uid,'store-draft:'+UID);assert.equal(row.attempts,1);assert.equal(row.usage_day,new Date(Date.now()+8*3600000).toISOString().slice(0,10));
  f.sql.exec('UPDATE partner_onboarding_ai_usage SET attempts=20,next_allowed_at=0');assert.equal((await f.call()).status,429);
  f.sql.exec("UPDATE partner_onboarding_ai_usage SET usage_day='2000-01-01',next_allowed_at=0");assert.equal((await f.call()).status,200);assert.equal(f.sql.prepare('SELECT attempts FROM partner_onboarding_ai_usage').get().attempts,1);assert.equal((await f.call(undefined,OTHER)).status,200);assert.equal(f.metrics.saves,0);
});
for(const [label,out]of [['incomplete',{status:'incomplete',output:[]}],['no-search',{status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(sampleDraft())}]}]}],['bad-json',providerResult('oops')],['extra-field',providerResult({...sampleDraft(),status:'active'})],['bad-category',providerResult({...sampleDraft(),fields:{...sampleFields,category:'evil'}})],['huge',providerResult({...sampleDraft(),warnings:['x'.repeat(300000)]})]])test('rejects '+label+' output without store writes',async t=>{const f=fixture(t);f.setOutput(out);assert.equal((await f.call()).status,502);assert.equal(f.metrics.saves,0);});
test('provider HTTP/timeout errors are safe and diagnostic, failed retry cannot mutate store',async t=>{
  const f=fixture(t);f.setStatus(500);f.setOutput({error:'private secret'});let r=await f.call();assert.equal(r.status,503);assert.doesNotMatch(r.error,/private|secret/);assert.match(r.error,/SD-/);f.resetQuota();f.setThrow(true);r=await f.call();assert.match(r.error,/逾時/);assert.equal(f.metrics.saves,0);
});
test('new route CORS and unrelated routing unchanged',async()=>{assert.equal((await handleStoreShop(new Request('https://app.com/v1/store-shop/store-ai-draft',{method:'OPTIONS'}),{})).status,204);assert.equal(await handleStoreShop(new Request('https://app.com/unrelated'),{}),null);});

test('tax alone returns authoritative name/address without OpenAI key or provider and without business writes',async t=>{
  const f=fixture(t);f.setNoKey(true);const r=await f.call({taxId:REGISTRY_TAX,mode:'registry'});
  assert.equal(r.status,200);assert.equal(r.match,'matched');assert.equal(r.fields.name,registryCompany.Company_Name);assert.equal(r.fields.address,registryCompany.Company_Location);assert.equal(r.fields.phone,'');assert.equal(r.fields.hours,'');assert.equal(r.fields.description,'');assert.equal(f.metrics.analyses,0);assert.equal(f.metrics.saves,0);
  assert.doesNotMatch(JSON.stringify(r),/Responsible_Name|Capital|actor_uid/);assert.match(r.warnings.join(''),/登記地址/);
  const request=f.calls.find(c=>c.url.includes('data.gcis'));const url=new URL(request.url);assert.equal(url.hostname,'data.gcis.nat.gov.tw');assert.equal(url.searchParams.get('$filter'),'Business_Accounting_NO eq '+REGISTRY_TAX);assert.equal(request.opts.redirect,'manual');assert.equal(request.opts.credentials,'omit');assert.equal(request.opts.headers.Authorization,undefined);assert.equal(request.opts.signal.aborted,false);
});
test('tax malformed/missing/oversized and unauthorized inputs are rejected before lookup or quota',async t=>{
  const f=fixture(t);for(const taxId of ['1234567','123456789','1234abcd',12345678,'https://evil.com'])assert.equal((await f.call({taxId,mode:'registry'})).status,400);
  for(const data of [{mode:'registry'},{taxId:REGISTRY_TAX,mode:'bad'},{taxId:REGISTRY_TAX,uid:OTHER}])assert.equal((await f.call(data)).status,400);
  assert.equal((await f.call({taxId:REGISTRY_TAX,mode:'registry'},null)).status,401);assert.equal(f.writes.length,0);assert.equal(f.calls.some(c=>c.url.includes('data.gcis')),false);
});
test('registry lookup independent quota allows immediate AI enrichment but never resets or bypasses either limit',async t=>{
  const f=fixture(t);assert.equal((await f.call({taxId:REGISTRY_TAX,mode:'registry'})).status,200);assert.equal((await f.call({taxId:REGISTRY_TAX})).status,200);assert.equal((await f.call({taxId:REGISTRY_TAX,mode:'registry'})).status,429);
  const row=f.sql.prepare('SELECT * FROM partner_onboarding_ai_usage WHERE actor_uid=?').get('store-lookup:'+UID);assert.equal(row.attempts,1);assert.ok(row.next_allowed_at-Date.now()<=3000);f.sql.prepare('UPDATE partner_onboarding_ai_usage SET attempts=60,next_allowed_at=0 WHERE actor_uid=?').run('store-lookup:'+UID);assert.equal((await f.call({taxId:REGISTRY_TAX,mode:'registry'})).status,429);assert.equal(f.metrics.saves,0);
});
test('company empty falls back to business exact tax; both empty is not_found not a service error',async t=>{
  const f=fixture(t);f.setRegistry({company:[],business:[{President_No:REGISTRY_TAX,Business_Name:'合成商號',Business_Address:'合成地址',Business_Current_Status_Desc:'核准設立'}],items:[]});let r=await f.call({taxId:REGISTRY_TAX,mode:'registry'});assert.equal(r.fields.name,'合成商號');assert.equal(r.fields.address,'合成地址');
  f.resetQuota();f.setRegistry({company:[],business:[],items:[]});r=await f.call({taxId:REGISTRY_TAX,mode:'registry'});assert.equal(r.status,200);assert.equal(r.match,'not_found');assert.ok(Object.values(r.fields).every(v=>v===''));assert.equal(f.metrics.analyses,0);
});
for(const [label,data,status,type] of [
  ['wrong-id',{company:[{...registryCompany,Business_Accounting_NO:'20828393'}]},200,'application/json'],
  ['duplicate',{company:[registryCompany,registryCompany]},200,'application/json'],
  ['HTTP',{company:[]},503,'application/json'],
  ['IP-denied',{company:'非授權介接之IP(private)'},200,'application/json'],
  ['non-JSON',{company:[]},200,'text/html'],
  ['oversized',{company:[{...registryCompany,extra:'x'.repeat(70000)}]},200,'application/json']
])test('registry '+label+' fails safely and is never mislabeled not_found',async t=>{
  const f=fixture(t);f.setRegistry(data,status,type);const r=await f.call({taxId:REGISTRY_TAX,mode:'registry'});assert.ok(r.status>=500);assert.equal(r.fields,undefined);assert.match(r.error,/SD-/);assert.doesNotMatch(r.error,/private|20828393|查無公司/);assert.equal(f.metrics.saves,0);assert.equal(f.metrics.analyses,0);
});
test('registry redirect never follows or forwards credentials; broken JSON and timeout fail safely',async t=>{
  const f=fixture(t);for(const fetcher of [async()=>new Response('',{status:302,headers:{Location:'https://evil.com'}}),async()=>new Response('broken',{headers:{'Content-Type':'application/json'}}),async()=>{throw new DOMException('private IP','TimeoutError');}])await assert.rejects(lookupStoreRegistration(REGISTRY_TAX,fetcher));assert.equal(f.metrics.saves,0);
});
test('AI enrichment failure or unmatched generated output cannot erase official registry facts',async t=>{
  const f=fixture(t);f.setStatus(503);let r=await f.call({taxId:REGISTRY_TAX,name:'另一家旧店'});assert.equal(r.status,200);assert.equal(r.fields.name,registryCompany.Company_Name);assert.equal(r.fields.address,registryCompany.Company_Location);assert.match(r.warnings.join(''),/AI 補充未完成/);assert.equal(r.sources.length,1);
  f.resetQuota();f.setStatus(200);f.setOutput(providerResult({...sampleDraft(),match:'ambiguous'}));r=await f.call({taxId:REGISTRY_TAX});assert.equal(r.fields.name,registryCompany.Company_Name);assert.equal(r.fields.address,registryCompany.Company_Location);assert.equal(r.fields.phone,'');assert.equal(r.fields.description,'');assert.equal(f.metrics.saves,0);
});
// Synthetic business content for the company in the user's screenshot. This is
// deterministic route coverage, not a live AI-generated description.
const operatingFields={name:registryCompany.Company_Name,description:'提供網站設計、APP 行銷與 LINE 群購服務。',category:'服務',address:registryCompany.Company_Location,phone:'',hours:''};
function operatingDraft(url=SOURCE){return {match:'matched',identity:{companyName:operatingFields.name,taxId:'',brandName:'',evidence:[]},fields:{...operatingFields},warnings:[],evidence:[
  {field:'name',url,quote:operatingFields.name},{field:'address',url,quote:operatingFields.address},
  ...['description','category'].map(field=>({field,url,quote:operatingFields.description}))
]};}
const withSources=(draft,urls)=>({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:urls.map(url=>({url,title:'公司公開介紹'}))}},{type:'message',content:[{type:'output_text',text:JSON.stringify(draft)}]}]});
function operatingFixture(t){const f=fixture(t);f.setHtml('<h1>'+operatingFields.name+'</h1><p>'+operatingFields.description+'</p><address>'+operatingFields.address+'</address>');f.setOutput(providerResult(operatingDraft()));return f;}
test('tax-only generation and regeneration search actual services, never registered business items',async t=>{
  const f=operatingFixture(t);
  for(let i=0;i<2;i++){
    f.resetQuota();const r=await f.call({taxId:REGISTRY_TAX,hint:'新北板橋'});
    assert.deepEqual(r.fields,operatingFields);assert.doesNotMatch(r.fields.description,/登記|批發業/);assert.equal(r.sources.length,2);assert.ok(r.sources.some(s=>s.url===SOURCE));
  }
  for(const request of f.calls.filter(c=>c.url.includes('openai'))){
    const body=JSON.parse(request.opts.body),input=JSON.parse(body.input[0].content[0].text);
    assert.equal(body.tools[0].type,'web_search');assert.equal(body.tool_choice,'required');assert.equal(body.store,false);
    assert.equal(input.company,operatingFields.name);assert.equal(input.hint,'新北板橋');assert.equal(input.registeredIdentity.taxId,REGISTRY_TAX);
    assert.equal(input.officialWebsite,undefined);assert.equal(input.source,undefined);assert.match(input.research,/產品／服務/);assert.match(body.instructions,/禁止使用政府／公司登記/);
  }
  assert.equal(f.calls.some(c=>c.url.includes(registryApis.items)),false);assert.equal(f.metrics.saves,0);
  assert.ok(f.calls.filter(c=>c.url===SOURCE).every(c=>c.opts.credentials==='omit'&&!c.opts.headers.Authorization));
});
test('registry fast lookup remains AI-free; separate enrichment searches actual services',async t=>{
  const f=operatingFixture(t);const basic=await f.call({taxId:REGISTRY_TAX,mode:'registry'});
  assert.equal(basic.fields.description,'');assert.equal(f.metrics.analyses,0);
  const enriched=await f.call({taxId:REGISTRY_TAX});assert.equal(enriched.fields.description,operatingFields.description);assert.equal(f.metrics.analyses,1);assert.equal(f.metrics.saves,0);
});
test('tax plus supplied matching website extracts actual services without registry-item fallback',async t=>{
  const f=operatingFixture(t),r=await f.call({taxId:REGISTRY_TAX,websiteUrl:SOURCE});assert.deepEqual(r.fields,operatingFields);
  const body=JSON.parse(f.calls.find(c=>c.url.includes('openai')).opts.body);assert.equal(body.tools,undefined);assert.match(body.input[0].content[0].text,/產品／服務/);
  assert.equal(f.calls.filter(c=>c.url===SOURCE).length,1);assert.equal(f.calls.some(c=>c.url.includes(registryApis.items)),false);assert.equal(f.metrics.saves,0);
});
for(const [label,description,quote]of [
  ['explicit summary','登記業務摘要：登記營業項目包含資訊軟體服務業。','提供網站設計、APP 行銷與 LINE 群購服務。'],
  ['paraphrased legal items','提供食品什貨批發業、化粧品批發業、電信器材批發業服務。','食品什貨批發業、化粧品批發業、電信器材批發業'],
  ['one legal item as proof',operatingFields.description,'資訊軟體服務業'],
  ['business code as proof',operatingFields.description,'I301010 資訊軟體服務業']
])test('rejects '+label+' in any generated business field despite matched identity',async t=>{
  const f=operatingFixture(t),draft=operatingDraft();draft.fields.description=description;
  draft.evidence.filter(e=>['description','category'].includes(e.field)).forEach(e=>e.quote=quote);
  f.setHtml('<h1>'+operatingFields.name+'</h1><p>'+quote+'</p><address>'+operatingFields.address+'</address>');f.setOutput(providerResult(draft));
  const r=await f.call({taxId:REGISTRY_TAX});assert.equal(r.fields.description,'');if(label!=='explicit summary')assert.equal(r.fields.category,'');
  assert.equal(r.fields.name,operatingFields.name);assert.equal(r.fields.address,operatingFields.address);assert.match(r.warnings.join(''),/實際營業內容/);assert.equal(f.metrics.saves,0);
});
for(const source of ['https://findbiz.nat.gov.tw/fts/company/24456660','https://data.gcis.nat.gov.tw/od/data/api/'+registryApis.items,'https://mygov.tw/company/24456660','https://www5cdn.technews.tw/company/24456660'])test('registry-only source cannot prove services: '+new URL(source).hostname,async t=>{
  const f=operatingFixture(t);f.setOutput(withSources(operatingDraft(source),[source]));
  const r=await f.call({taxId:REGISTRY_TAX});assert.equal(r.fields.description,'');assert.equal(r.fields.category,'');assert.equal(r.fields.name,operatingFields.name);assert.equal(r.sources.length,1);
  assert.equal(f.calls.some(c=>c.url===source&&c.opts.headers.Accept==='text/html'),false);assert.equal(f.metrics.saves,0);
});
test('name-only search rejects registry summaries too; mixed real service paragraph remains usable',async t=>{
  const f=operatingFixture(t),draft=operatingDraft();draft.fields.description='登記業務摘要：資訊軟體服務業';f.setOutput(providerResult(draft));
  let r=await f.call({name:operatingFields.name});assert.equal(r.fields.description,'');
  f.resetQuota();f.setHtml('<h1>'+operatingFields.name+'</h1><p>登記營業項目：資訊軟體服務業</p><p>'+operatingFields.description+'</p><address>'+operatingFields.address+'</address>');f.setOutput(providerResult(operatingDraft()));
  r=await f.call({name:operatingFields.name});assert.equal(r.fields.description,operatingFields.description);assert.equal(r.fields.category,'服務');assert.equal(f.metrics.saves,0);
});
test('no completed search or another company cannot enrich the verified tax identity',async t=>{
  const f=operatingFixture(t);f.setOutput({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(operatingDraft())}]}]});
  let r=await f.call({taxId:REGISTRY_TAX});assert.equal(r.fields.description,'');assert.match(r.warnings.join(''),/AI 補充未完成/);
  f.resetQuota();f.setHtml('<h1>'+sampleFields.name+'</h1><p>'+Object.values(sampleFields).join(' ')+'</p>');f.setOutput(providerResult(sampleDraft()));
  r=await f.call({taxId:REGISTRY_TAX});assert.equal(r.fields.name,operatingFields.name);assert.equal(r.fields.address,operatingFields.address);assert.equal(r.fields.description,'');assert.equal(r.fields.phone,'');assert.equal(f.metrics.saves,0);
});
for(const url of ['https://www.1111.com.tw/corp/68637932/','https://www.104.com.tw/company/abc123'])test('indexed company-profile draft is marked for review, never promoted to fetched contact facts: '+new URL(url).hostname,async t=>{
  const f=operatingFixture(t),draft=operatingDraft(url);
  draft.fields.phone='02-8787-1111';draft.fields.hours='全天';
  draft.evidence.push({field:'phone',url,quote:draft.fields.phone},{field:'hours',url,quote:draft.fields.hours});
  f.setPage(url,'<title>'+operatingFields.name+'</title><p>背景驗證中，安全驗證完成後繼續。平台客服：02-8787-1111 全天</p>');f.setOutput(withSources(draft,[url]));
  const r=await f.call({taxId:REGISTRY_TAX});assert.equal(r.fields.description,operatingFields.description);assert.equal(r.fields.category,'服務');
  assert.deepEqual(r.reviewFields,['description','category']);assert.equal(r.fields.phone,'');assert.equal(r.fields.hours,'');assert.equal(r.fields.address,operatingFields.address);
  assert.match(r.warnings.join(''),/公開搜尋索引/);assert.match(r.warnings.join(''),/可能過時/);assert.ok(r.sources.some(s=>s.url===url));
  assert.equal(f.metrics.saves,0);assert.equal(f.calls.filter(c=>c.url===url).length,1);assert.equal(f.calls.some(c=>/captcha-gate/.test(c.url)),false);
});
test('index fallback rejects unknown publisher, fabricated citation, mismatched identity, and registration proof',async t=>{
  const f=operatingFixture(t),profile='https://www.1111.com.tw/corp/68637932/';
  for(const mode of ['unknown-publisher','fabricated-citation','wrong-company','registry-proof']){
    f.resetQuota();const url=mode==='unknown-publisher'?'https://www.merchant.com/corp/68637932/':profile,draft=operatingDraft(url);
    f.setPage(url,'<title>'+(mode==='wrong-company'?'另一家股份有限公司':operatingFields.name)+'</title><p>背景驗證中，安全驗證完成後繼續，請稍候頁面載入。</p>');
    if(mode==='registry-proof')draft.evidence.filter(e=>['description','category'].includes(e.field)).forEach(e=>e.quote='登記營業項目：資訊軟體服務業');
    const output=withSources(draft,mode==='fabricated-citation'?[SOURCE]:[url]);
    if(mode==='fabricated-citation')output.output[1].content[0].annotations=[{type:'url_citation',url:profile,title:operatingFields.name}];
    f.setOutput(output);const r=await f.call({taxId:REGISTRY_TAX});assert.equal(r.fields.description,'',mode);assert.equal(r.reviewFields,undefined,mode);assert.equal(f.metrics.saves,0);
  }
});
test('name-only exact query may preview indexed services, but cannot use it for another company',async t=>{
  const f=operatingFixture(t),url='https://www.1111.com.tw/corp/68637932/';f.setPage(url,'<title>'+operatingFields.name+'</title><p>背景驗證中，安全驗證完成後繼續，請稍候頁面載入。</p>');f.setOutput(withSources(operatingDraft(url),[url]));
  let r=await f.call({name:operatingFields.name});assert.equal(r.fields.description,operatingFields.description);assert.equal(r.fields.address,'');assert.deepEqual(r.reviewFields,['description','category']);
  f.resetQuota();r=await f.call({name:'另一家公司'});assert.equal(r.fields.description,'');assert.equal(r.reviewFields,undefined);assert.equal(f.metrics.saves,0);
});
