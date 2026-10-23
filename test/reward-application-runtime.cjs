const assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
const {Miniflare}=require(process.env.LISTING_MINIFLARE_MODULE),{buildSync}=require(process.env.LISTING_ESBUILD_MODULE);
(async()=>{
 const bundle=buildSync({entryPoints:['test/fixtures/reward-application-runtime.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-04-23',compatibilityFlags:[],d1Databases:{ACTMASTER_DB:'reward-application-isolated'},port:0});
 try{
  const db=await mf.getD1Database('ACTMASTER_DB'),a='U'+'a'.repeat(32),b='U'+'b'.repeat(32);
  await db.exec("CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',referrer_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT ''); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);");
  await db.prepare('INSERT INTO users(row_id,line_id,role) VALUES(?,?,?),(?,?,?)').bind(a,a,'admin',b,b,'user').run();
  for(const file of ['0068_reward_applications.sql','0069_discount_applications.sql'])for(const stmt of readFileSync('migrations/'+file,'utf8').split(';').map(x=>x.trim()).filter(Boolean))await db.exec(stmt.replace(/\s+/g,' ')+';');
  for(const kind of ['reward','discount']){
  const call=async(path='',data,token='user')=>{const r=await mf.dispatchFetch('https://test/v1/'+kind+'-applications'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {http:r.status,...await r.json()};};
  const fields={unit_name:'合成執行環境單位',applicant_name:'合成人員',phone:'0912345678',...(kind==='discount'?{services:'合成生活用品',business_types:['品牌商品']}:{unit_types:['企業'],recipients:['員工'],scenarios:['員工福利']})};
  const preview=await call('/preview',{fields});assert.equal(preview.http,200,JSON.stringify(preview));
  const signing={preview_id:preview.preview_id,strokes:[Array.from({length:15},(_,i)=>[100+i*30,100+i%2*90])],electronic:true,terms:true,authority:true,...(kind==='discount'?{discount:true,publication:true}:{})};
  const results=await Promise.all(Array.from({length:5},()=>call('/submit',signing)));for(const r of results)assert.equal(r.http,200,JSON.stringify(r));
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+kind+'_applications').first()).n,1);
  const reviews=await Promise.all(['accepted','rejected'].map(decision=>call('/review',{id:preview.preview_id,decision,note:'合成並行審核'},'admin')));
  assert.deepEqual(reviews.map(r=>r.http).sort(),[200,409]);assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+kind+'_application_reviews').first()).n,1);
  assert.equal((await db.prepare('SELECT role FROM users WHERE line_id=?').bind(b).first()).role,'user');
  assert.equal((await call('?id='+preview.preview_id,undefined,'admin')).http,404);
  console.log('WORKERD PASS '+kind+': actual D1, preview/signing, five concurrent identical submits, two competing reviews, private access, no live services');
  }
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
