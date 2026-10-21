import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {generateCardBusinessCopy,prepareCardBusinessInput} from '../worker/card-business-copy.mjs';
import {createFixture,UID,SOURCE,sampleFields,sampleDraft,providerResult} from './fixtures/store-ai-draft.mjs';
const fixture=t=>{const f=createFixture();t.after(f.close);return f;};
const card={name:'合成聯絡人',company:sampleFields.name,jobTitle:'負責人',phone:'0912-345678',website:SOURCE,socials:[{t:'Facebook',u:'https://www.facebook.com/synthetic'}]};

test('research uses existing key/model, always searches even with website, returns source preview without business writes',async t=>{
  const f=fixture(t),res=await generateCardBusinessCopy(card,'',f.env(),UID,f.fetcher);
  assert.equal(res.success,true);assert.equal(res.data.service,sampleFields.description);assert.ok(res.data.sources.some(s=>s.url===SOURCE));
  const {opts}=f.calls.find(c=>c.url.includes('openai'));const body=JSON.parse(opts.body),input=JSON.parse(body.input[0].content[0].text);
  assert.equal(body.store,false);assert.equal(body.tools[0].type,'web_search');assert.equal(body.tool_choice,'required');assert.equal(opts.redirect,'manual');
  assert.equal(input.cardIdentityClues.phone,card.phone);assert.equal(input.cardIdentityClues.socials[0].url,card.socials[0].u);
  assert.match(body.instructions,/交叉確認/);assert.match(body.instructions,/不要重述姓名職稱/);assert.match(body.instructions,/禁止使用政府／公司登記/);
  assert.equal(f.metrics.saves,0);assert.ok(f.writes.every(q=>q.startsWith('INSERT INTO partner_onboarding_ai_usage')));
});

test('lost website continues public research and source verification, never uses the failed page',async t=>{
  const f=fixture(t),fetcher=async(url,opts)=>url==='https://www.lostsite.com/card'?new Response('',{status:404}):f.fetcher(url,opts);
  const res=await generateCardBusinessCopy({...card,website:'www.lostsite.com/card'},'',f.env(),UID,fetcher);
  assert.equal(res.success,true);assert.equal(res.data.service,sampleFields.description);assert.match(res.data.warnings.join(''),/網站無法讀取/);
  assert.ok(res.data.sources.every(s=>!s.url.includes('lostsite')));assert.equal(f.metrics.analyses,1);
  const input=JSON.parse(JSON.parse(f.calls.find(c=>c.url.includes('openai')).opts.body).input[0].content[0].text);assert.equal(input.websiteUnavailable,true);
});

test('only minimum business clues sent; no UID, private facts, image, keys or buttons',()=>{
  const result=prepareCardBusinessInput({...card,uid:'secret-uid',birthday:'private-birthday',email:'private-email',Wealth:'private-wealth',Health:'private-health',imageUrl:'private-image',buttons:[{u:'private-url'}],clientOpenAIKey:'private-key'},'品牌與區域');
  assert.doesNotMatch(JSON.stringify(result),/private-|secret-uid/);assert.equal(result.context.brief,'品牌與區域');
  assert.equal(prepareCardBusinessInput({...card,website:'buyplus.one/dejoaro',service:'可透過名片所列電話、電子郵件或網站聯絡洽詢。'}).websiteUrl,'https://buyplus.one/dejoaro');
  assert.equal(prepareCardBusinessInput({service:'可透過名片所列電話、電子郵件或網站聯絡洽詢。'}).context.service,'');
});

test('different company, ambiguous and registration-only results cannot become business copy',async t=>{
  const f=fixture(t);
  for(const mode of ['different','ambiguous','registry','boilerplate']){
    f.resetQuota();const draft=sampleDraft();
    if(mode==='different')f.setHtml('<h1>別家公司</h1><p>'+sampleFields.description+'</p>');
    if(mode==='ambiguous')draft.match='ambiguous';
    if(mode==='registry')draft.fields.description='登記業務摘要：食品什貨批發業、資訊軟體服務業';
    if(mode==='boilerplate')draft.fields.description='歡迎透過名片上的聯絡方式洽詢。';
    f.setOutput(providerResult(draft));
    const res=await generateCardBusinessCopy(card,'',f.env(),UID,f.fetcher);assert.equal(res.success,false);assert.match(res.error,/原說明未變更/);assert.equal(res.data.service,undefined);
  }
  assert.equal(f.metrics.saves,0);
});

