// Actual Workerd/D1, synthetic identities and clauses; zero real LINE or production calls.
const assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{createHash}=require('node:crypto');
const {Miniflare}=require(process.env.LISTING_MINIFLARE_MODULE),{buildSync}=require(process.env.LISTING_ESBUILD_MODULE);
(async()=>{
 const {partnerFields,fullFields,signing,syntheticTerms}=await import('./fixtures/hand-sign-applications.mjs');
 const {handSignTemplates}=await import('../worker/hand-sign-application-definition.mjs');
 const bundle=buildSync({entryPoints:['test/fixtures/reward-application-runtime.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-04-23',compatibilityFlags:[],d1Databases:{ACTMASTER_DB:'hand-sign-application-isolated'},port:0});
 try{
  const db=await mf.getD1Database('ACTMASTER_DB'),a='U'+'a'.repeat(32),b='U'+'b'.repeat(32);
  await db.exec("CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',referrer_id TEXT DEFAULT '',member_number TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT ''); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);");
  await db.prepare('INSERT INTO users(row_id,line_id,role) VALUES(?,?,?),(?,?,?)').bind(a,a,'admin',b,b,'user').run();
  for(const file of ['0068_reward_applications.sql','0069_discount_applications.sql','0077_hand_sign_contracts.sql']){
   const sql=readFileSync('migrations/'+file,'utf8').replace(/--[^\n]*/g,'');
   for(const statement of sql.split(';').map(value=>value.trim()).filter(Boolean))await db.exec(statement.replace(/\s+/g,' ')+';');
  }
  for(const kind of ['partner','full']){
   const pin=handSignTemplates[kind],json=JSON.stringify(syntheticTerms(kind));
   await db.prepare('INSERT INTO signing_application_templates VALUES(?,?,?,?,?,?,1)').bind(kind,pin.version,pin.title,json,pin.sourceSha256,createHash('sha256').update(json).digest('hex')).run();
   const call=async(path='',data,token='user')=>{const response=await mf.dispatchFetch('https://test/v1/'+kind+'-applications'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {http:response.status,...await response.json()};};
   const template=await call('/template');assert.equal(template.http,200);assert.deepEqual(template.terms,syntheticTerms(kind));
   const fields=kind==='partner'?partnerFields():fullFields(),preview=await call('/preview',{fields});assert.equal(preview.http,200,JSON.stringify(preview));
   const payload=signing(preview.preview_id,kind),results=await Promise.all(Array.from({length:6},()=>call('/submit',payload)));
   for(const result of results)assert.equal(result.http,200,JSON.stringify(result));
   assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+kind+'_applications').first()).n,1);
   const reviews=await Promise.all(['accepted','rejected'].map(decision=>call('/review',{id:preview.preview_id,decision,note:'合成並行審核'},'admin')));assert.deepEqual(reviews.map(result=>result.http).sort(),[200,409]);
   const unsigned=await call('/preview',{fields});await db.prepare('UPDATE signing_application_templates SET active=0 WHERE kind=?').bind(kind).run();
   assert.equal((await call('/submit',signing(unsigned.preview_id,kind))).http,503);assert.equal((await call('?id='+preview.preview_id)).http,200);
   assert.equal((await call('?id='+preview.preview_id,undefined,'admin')).http,404);assert.equal((await db.prepare('SELECT role FROM users WHERE line_id=?').bind(b).first()).role,'user');
   console.log('WORKERD PASS '+kind+': authenticated private template, full immutable preview/signing, six concurrent submits once, competing reviews, template revocation, historical private read, no authority changes');
  }
 }finally{await mf.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
