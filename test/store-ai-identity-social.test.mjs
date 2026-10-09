import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixture,REGISTRY_TAX,registryCompany,SOURCE} from './fixtures/store-ai-draft.mjs';
const COMPANY=registryCompany.Company_Name,GOV='https://findbiz.nat.gov.tw/fts/company/'+REGISTRY_TAX;
const BRAND='範例數位工作室',LINK='https://www.merchant.com/about',SOCIAL='https://www.facebook.com/example.digital/',INSTAGRAM='https://www.instagram.com/example.digital/';
const CONTENT='提供網站建置、APP 設計與電子型錄製作服務。';
const fixture=t=>{const f=createFixture();t.after(f.close);const setPage=f.setPage;f.setPage=(url,value)=>setPage(url,value+'<footer>此為合成公開介紹頁，僅供來源核對測試。</footer>');return f;};
function draft(){return {match:'matched',identity:{companyName:COMPANY,taxId:REGISTRY_TAX,brandName:'',evidence:[]},fields:{name:COMPANY,description:CONTENT,category:'服務',address:'',phone:'',hours:''},warnings:[],evidence:[{field:'name',url:GOV,quote:COMPANY},...['description','category'].map(field=>({field,url:SOURCE,quote:CONTENT}))]};}
function provider(d,urls,titles={}){return {status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:urls.map(url=>({url,...(titles[url]?{title:titles[url]}:{})}))}},{type:'message',content:[{type:'output_text',text:JSON.stringify(d)}]}]};}
function setup(f){f.setPage(GOV,`<h1>${COMPANY}</h1><p>統一編號：${REGISTRY_TAX}</p>`);f.setHtml(`<h1>${COMPANY}</h1><p>${CONTENT}</p>`);}
function brandDraft(){const d=draft();d.identity.brandName=BRAND;d.identity.evidence=[{url:LINK,quote:`${COMPANY}旗下品牌為${BRAND}。`}];d.evidence.filter(e=>e.field!=='name').forEach(e=>e.url=SOCIAL);return d;}

test('name from official registration and services on a different website are independent proofs',async t=>{
  const f=fixture(t);setup(f);f.setOutput(provider(draft(),[GOV,SOURCE]));const r=await f.call({name:COMPANY});
  assert.equal(r.match,'matched');assert.equal(r.fields.name,COMPANY);assert.equal(r.fields.description,CONTENT);assert.equal(r.fields.category,'服務');
  assert.deepEqual(new Set(r.sources.map(s=>s.url)),new Set([GOV,SOURCE]));assert.equal(r.identity,undefined);assert.equal(f.metrics.saves,0);
  const sent=JSON.parse(f.calls.find(c=>c.url.includes('openai')).opts.body);assert.match(sent.instructions,/公開 Facebook／Instagram/);assert.ok(sent.text.format.schema.required.includes('identity'));assert.equal(sent.tools[0].search_context_size,'medium');
});

test('verified tax does not require a separate AI name quote to accept same-company business content',async t=>{
  const f=fixture(t);setup(f);const d=draft();d.evidence=d.evidence.filter(e=>e.field!=='name');f.setOutput(provider(d,[SOURCE]));
  const r=await f.call({taxId:REGISTRY_TAX});assert.equal(r.fields.description,CONTENT);assert.equal(r.fields.name,COMPANY);assert.equal(r.fields.address,registryCompany.Company_Location);assert.equal(f.calls.some(c=>c.url===GOV),false);assert.equal(f.metrics.saves,0);
});

test('unreadable registration citation cannot hide a full company name visibly read on the business source',async t=>{
  const f=fixture(t);const d=draft();f.setHtml(`<h1>${COMPANY}</h1><p>${CONTENT}</p>`);f.setOutput(provider(d,[GOV,SOURCE]));
  let r=await f.call({name:COMPANY});assert.equal(r.fields.name,COMPANY);assert.equal(r.fields.description,CONTENT);assert.equal(r.sources.some(s=>s.url===GOV),false);
  f.resetQuota();const url='https://www.1111.com.tw/corp/68637932/';d.evidence.filter(e=>e.field!=='name').forEach(e=>e.url=url);f.setPage(url,`<title>${COMPANY}</title><p>背景驗證中，安全驗證完成後繼續。</p>`);f.setOutput(provider(d,[GOV,url]));
  r=await f.call({name:COMPANY});assert.equal(r.fields.name,COMPANY);assert.equal(r.fields.description,CONTENT);assert.deepEqual(r.reviewFields,['description','category']);assert.equal(f.metrics.saves,0);
});

