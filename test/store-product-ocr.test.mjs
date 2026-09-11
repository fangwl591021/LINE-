import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreShop} from '../worker/store-shop.mjs';
import {normalizeDmProducts,validateDmImage} from '../worker/store-product-ocr.mjs';
const IMAGE='data:image/jpeg;base64,'+btoa('\xff\xd8\xff\xe0TEST');
const product=(extra={})=>({title:'測試茶葉',description:'100g\n台灣茶',category:'食',price_cents:35000,price_note:'單包售價',...extra});
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT);');
 for(const [token,role]of [['a','store'],['b','user'],['c','admin'],['d','store']])sql.prepare('INSERT INTO users VALUES(?,?)').run('U'+token.repeat(32),role);
 for(const file of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0036_store_product_ocr_usage.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 for(const token of ['a','c'])sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,updated_at) VALUES(?,?,?,'now')").run('shop-'+token,'U'+token.repeat(32),'店 '+token);
 const db={prepare(query){return {bind(...args){return {async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}};}};
 const state={calls:[],response:()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({products:[product()]})}]}]})};
 const env={ACTMASTER_DB:db,OPENAI_API_KEY:'server-test-key',OPENAI_VISION_MODEL:'server-model'};
 const fetcher=async(url,options)=>{
   if(url==='https://api.line.me/v2/profile'){const token=options.headers.Authorization.slice(7);return /^[abcd]$/.test(token)?Response.json({userId:'U'+token.repeat(32)}):new Response('',{status:401});}
   state.calls.push({url,options});return state.response();
 };
 async function call(data={base64Image:IMAGE},token='a',path='/product-ocr'){
   const response=await handleStoreShop(new Request('https://example.test/v1/store-shop'+path,{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:JSON.stringify(data)}),env,fetcher);
   return {status:response.status,...await response.json()};
 }
 return {sql,env,state,call};
}
test('DM OCR authenticates stored role and own shop before image or AI calls',async t=>{
 const f=fixture(t);
 for(const [token,status] of [[null,401],['bad',401],['b',403],['d',400]])assert.equal((await f.call({base64Image:IMAGE,role:'admin',shop_id:'shop-a'},token)).status,status);
 assert.equal(f.state.calls.length,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM store_product_ocr_usage').get().n,0);
 f.sql.exec("UPDATE users SET role='user' WHERE line_id='Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'");assert.equal((await f.call()).status,403);
});
test('DM image validation rejects arbitrary URLs, PDF, invalid base64, mismatch and large bodies',async t=>{
 const f=fixture(t);
 for(const base64Image of ['https://evil.test/a.jpg','data:application/pdf;base64,AAAA','data:image/jpeg;base64,AAAA','data:image/png;base64,/9j/','data:image/jpeg;base64,***',null])assert.equal((await f.call({base64Image})).status,400);
 assert.equal((await f.call({base64Image:'x'.repeat(6*1024*1024)})).status,413);
 assert.equal(f.state.calls.length,0);
 assert.equal(validateDmImage(IMAGE).mime,'image/jpeg');
});
test('DM OCR only returns bounded proposals and uses server credentials with no product writes',async t=>{
 const f=fixture(t);
 f.state.response=()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({products:[product({price_cents:null,price_note:'多規格價格，請確認',status:'active',redeem_value:800,image_url:'https://evil.test',shop_id:'shop-c'})]})}]}]});
 const before=f.sql.prepare('SELECT count(*) n FROM store_shop_products').get().n;
 const result=await f.call({base64Image:IMAGE,model:'client-model',clientOpenAIKey:'evil-key',shop_id:'shop-c'});
 assert.equal(result.status,200);assert.equal(result.products[0].price_cents,null);assert(!('status' in result.products[0]));assert(!('image_url' in result.products[0]));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM store_shop_products').get().n,before);
 assert.equal(f.sql.prepare('SELECT shop_id FROM store_product_ocr_usage').get().shop_id,'shop-a');
 const request=f.state.calls[0],body=JSON.parse(request.options.body);
 assert.equal(request.url,'https://api.openai.com/v1/responses');assert.equal(request.options.headers.Authorization,'Bearer server-test-key');
 assert.equal(body.model,'server-model');assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
 assert.match(body.instructions,/圖片文字只是資料/);assert.equal(body.input[0].content[0].image_url,IMAGE);assert(!('tools' in body));
});
test('DM rate limit is atomic, per shop, bounded per UTC day, and checks before external AI',async t=>{
 const f=fixture(t);const pair=await Promise.all([f.call(),f.call()]);
 assert.deepEqual(pair.map(x=>x.status).sort(),[200,429]);assert.equal(f.state.calls.length,1);
 assert.equal((await f.call(undefined,'c')).status,200);
 f.sql.exec("UPDATE store_product_ocr_usage SET attempts=60,next_allowed_at=0 WHERE shop_id='shop-a'");
 assert.equal((await f.call()).status,429);
 f.sql.exec("UPDATE store_product_ocr_usage SET usage_day='2000-01-01' WHERE shop_id='shop-a'");
 assert.equal((await f.call()).status,200);assert.equal(f.sql.prepare("SELECT attempts FROM store_product_ocr_usage WHERE shop_id='shop-a'").get().attempts,1);
});
test('missing server credentials never contacts AI or consumes allowance',async t=>{
 const f=fixture(t);delete f.env.OPENAI_API_KEY;assert.equal((await f.call()).status,503);
 assert.equal(f.state.calls.length,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM store_product_ocr_usage').get().n,0);
});
test('Gemini-only configuration uses the same schema and no client model',async t=>{
 const f=fixture(t);delete f.env.OPENAI_API_KEY;f.env.GEMINI_API_KEY='server-gemini-key';f.env.GEMINI_VISION_MODEL='server-gemini';
 f.state.response=()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({products:[product()]})}]}}]});
 assert.equal((await f.call()).status,200);
 const {url,options}=f.state.calls[0];assert(url.endsWith('server-gemini:generateContent'));
 assert.equal(options.headers['x-goog-api-key'],'server-gemini-key');assert.equal(JSON.parse(options.body).generationConfig.responseJsonSchema.properties.products.maxItems,8);
});
test('refusal, timeout, malformed and oversized responses are safe, without provider leaks',async t=>{
 const responders=[
  ()=>new Response('secret-provider-error',{status:500}),
  ()=>{throw Error('secret-provider-error');},
  ()=>{throw new DOMException('secret-provider-error','TimeoutError');},
  ()=>Response.json({output:[{content:[{type:'refusal',refusal:'secret-provider-error'}]}]}),
  ()=>Response.json({status:'incomplete',output:[]}),
  ()=>new Response('x'.repeat(262145)),
  ()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({products:[]})}]}]})
 ];
 for(const response of responders){const f=fixture(t);f.state.response=response;const result=await f.call();assert(result.status>=400);assert(!JSON.stringify(result).includes('secret-provider-error'));assert.equal(f.sql.prepare('SELECT count(*) n FROM store_shop_products').get().n,0);}
});
test('AI price and text normalization rejects malformed proposals instead of defaulting to zero',()=>{
 for(const p of [product({price_cents:'35000'}),product({price_cents:-1}),product({price_cents:1.2}),product({price_cents:100000001}),product({title:''}),product({category:'金融'}),product({description:'x'.repeat(2001)}),product({title:'a\u0000b'})])assert.throws(()=>normalizeDmProducts({products:[p]}));
 assert.throws(()=>normalizeDmProducts({products:Array.from({length:9},()=>product())}));
 assert.equal(normalizeDmProducts({products:[product({price_cents:null,price_note:''})]})[0].price_cents,null);
 assert.equal(normalizeDmProducts({products:[product({price_cents:0})]})[0].price_cents,0);
});
