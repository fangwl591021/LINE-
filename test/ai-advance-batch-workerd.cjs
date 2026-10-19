// Local Workerd + D1 only; fake LINE/AI are in the fixture entry.
const assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{spawn}=require('node:child_process');
const {Miniflare}=require(process.env.LISTING_MINIFLARE_MODULE),{buildSync}=require(process.env.LISTING_ESBUILD_MODULE);
(async()=>{
 const bundle=buildSync({entryPoints:['test/fixtures/ai-advance-runtime.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-04-23',compatibilityFlags:[],d1Databases:{ACTMASTER_DB:'ai-reminder-batch-isolated'},port:0});
 try{
  const db=await mf.getD1Database('ACTMASTER_DB');
  for(const file of ['test/fixtures/ai-advance-runtime.sql','migrations/0054_ai_advance_tasks.sql','migrations/0061_ai_advance_manual_reminders.sql','migrations/0065_ai_advance_reminder_batches.sql']){
   for(const sql of readFileSync(file,'utf8').replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.exec(sql.replace(/\s+/g,' ')+';');
  }
  // Run the existing real-HTTP runtime checks against this isolated binding.
  const url=String(await mf.ready),child=spawn(process.execPath,['test/ai-advance-runtime.cjs'],{env:{...process.env,AI_ADVANCE_RUNTIME_URL:url.replace(/\/$/,'')},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Runtime test timeout'));},20000);child.once('error',reject);child.once('exit',c=>{clearTimeout(timer);resolve(c);});});
  assert.equal(code,0,output);console.log(output.trim());
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