for(const tax of [false,true])test('source-proven brand relationship enables readable social content, tax='+tax,async t=>{
  const f=fixture(t);setup(f);const d=brandDraft();f.setPage(LINK,`<p>${d.identity.evidence[0].quote}</p>`);f.setPage(SOCIAL,`<h1>${BRAND}</h1><p>${CONTENT}</p>`);f.setOutput(provider(d,[GOV,LINK,SOCIAL]));
  const r=await f.call(tax?{taxId:REGISTRY_TAX}:{name:COMPANY});assert.equal(r.fields.description,CONTENT);assert.equal(r.fields.name,COMPANY);assert.equal(r.reviewFields,undefined);assert.ok(r.sources.some(s=>s.url===LINK));assert.ok(r.sources.some(s=>s.url===SOCIAL));assert.equal(f.metrics.saves,0);
});

test('former company name needs the known tax ID, never just removal of the legal suffix',async t=>{
  const f=fixture(t);setup(f);const d=brandDraft();d.identity.brandName='米樂數位行銷有限公司';d.identity.evidence[0].quote=`米樂數位行銷有限公司；統一編號：${REGISTRY_TAX}`;
  f.setPage(LINK,`<p>${d.identity.evidence[0].quote}</p>`);f.setPage(SOCIAL,`<h1>米樂數位行銷有限公司</h1><p>${CONTENT}</p>`);f.setOutput(provider(d,[GOV,LINK,SOCIAL]));
  let r=await f.call({name:COMPANY});assert.equal(r.fields.description,CONTENT);
  f.resetQuota();d.identity.evidence=[];f.setOutput(provider(d,[GOV,SOCIAL]));r=await f.call({name:COMPANY});assert.equal(r.fields.description,'');assert.equal(r.fields.name,COMPANY);assert.equal(f.metrics.saves,0);
});

for(const mode of ['unread-link','invented-quote','model-assertion','negative-link','shared-paragraph','different-tax','different-company','unrelated-query'])test('rejects unrelated social content: '+mode,async t=>{
  const f=fixture(t);setup(f);const d=brandDraft();let link=d.identity.evidence[0].quote;
  if(mode==='unread-link')link='另一公司的品牌介紹，沒有本公司與品牌關聯。';
  if(mode==='invented-quote')d.identity.evidence[0].quote='模型宣稱同家公司，非來源原文。';
  if(mode==='model-assertion')d.identity.evidence=[];
  if(mode==='negative-link'){link=`${BRAND}並非${COMPANY}旗下品牌。`;d.identity.evidence[0].quote=link;}
  if(mode==='shared-paragraph'){link=`${COMPANY}與${BRAND}參加品牌研討會。`;d.identity.evidence[0].quote=link;}
  f.setPage(LINK,`<p>${link}</p>`);f.setPage(SOCIAL,`<h1>${mode==='different-company'?'另一間行銷有限公司':BRAND}</h1><p>${CONTENT}</p>${mode==='different-tax'?'<p>統一編號：20828393</p>':''}`);f.setOutput(provider(d,[GOV,LINK,SOCIAL]));
  const r=await f.call({name:mode==='unrelated-query'?'另一家公司':COMPANY});assert.equal(r.fields.description,'',mode);assert.equal(r.fields.category,'',mode);assert.equal(f.metrics.saves,0);
});

