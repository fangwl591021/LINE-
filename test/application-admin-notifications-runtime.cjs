// Actual local Workerd/D1; every LINE request is synthetic and production is unreachable.
const assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
const {Miniflare}=require(process.env.LISTING_MINIFLARE_MODULE),{buildSync}=require(process.env.LISTING_ESBUILD_MODULE);
(async()=>{
 const code=`import {processApplicationAdminNotifications} from './worker/application-admin-notifications.mjs';
 const accepted=new Map();
 export default {async fetch(request,env){
  const input=await request.json(),pushes=[];let physical=0,fired=false,queryCount=0;
  const raw=env.ACTMASTER_DB;
  const wrap=(statement,sql)=>({raw:statement,bind(...args){return wrap(statement.bind(...args),sql);},async first(){queryCount++;return statement.first();},async all(){queryCount++;return statement.all();},async run(){
   queryCount++;
   if((input.revoke||input.aliasCollision)&&!fired&&sql.includes('SET attempts=attempts+1')){fired=true;queryCount++;if(input.revoke)await raw.prepare("UPDATE users SET role='user' WHERE row_id='a'").run();else await raw.prepare("INSERT INTO users(row_id,line_id,role,point_line_id) SELECT 'conflict','U'||replace(hex(zeroblob(16)),'0','b'),'user',line_id FROM users WHERE row_id='a'").run();}
   return statement.run();}});
  const db={prepare(sql){return wrap(raw.prepare(sql),sql);},batch(statements){queryCount+=statements.length;return raw.batch(statements.map(s=>s.raw));},withSession(){return this;}};
  await processApplicationAdminNotifications({...env,ACTMASTER_DB:db},{now:input.now,profileMapper:row=>({role:row.role==='admin'?'admin':'user'}),hardAdminIds:[],fetcher:async(url,options)=>{
   if(url!=='https://api.line.me/v2/bot/message/push'||options.redirect!=='manual')throw Error('Unexpected network');
   const key=options.headers['X-Line-Retry-Key'];pushes.push({key,body:options.body});
   if(accepted.has(key)){if(accepted.get(key)!==options.body)throw Error('Changed retry');return new Response('',{status:409,headers:{'x-line-accepted-request-id':'synthetic'}});}
   accepted.set(key,options.body);physical++;if(input.timeout)throw Error('Accepted but response lost');return new Response('',{status:200});
  }});
  return Response.json({pushes,physical,queryCount});
 }};`;
 const bundle=buildSync({stdin:{contents:code,resolveDir:process.cwd(),sourcefile:'application-notice-runtime.mjs'},bundle:true,format:'esm',platform:'browser',write:false});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-04-23',d1Databases:{ACTMASTER_DB:'application-notices-isolated'},bindings:{LINE_CHANNEL_ACCESS_TOKEN:'synthetic-token'},port:0});
 try{
  const db=await mf.getD1Database('ACTMASTER_DB'),A='U'+'a'.repeat(32),now=Math.floor(Date.now()/1000);
  await db.exec("CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT '');CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);CREATE TABLE protected_points(points INTEGER);INSERT INTO protected_points VALUES(12345);");
  await db.prepare("INSERT INTO users(row_id,line_id,role) VALUES('a',?,'admin')").bind(A).run();
  for(const kind of ['reward','discount','partner','full'])await db.exec(`CREATE TABLE ${kind}_applications(id TEXT PRIMARY KEY,owner_uid TEXT,unit_name TEXT,applicant_name TEXT,signed_at TEXT,snapshot_json TEXT);`);
  // Preserve trigger bodies when executing the migration one statement at a time.
  const migration=readFileSync('migrations/0078_application_admin_notifications.sql','utf8').replace(/--[^\n]*/g,'');
  const statements=migration.match(/CREATE TRIGGER[\s\S]*?END;|CREATE (?:TABLE|UNIQUE INDEX|INDEX)[\s\S]*?;/g);
  for(const sql of statements)await db.exec(sql.replace(/\s+/g,' ').trim());
  const sign=async(kind)=>{const id=crypto.randomUUID();await db.prepare(`INSERT INTO ${kind}_applications VALUES(?,?,?,?,?,?)`).bind(id,'synthetic-owner','synthetic-unit','synthetic-signer',new Date(now*1000).toISOString(),'private signature').run();await db.prepare('UPDATE application_admin_notice_events SET created_at=? WHERE kind=? AND application_id=?').bind(now-60,kind,id).run();return id;};
  const run=async(extra={})=>{const r=await mf.dispatchFetch('https://isolated.test/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({now,...extra})});assert.equal(r.status,200);return r.json();};
  await sign('reward');await sign('full');
  const concurrent=await Promise.all([run(),run(),run()]);assert.equal(concurrent.reduce((n,r)=>n+r.pushes.length,0),1);assert.equal(concurrent.reduce((n,r)=>n+r.physical,0),1);
  assert(concurrent.every(result=>result.queryCount<50));
  const push=concurrent.flatMap(r=>r.pushes)[0],body=JSON.parse(push.body);assert.equal(body.messages.length,1);assert.equal(body.messages[0].contents.contents.length,2);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM application_admin_notice_batches').first()).n,1);
  await sign('partner');const lost=await run({timeout:true,now:now+60});assert.equal(lost.physical,1);
  const retried=await run({now:now+130});assert.equal(retried.physical,0);assert.equal(retried.pushes[0].key,lost.pushes[0].key);assert.equal(retried.pushes[0].body,lost.pushes[0].body);
  await sign('discount');const revoked=await run({now:now+200,revoke:true});assert.equal(revoked.pushes.length,0);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM application_admin_notice_batches WHERE status='cancelled'").first()).n,1);
  assert.equal((await db.prepare('SELECT points FROM protected_points').first()).points,12345);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM discount_applications').first()).n,1);
  await db.prepare("UPDATE users SET role='admin' WHERE row_id='a'").run();await sign('full');const conflicted=await run({now:now+260,aliasCollision:true});assert.equal(conflicted.pushes.length,0);assert(conflicted.queryCount<50);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM application_admin_notice_batches WHERE status='cancelled'").first()).n,2);
  console.log('WORKERD PASS: trigger enqueue; concurrent cron one carousel; timeout identical retry key/body accepted once; atomic admin revocation and cross-row alias collision send nothing; exact admin-page resolver; bounded under 50 queries; signed applications and protected points preserved; isolated D1 and synthetic LINE only');
 }finally{await mf.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
