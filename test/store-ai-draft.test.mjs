import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStoreShop} from '../worker/store-shop.mjs';
import {createFixture,UID,OTHER,SOURCE,sampleFields,sampleDraft,providerResult} from './fixtures/store-ai-draft.mjs';
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
  assert.equal(request.opts.headers.Authorization,'Bearer server-only-test-secret');assert.equal(request.opts.redirect,'error');assert.equal(sent.model,'gpt-4.1');assert.equal(sent.store,false);assert.equal(sent.tool_choice,'required');assert.deepEqual(sent.include,['web_search_call.action.sources']);assert.equal(sent.text.format.strict,true);assert.equal(sent.tools[0].type,'web_search');assert.match(sent.instructions,/不可信資料/);
});
test('actual consulted and fetched evidence protects contact facts; fabricated source/value stripped',async t=>{
  const f=fixture(t);const result=await f.call();assert.deepEqual(result.fields,sampleFields);assert.equal(result.sources[0].url,SOURCE);
  const page=f.calls.find(c=>c.url===SOURCE);assert.equal(page.opts.headers.Authorization,undefined);assert.equal(page.opts.credentials,'omit');
  f.resetQuota();const d=sampleDraft();d.fields.phone='0900-999999';d.evidence.find(e=>e.field==='hours').url='https://forged.com/';f.setOutput(providerResult(d));
  const r=await f.call();assert.equal(r.fields.phone,'');assert.equal(r.fields.hours,'');assert.equal(r.fields.address,sampleFields.address);assert.match(r.warnings.join(''),/來源文字核對/);assert.equal(f.calls.some(c=>c.url.includes('forged')),false);
});
test('source blocked, unreadable or identity unproven leaves all facts blank, not invented',async t=>{
  const f=fixture(t);f.setPrivate(true);let r=await f.call();assert.equal(r.status,200);assert.ok(Object.values(r.fields).every(v=>v===''));assert.equal(r.sources.length,0);
  f.resetQuota();f.setPrivate(false);f.setHtml('<h1>不同公司</h1><p>'+Object.values(sampleFields).slice(1).join(' ')+'</p>');r=await f.call();assert.equal(r.fields.phone,'');assert.match(r.warnings.join(''),/店名來源/);
});
for(const match of ['ambiguous','not_found'])test(match+' never mixes store fields',async t=>{const f=fixture(t);f.setOutput(providerResult({...sampleDraft(),match}));const r=await f.call();assert.equal(r.status,200);assert.ok(Object.values(r.fields).every(v=>v===''));assert.match(r.warnings.join(''),/官網/);assert.equal(f.calls.filter(c=>c.url===SOURCE).length,0);});
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