for(const social of [SOCIAL,INSTAGRAM])test('unreadable public social index uses completed search URL plus citation title and remains review-only: '+new URL(social).hostname,async t=>{
  const f=fixture(t);setup(f);const d=brandDraft();d.evidence.filter(e=>e.field!=='name').forEach(e=>e.url=social);d.fields.phone='0912345678';d.evidence.push({field:'phone',url:social,quote:d.fields.phone});
  f.setPage(LINK,`<p>${d.identity.evidence[0].quote}</p>`);
  // No synthetic HTML for the social URL: safe fetch fails rather than logging
  // in or bypassing it. Real Responses action sources often lack a title.
  const output=provider(d,[GOV,LINK,social]);output.output[1].content[0].annotations=[{type:'url_citation',url:social,title:BRAND+'｜官方介紹'}];f.setOutput(output);
  const r=await f.call({taxId:REGISTRY_TAX});assert.equal(r.fields.description,CONTENT);assert.deepEqual(r.reviewFields,['description','category']);assert.equal(r.fields.phone,'');assert.ok(r.sources.some(s=>s.url===social&&s.title===BRAND+'｜官方介紹'));assert.match(r.warnings.join(''),/可能過時/);assert.equal(f.metrics.saves,0);
});

for(const mode of ['unsearched-url','unverified-brand','unrelated-title','readable-other-company','generic-social-route'])test('social index cannot become identity proof or override a conflicting source: '+mode,async t=>{
  const f=fixture(t);setup(f);const d=brandDraft();f.setPage(LINK,`<p>${d.identity.evidence[0].quote}</p>`);
  const social=mode==='generic-social-route'?'https://www.facebook.com/search/':SOCIAL;d.evidence.filter(e=>e.field!=='name').forEach(e=>e.url=social);
  if(mode==='unverified-brand')d.identity.evidence=[];
  if(mode==='readable-other-company')f.setPage(social,`<h1>另一家公司</h1><p>${CONTENT}</p>`);
  const output=provider(d,[GOV,LINK,...(mode==='unsearched-url'?[]:[social])]);output.output[1].content[0].annotations=[{type:'url_citation',url:social,title:mode==='unrelated-title'?'不相關品牌':BRAND}];f.setOutput(output);
  const r=await f.call({taxId:REGISTRY_TAX});assert.equal(r.fields.description,'',mode);assert.equal(r.reviewFields,undefined);assert.equal(f.metrics.saves,0);
});

test('provided brand website is verified by tax linkage rather than rejected by full legal name alone',async t=>{
  const f=fixture(t);setup(f);const d=draft();d.identity.brandName=BRAND;d.identity.evidence=[{url:SOURCE,quote:`${BRAND}；統一編號：${REGISTRY_TAX}`}];d.evidence=d.evidence.filter(e=>e.field!=='name');
  f.setHtml(`<h1>${BRAND}</h1><p>${d.identity.evidence[0].quote}</p><p>${CONTENT}</p>`);f.setOutput(provider(d,[SOURCE]));
  const r=await f.call({taxId:REGISTRY_TAX,websiteUrl:SOURCE});assert.equal(r.fields.description,CONTENT);assert.equal(r.fields.name,COMPANY);assert.equal(f.calls.filter(c=>c.url===SOURCE).length,1);assert.equal(f.metrics.saves,0);
});

test('relevant source after many search hits is not lost to unrelated first-result truncation; verification stays bounded',async t=>{
  const f=fixture(t);setup(f);const d=draft();f.setOutput(provider(d,[...Array.from({length:20},(_,i)=>`https://www.merchant.com/noise/${i}`),GOV,SOURCE]));
  const r=await f.call({name:COMPANY});assert.equal(r.fields.description,CONTENT);assert.equal(f.calls.filter(c=>c.opts.headers?.Accept==='text/html').length,2);assert.equal(f.calls.some(c=>c.url.includes('/noise/')),false);assert.equal(f.metrics.saves,0);
});

test('malformed identity metadata cannot bypass provider format checks',async t=>{
  const f=fixture(t);setup(f);const d=draft();d.identity.role='admin';f.setOutput(provider(d,[GOV,SOURCE]));const r=await f.call({name:COMPANY});assert.equal(r.status,502);assert.equal(f.metrics.saves,0);
});
