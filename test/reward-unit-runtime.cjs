const assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
const {Miniflare}=require(process.env.LISTING_MINIFLARE_MODULE),{buildSync}=require(process.env.LISTING_ESBUILD_MODULE);
(async()=>{
  const bundle=buildSync({entryPoints:['test/fixtures/reward-unit-runtime.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
  const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-04-23',compatibilityFlags:[],d1Databases:{ACTMASTER_DB:'reward-units-isolated'},port:0});
  try{
    const db=await mf.getD1Database('ACTMASTER_DB'),a='U'+'a'.repeat(32),b='U'+'b'.repeat(32);
    await db.exec("CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT ''); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);");
    await db.prepare('INSERT INTO users(row_id,line_id,role) VALUES(?,?,?),(?,?,?)').bind(a,a,'admin',b,b,'reward').run();
    for(const file of ['0058_store_listing_reviews.sql','0066_reward_unit_publications.sql'])for(const stmt of readFileSync('migrations/'+file,'utf8').replace(/--[^\n]*/g,'').split(';').map(x=>x.trim()).filter(Boolean))await db.exec(stmt.replace(/\s+/g,' ')+';');
    const call=async(path='',data,mode='allow')=>{const r=await mf.dispatchFetch('https://app.test/v1/reward-units'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json','X-Fixture-Mode':mode},body:data?JSON.stringify(data):undefined});return {http:r.status,...await r.json()};};
    const p={target_uid:b,version:0,request_key:crypto.randomUUID(),confirmed_public:true,unit:{name:'執行環境合成公司',description:'提供生活與活動合作服務，請洽單位確認資格。',image_url:'',phone:'0223456789',address:'合成路1號',website_url:'',reward_terms:'指定活動確認資格後贈點。',status:'active'}};
    const created=await call('/admin',p);assert.equal(created.http,200,JSON.stringify(created));assert.equal((await call()).units.length,1);assert.equal((await call('/admin',p)).replayed,true);
    assert.equal((await db.prepare('SELECT count(*) n FROM reward_unit_publication_audit').first()).n,1);
    p.version=1;p.request_key=crypto.randomUUID();p.unit.description='修改的公司介紹，需重新審核後才公開。';await db.exec('DELETE FROM store_listing_review_usage;');assert.equal((await call('/admin',p,'manual')).code,'LISTING_REVIEW_REQUIRED');assert.equal((await call()).units[0].description,'提供生活與活動合作服務，請洽單位確認資格。');
    await db.prepare("UPDATE users SET role='user' WHERE line_id=?").bind(b).run();assert.equal((await call()).units.length,0);assert.equal((await call('?id='+created.id)).http,404);
    console.log('WORKERD PASS: 2026-04-23 flags=[], actual D1 primary session/batch, AI review, publish/read/retry/audit/manual/revocation, no live services');
  }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