test('card quota is atomic, independent from store quota, 50/day with 15s interval',async t=>{
  const f=fixture(t);const outcomes=await Promise.allSettled([generateCardBusinessCopy(card,'',f.env(),UID,f.fetcher),generateCardBusinessCopy(card,'',f.env(),UID,f.fetcher)]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(outcomes.filter(o=>o.status==='rejected').length,1);
  const row=f.sql.prepare('SELECT * FROM partner_onboarding_ai_usage').get();assert.equal(row.actor_uid,'card-business:'+UID);assert.equal(row.attempts,1);
  f.sql.exec('UPDATE partner_onboarding_ai_usage SET attempts=50,next_allowed_at=0');await assert.rejects(generateCardBusinessCopy(card,'',f.env(),UID,f.fetcher),/50 次/);
  assert.equal((await f.call()).success,true);assert.equal(f.metrics.saves,0);
});

test('auth required, unsafe inputs rejected, provider failure never invokes unsourced fallback',async t=>{
  const f=fixture(t);await assert.rejects(generateCardBusinessCopy(card,'',f.env(),'',f.fetcher),/登入/);
  for(const website of ['https://127.0.0.1','http://www.merchant.com','https://a:b@www.merchant.com','javascript:alert(1)'])await assert.rejects(generateCardBusinessCopy({...card,website},'',f.env(),UID,f.fetcher),/公開 HTTPS/);
  assert.equal(f.writes.length,0);f.setStatus(503);await assert.rejects(generateCardBusinessCopy(card,'',f.env(),UID,f.fetcher),/AI 服務暫時/);assert.equal(f.metrics.analyses,1);assert.equal(f.metrics.saves,0);
});

test('legacy authenticated action/quota and business_intent branch remain in place',()=>{
  const source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
  assert.match(source,/generateCardCopy:\s*\{ access: 'authenticated' \}/);
  assert.match(source,/case 'generateCardCopy':\s*return await AIModule.generateCardCopy\(payload, env, actor\)/);
  const method=source.slice(source.indexOf('  async generateCardCopy('),source.indexOf('  async fateTags('));
  assert.match(method,/outputType[\s\S]*?business_intent[\s\S]*?generateBusinessIntentDraft\(payload, env\)/);
  assert.match(method,/generateCardBusinessCopy/);assert.doesNotMatch(method,/callGemini|updateCard|callOpenAI/);
});

test('actual Worker method passes verified actor, preserves business_intent and returns failure without model fallback',async t=>{
  const f=fixture(t),source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
  const method=source.slice(source.indexOf('  async generateCardCopy('),source.indexOf('  async fateTags('));
  const calls=[];const api=vm.runInNewContext('({'+method+'})',{generateCardBusinessCopy:async(c,b,e,u)=>{calls.push(u);return generateCardBusinessCopy(c,b,e,u,f.fetcher);}});
  api.generateBusinessIntentDraft=async payload=>({success:true,keptIntent:payload.brief});
  assert.equal((await api.generateCardCopy({outputType:'business_intent',brief:'原需求'},{})).keptIntent,'原需求');assert.equal(calls.length,0);
  assert.equal((await api.generateCardCopy({card},f.env(),{userId:UID})).success,true);assert.equal(calls[0],UID);
  const denied=await api.generateCardCopy({card,userId:UID},f.env());assert.equal(denied.success,false);assert.match(denied.error,/登入/);
  f.resetQuota();f.setStatus(503);const failed=await api.generateCardCopy({card},f.env(),{userId:UID});assert.equal(failed.success,false);assert.equal(f.metrics.saves,0);
});

test('different public brand can use same phone plus full address; supplier other-shop services cannot leak in',async t=>{
  const f=fixture(t),brand='合成選物',address='台北市松山區合成路五段69巷5號',phone='02-12345678';
  const proof=`${brand} 地址：${address} 電話：${phone}`;
  const services=`${brand} 販售法式冰淇淋及手工香腸。`;
  const draft=sampleDraft();draft.identity={companyName:'合成公司錯字',taxId:'',brandName:brand,evidence:[{url:SOURCE,quote:proof}]};
  draft.fields.name='合成公司錯字';draft.fields.description='販售法式冰淇淋與手工香腸，提供日常餐桌食材選購。';
  draft.evidence=[{field:'description',url:SOURCE,quote:services}];
  const matchingCard={...card,company:'合成公司錯字',companyPhone:phone,address};
  f.setHtml('<h1>供應商通路頁</h1><p>'+proof+'</p><p>'+services+'</p>');f.setOutput(providerResult(draft));
  let result=await generateCardBusinessCopy(matchingCard,'',f.env(),UID,f.fetcher);assert.equal(result.success,true);assert.match(result.data.warnings.join(''),/名稱不會自動更改/);
  f.resetQuota();draft.evidence[0].quote='其他店家提供網站設計。';f.setHtml('<p>'+proof+'</p><p>'+draft.evidence[0].quote+'</p>');f.setOutput(providerResult(draft));
  result=await generateCardBusinessCopy(matchingCard,'',f.env(),UID,f.fetcher);assert.equal(result.success,false);
});

for(const mode of ['phone-only','address-only','wrong-phone','wrong-address','invented-quote','registry-only'])test('card brand contact proof rejects '+mode,async t=>{
  const f=fixture(t),brand='合成選物',address='台北市松山區合成路五段69巷5號',phone='02-12345678';
  const proof=`${brand} ${mode==='phone-only'?'':address} ${mode==='address-only'?'':phone}`;
  const draft=sampleDraft(),url=mode==='registry-only'?'https://twincn.com/company':SOURCE;
  draft.identity={companyName:card.company,taxId:'',brandName:brand,evidence:[{url,quote:proof}]};draft.evidence=[{field:'description',url,quote:brand+'販售冰淇淋。'}];
  const html='<p>'+(mode==='invented-quote'?'不存在的證據':proof)+'</p><p>'+brand+'販售冰淇淋。</p>';f.setHtml(html);f.setOutput(providerResult(draft));
  const res=await generateCardBusinessCopy({...card,companyPhone:mode==='wrong-phone'?'02-99999999':phone,address:mode==='wrong-address'?'台北市松山區別條路99號':address},'',f.env(),UID,f.fetcher);
  assert.equal(res.success,false);assert.equal(f.metrics.saves,0);
});
