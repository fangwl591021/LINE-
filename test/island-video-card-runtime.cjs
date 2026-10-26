// Real Workerd/D1 concurrency; synthetic identities, zero real LINE calls.
const assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
const {Miniflare}=require(process.env.LISTING_MINIFLARE_MODULE),{buildSync}=require(process.env.LISTING_ESBUILD_MODULE);
(async()=>{
 const code=`import {handleIslandVideoCard} from './worker/island-video-card.mjs';
 export default {async fetch(request,env){return await handleIslandVideoCard(request,env,async(url,options)=>{
  if(url!=='https://api.line.me/v2/profile'||options.redirect!=='manual')throw Error('Unexpected network');
  const key=options.headers.Authorization.slice(7),id={a:'U'+ 'a'.repeat(32),b:'U'+'b'.repeat(32),old:'U'+'1'.repeat(32),new:'U'+'2'.repeat(32)}[key];
  return id?Response.json({userId:id}):new Response('',{status:401});
 })||new Response('',{status:404});}};`;
 const bundle=buildSync({stdin:{contents:code,resolveDir:process.cwd(),sourcefile:'island-copy-runtime.mjs'},bundle:true,format:'esm',platform:'browser',write:false});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-04-23',d1Databases:{ACTMASTER_DB:'island-video-copy-isolated'},port:0});
 try{
  const db=await mf.getD1Database('ACTMASTER_DB'),A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),OLD='U'+'1'.repeat(32),NEW='U'+'2'.repeat(32);
  await db.exec("CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,role TEXT,name TEXT); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT); CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,custom_config TEXT);");
  await db.prepare("INSERT INTO users VALUES('a',?,'user','synthetic A'),('b',?,'store','synthetic B')").bind(A,B).run();
  await db.prepare("INSERT INTO card_contacts VALUES('original','original private video')").run();
  for(const stmt of readFileSync('migrations/0076_island_video_card_copies.sql','utf8').split(';').map(x=>x.replace(/--[^\n]*/g,'').trim()).filter(Boolean))await db.exec(stmt.replace(/\s+/g,' ')+';');
  const call=async(data,token='a')=>{const r=await mf.dispatchFetch('https://test/v1/island-video-card',{method:data?'PUT':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {status:r.status,...await r.json()};};
  const payload=(revision,title='synthetic island')=>({title,desc:'Synthetic campaign copy only',revision,requestKey:crypto.randomUUID()});
  const repeated=payload(0),responses=await Promise.all(Array.from({length:6},()=>call(repeated)));for(const r of responses)assert.equal(r.status,200,JSON.stringify(r));
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM island_video_card_copies').first()).n,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM island_video_card_copy_commands').first()).n,1);
  const race=await Promise.all([call(payload(1,'first tab')),call(payload(1,'second tab'))]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal((await call()).card.revision,2);
  assert.equal((await call(undefined,'b')).card.revision,0);
  await db.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").bind(OLD,NEW).run();
  const aliases=await Promise.all([call(payload(0,'old login'),'old'),call(payload(0,'new login'),'new')]);assert.deepEqual(aliases.map(r=>r.status).sort(),[200,409]);
  assert.deepEqual((await call(undefined,'old')).card,(await call(undefined,'new')).card);assert.equal((await db.prepare('SELECT COUNT(*) n FROM island_video_card_copies WHERE owner_uid IN (?,?)').bind(OLD,NEW).first()).n,1);
  assert.equal((await db.prepare("SELECT custom_config FROM card_contacts WHERE row_id='original'").first()).custom_config,'original private video');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').first()).n,2);
  console.log('WORKERD PASS: six identical saves once; two tabs one CAS winner; A/B isolation; linked guest logins one canonical copy; original cards and users unchanged; isolated D1 only');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
