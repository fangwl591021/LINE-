import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handlePartnerOnboarding,searchSourceCards,fieldLimits,publicWebsiteUrl,publicIp,readWebsite,normalizeDraft,htmlSource,boundedText} from '../worker/partner-onboarding-ai.mjs';
import {storeInviteProfileView} from '../workerbackup.js';
const ADMIN='Uf729764dbb5b652a5a90a467320bea29',OTHER='U'+'2'.repeat(32);
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=';
const draft=(extra={})=>({fields:{...Object.fromEntries(Object.keys(fieldLimits).map(k=>[k,''])),name:'測試咖啡店',category:'食',address:'台北市測試路 1 號',...extra},warnings:['營業時間未載明，請人工確認']});
function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT,line_id TEXT,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT,phone TEXT DEFAULT '');
    CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
    CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,scanner_user_id TEXT,creator_id TEXT,owner_user_id TEXT,source_type TEXT DEFAULT 'private_import',name TEXT DEFAULT '',company_name TEXT DEFAULT '',office_phone TEXT DEFAULT '',mobile TEXT DEFAULT '',email TEXT DEFAULT '',tax_id TEXT DEFAULT '',website TEXT DEFAULT '',address TEXT DEFAULT '',services TEXT DEFAULT '',title TEXT DEFAULT '');`);
  sql.exec(readFileSync(new URL('../migrations/0041_partner_onboarding_ai_usage.sql',import.meta.url),'utf8'));
  sql.prepare('INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,?,?)').run(ADMIN,ADMIN,'admin','方萬隆');
  sql.prepare('INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,?,?)').run(OTHER,OTHER,'user','會員');
  const writes=[],calls=[];
  const db={withSession(){return this;},prepare(query){const statement=(args=[])=>({bind(...values){return statement(values);},async all(){assert.match(query.trim(),/^SELECT/);return {success:true,results:sql.prepare(query).all(...args)};},async run(){writes.push(query);assert.match(query,/^INSERT INTO partner_onboarding_ai_usage/);const r=sql.prepare(query).run(...args);return {success:true,meta:{changes:r.changes}};}});return statement();}};
  let output={status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(draft())}]}]},upstreamStatus=200,secret='server-only-test-key';
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    if(url==='https://api.line.me/v2/profile'){assert.equal(options.redirect,'error');return Response.json({userId:options.headers.Authorization.slice(7)});}
    if(url.startsWith('https://cloudflare-dns.com/'))return Response.json({Status:0,Answer:[{type:1,data:'93.184.216.34'}]});
    if(url.startsWith('https://www.merchant.com'))return new Response('<html><h1>測試咖啡店</h1><p>地址：台北市測試路 1 號，服務項目包含咖啡與茶飲甜點，歡迎來店。</p></html>',{headers:{'Content-Type':'text/html'}});
    assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer server-only-test-key');assert.equal(options.redirect,'error');
    return Response.json(output,{status:upstreamStatus});
  };
  const call=async(data,uid=ADMIN,path=data?'/analyze':'/cards')=>{
    const response=await handlePartnerOnboarding(new Request('https://app.com/v1/store-shop/admin/onboarding'+path,{method:data?'POST':'GET',headers:{...(uid?{Authorization:'Bearer '+uid}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),{ACTMASTER_DB:db,OPENAI_API_KEY:secret},storeInviteProfileView,fetcher);
    return {status:response.status,headers:response.headers,...await response.json()};
  };
  const card=(id,values={})=>{const row={row_id:id,scanner_user_id:ADMIN,creator_id:ADMIN,owner_user_id:ADMIN,name:'人名 '+id,company_name:'公司 '+id,...values};const keys=Object.keys(row);sql.prepare(`INSERT INTO card_contacts(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));};
  return {sql,db,writes,calls,call,card,setOutput:value=>output=value,setStatus:value=>upstreamStatus=value,noKey:()=>secret=''};
}
test('search paginates all eligible cards beyond 200 and preserves ownership boundary',async t=>{
  const f=fixture(t);for(let n=0;n<235;n++)f.card(String(n).padStart(3,'0'));
  f.card('foreign',{scanner_user_id:OTHER});f.card('self',{source_type:'self_profile'});f.card('placeholder',{source_type:'referral_placeholder'});
  f.card('legacy',{scanner_user_id:'',mobile:'0927-136-847',services:'程式設計'});
  let after='',all=[];do{const result=await f.call(null,ADMIN,'/cards?after='+after);assert.equal(result.status,200);all.push(...result.cards);after=result.next;}while(after);
  assert.equal(all.length,236);assert.equal(new Set(all.map(c=>c.rowId)).size,236);
  assert.equal((await f.call(null,ADMIN,'/cards?q=234')).cards[0].rowId,'234');
  assert.equal((await f.call(null,ADMIN,'/cards?q=0927136847')).cards[0].rowId,'legacy');
  assert.equal((await f.call(null,ADMIN,'/cards?q='+encodeURIComponent('程式設計'))).cards[0].rowId,'legacy');
  assert.equal((await f.call(null,ADMIN,'/cards?q='+encodeURIComponent("' OR 1=1 --"))).cards.length,0);
  assert.equal(f.writes.length,0);
});
test('verified admin only, no client role override, no unauthenticated model use',async t=>{
  const f=fixture(t);
  for(const data of [null,{mode:'image',base64Image:image}])for(const actor of [null,OTHER])assert.equal((await f.call(data,actor)).status,actor?403:401);
  assert.equal(f.writes.length,0);assert.equal(f.calls.some(c=>c.url.includes('openai')),false);
  assert.equal((await f.call(null,ADMIN,'/cards?uid='+OTHER)).status,400);
  assert.equal((await f.call(null,ADMIN,'/cards?q=x&q=y')).status,400);
  assert.equal((await f.call(null,ADMIN,'/cards?q='+'x'.repeat(81))).status,400);
});
test('card analysis rechecks source and returns preview only using server key',async t=>{
  const f=fixture(t);f.card('owned');f.card('foreign',{scanner_user_id:OTHER});
  assert.equal((await f.call({mode:'card',cardId:'foreign'})).status,403);
  assert.equal((await f.call({mode:'card',cardId:'missing'})).status,403);assert.equal(f.writes.length,0);
  const before=JSON.stringify(f.sql.prepare('SELECT * FROM card_contacts').all());
  const result=await f.call({mode:'card',cardId:'owned'});assert.equal(result.status,200);assert.equal(result.sourceCardRowId,'owned');assert.equal(result.fields.name,'測試咖啡店');assert.equal(result.headers.get('Cache-Control'),'no-store');
  const sent=JSON.parse(f.calls.find(c=>c.url.includes('openai')).options.body);assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(sent.tools,undefined);assert.match(sent.instructions,/不可信資料/);assert.doesNotMatch(JSON.stringify(result),/server-only/);
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM card_contacts').all()),before);assert.equal(f.writes.length,1);
});
test('image input validates format, signature and fixed allowed keys',async t=>{
  const f=fixture(t);
  for(const data of [{mode:'image',base64Image:'https://image.com/a.jpg'},{mode:'image',base64Image:'data:image/png;base64,eA=='},{mode:'image',base64Image:image,model:'evil'},{mode:'card',cardId:'x',clientOpenAIKey:'evil'}])assert.equal((await f.call(data)).status,400);
  assert.equal(f.writes.length,0);
  assert.equal((await f.call({mode:'image',base64Image:image})).status,200);
  const sent=JSON.parse(f.calls.find(c=>c.url.includes('openai')).options.body);assert.equal(sent.input[0].content[0].type,'input_image');
});
test('website uses bounded public HTML and final URL without auth forwarding',async t=>{
  const f=fixture(t);const result=await f.call({mode:'website',url:'https://www.merchant.com/'});assert.equal(result.status,200);assert.equal(result.fields.websiteUrl,'https://www.merchant.com/');
  const page=f.calls.find(c=>c.url.startsWith('https://www.merchant.com'));assert.equal(page.options.headers.Authorization,undefined);assert.equal(page.options.credentials,'omit');
});
test('server key absence and quotas fail closed; aliases share canonical quota',async t=>{
  const f=fixture(t);f.noKey();assert.equal((await f.call({mode:'image',base64Image:image})).status,503);assert.equal(f.writes.length,0);
  const g=fixture(t);assert.equal((await g.call({mode:'image',base64Image:image})).status,200);assert.equal((await g.call({mode:'image',base64Image:image})).status,429);
  const alias='U'+'3'.repeat(32);g.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(alias,ADMIN);
  assert.equal((await g.call({mode:'image',base64Image:image},alias)).status,429);
  assert.equal(g.sql.prepare('SELECT count(*) n FROM partner_onboarding_ai_usage').get().n,1);
  g.sql.prepare("UPDATE partner_onboarding_ai_usage SET next_allowed_at=0,attempts=60").run();assert.equal((await g.call({mode:'image',base64Image:image})).status,429);
  g.sql.prepare("UPDATE partner_onboarding_ai_usage SET usage_day='2000-01-01',next_allowed_at=0").run();assert.equal((await g.call({mode:'image',base64Image:image})).status,200);
});
for(const [label,output]of [['incomplete',{status:'incomplete'}],['invalid-json',{status:'completed',output:[{content:[{type:'output_text',text:'oops'}]}]}],['unauthorized-fields',{status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...draft(),role:'admin'})}]}]}]])test('rejects AI '+label,async t=>{const f=fixture(t);f.setOutput(output);assert.equal((await f.call({mode:'image',base64Image:image})).status,502);});
test('upstream errors are redacted',async t=>{const f=fixture(t);f.setStatus(500);f.setOutput({error:'secret details'});const result=await f.call({mode:'image',base64Image:image});assert.equal(result.status,503);assert.doesNotMatch(result.error,/secret/);});
test('unsafe website targets and encoded IP forms are rejected before network',()=>{
  for(const url of ['http://www.merchant.com','https://127.0.0.1','https://2130706433','https://0x7f000001','https://[::1]','https://user:pw@www.merchant.com','https://www.merchant.com:8443','https://a.local','https://metadata.google.internal','file:///etc/passwd','https://localhost.'])assert.throws(()=>publicWebsiteUrl(url));
  for(const ip of ['127.0.0.1','10.1.1.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','198.18.0.1','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2002:7f00:1::','2001:db8::1'])assert.equal(publicIp(ip),false,ip);
  assert.equal(publicIp('93.184.216.34'),true);assert.equal(publicIp('2606:4700::1111'),true);
});
test('private DNS, redirect to private host, non-HTML and oversized pages fail closed',async()=>{
  let targets=0;
  await assert.rejects(readWebsite('https://www.merchant.com',async()=>Response.json({Status:0,Answer:[{type:1,data:'10.1.1.1'}]})),/公開網站/);
  const dns=()=>Response.json({Status:0,Answer:[{type:1,data:'93.184.216.34'}]});
  for(const response of [new Response('',{status:302,headers:{Location:'https://127.0.0.1/admin'}}),new Response('bad',{headers:{'Content-Type':'application/pdf'}}),new Response('x'.repeat(524289),{headers:{'Content-Type':'text/html'}})]){
    await assert.rejects(readWebsite('https://www.merchant.com',async url=>{if(url.includes('dns-query'))return dns();targets++;return response;}));
  }
  assert.equal(targets,3);
});
test('normalizes strict output without dangerous URLs, and strips executable website content',()=>{
  const value=normalizeDraft(draft({websiteUrl:'javascript:alert(1)',contactEmail:'not email'}));assert.equal(value.fields.websiteUrl,'');assert.equal(value.fields.contactEmail,'');
  assert.throws(()=>normalizeDraft(draft({role:'admin'})));assert.throws(()=>normalizeDraft(draft({name:'x'.repeat(161)})));assert.throws(()=>normalizeDraft(draft({category:'未知'})));
  assert.equal(htmlSource('<script>steal()</script><style>hidden</style><h1>咖啡 &amp; 茶</h1>'),'咖啡 & 茶');
});
test('payload size is enforced on streamed body and routing is isolated',async()=>{
  await assert.rejects(boundedText(new Response('123456'),3),/資料過大/);
  assert.equal(await handlePartnerOnboarding(new Request('https://app.com/unrelated'),{}),null);
  assert.equal((await handlePartnerOnboarding(new Request('https://app.com/v1/store-shop/admin/onboarding/analyze',{method:'OPTIONS'}),{})).status,204);
});
test('revalidates every redirect DNS and supports safe HTTPS redirect',async()=>{
  let pageReads=0;
  const mock=privateSecond=>async url=>{
    if(url.includes('dns-query'))return Response.json({Status:0,Answer:[{type:1,data:privateSecond&&url.includes('second.com')?'192.168.0.1':'93.184.216.34'}]});
    pageReads++;
    return url.includes('merchant.com')?new Response('',{status:302,headers:{Location:'https://second.com/'}}):new Response('<p>Public company information with address and phone for extracting a shop profile.</p>',{headers:{'Content-Type':'text/html'}});
  };
  await assert.rejects(readWebsite('https://www.merchant.com',mock(true)),/公開網站/);assert.equal(pageReads,1);
  pageReads=0;const page=await readWebsite('https://www.merchant.com',mock(false));assert.equal(page.url,'https://second.com/');assert.equal(pageReads,2);
});
test('private source with blank scanner matches existing save rules and claimed self cards remain excluded',async t=>{
  const f=fixture(t);f.card('mine',{scanner_user_id:'',creator_id:ADMIN,owner_user_id:OTHER});f.card('not-mine',{scanner_user_id:OTHER,creator_id:ADMIN});f.card('claimed',{source_type:'self_profile',scanner_user_id:ADMIN,owner_user_id:OTHER});
  const page=await searchSourceCards(f.db,ADMIN);assert.deepEqual(page.cards.map(c=>c.rowId),['mine']);
});
test('stream/body fetch timeout is safe, without writes to business tables',async t=>{
  const f=fixture(t);
  const response=await handlePartnerOnboarding(new Request('https://app.com/v1/store-shop/admin/onboarding/analyze',{method:'POST',headers:{Authorization:'Bearer '+ADMIN,'Content-Type':'application/json'},body:JSON.stringify({mode:'image',base64Image:image})}),{ACTMASTER_DB:f.db,OPENAI_API_KEY:'test'},storeInviteProfileView,async url=>{if(url.includes('api.line.me'))return Response.json({userId:ADMIN});throw new DOMException('internal secret','TimeoutError');});
  assert.equal(response.status,503);assert.match((await response.json()).error,/逾時/);assert.equal(f.writes.length,1);
});
