// Local workerd + D1; LINE, mother and all identities are synthetic.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),runtime='C:/Users/User/AppData/Local/npm-cache/_npx/ab1883e807df3f8e/node_modules/';
const {Miniflare}=require(runtime+'miniflare'),esbuild=require(runtime+'esbuild');
const A='U'+'1'.repeat(32),ADMIN='U'+'2'.repeat(32);
const built=await esbuild.build({stdin:{resolveDir:fileURLToPath(new URL('.',import.meta.url)),contents:`
import {supplementCheckinMallCards,handleCheckinMall} from '../worker/checkin-mall-card.mjs';
let pushes=0;
const A=${JSON.stringify(A)},ADMIN=${JSON.stringify(ADMIN)};
const fake=async(url,options)=>{
 if(url.includes('/oauth2/v2.1/verify?'))return Response.json({client_id:'1660923784',expires_in:1000});
 if(url==='https://api.line.me/v2/profile')return Response.json({userId:options.headers.Authorization.slice(7),displayName:'合成會員'});
 if(url==='https://api.line.me/v2/bot/message/push'){pushes++;return Response.json({});}
 throw Error('External calls forbidden');
};
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/test-push'){
  const e={type:'message',source:{type:'user',userId:A},timestamp:Date.now(),webhookEventId:'runtime-event',message:{type:'text',text:'會員打卡'}};
  await supplementCheckinMallCards([e],env,{success:true},{read:async()=>({identity:A,balance:12857})},fake);
  return Response.json({pushes});
 }
 if(path==='/test-state')return Response.json({pushes});
 return (await handleCheckinMall(request,env,row=>({role:row.role}),fake))||new Response('Not found',{status:404});
}};`},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const mf=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-04-23',d1Databases:{ACTMASTER_DB:'checkin-mall-local-only'},bindings:{CHECKIN_MALL_CARD_ENABLED:'true',LINE_CHANNEL_ACCESS_TOKEN:'synthetic-key'}});
try{
  const db=await mf.getD1Database('ACTMASTER_DB');
  for(const query of readFileSync(new URL('../migrations/0063_checkin_mall_cards.sql',import.meta.url),'utf8').replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(query).run();
  await db.prepare("CREATE TABLE users(row_id TEXT,line_id TEXT,legacy_line_id TEXT,point_line_id TEXT,role TEXT,name TEXT,phone TEXT)").run();
  await db.prepare('CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT)').run();
  await db.prepare("INSERT INTO users VALUES(?,?,'','','admin','合成管理員','')").bind(ADMIN,ADMIN).run();
  await Promise.all(Array.from({length:8},()=>mf.dispatchFetch('https://local.test/test-push',{method:'POST'})));
  assert.equal((await (await mf.dispatchFetch('https://local.test/test-state')).json()).pushes,1);
  const card=await db.prepare('SELECT id,state FROM checkin_mall_cards').first();assert.equal(card.state,'accepted');
  const options={method:'POST',headers:{Authorization:'Bearer '+A,'Content-Type':'application/json'},body:JSON.stringify({cardId:card.id,action:'mall'})};
  const entries=await Promise.all(Array.from({length:8},()=>mf.dispatchFetch('https://local.test/v1/checkin-mall/entry',options)));
  assert(entries.every(r=>r.status===200));assert.equal((await db.prepare('SELECT COUNT(*) n FROM checkin_mall_clicks').first()).n,1);
  assert.equal((await mf.dispatchFetch('https://local.test/v1/checkin-mall/report')).status,401);
  assert.equal((await mf.dispatchFetch('https://local.test/v1/checkin-mall/report',{headers:{Authorization:'Bearer '+A}})).status,403);
  const report=await (await mf.dispatchFetch('https://local.test/v1/checkin-mall/report',{headers:{Authorization:'Bearer '+ADMIN}})).json();assert.equal(report.success,true);assert.equal(report.summary.entries,1);
  console.log('PASS local workerd/D1: migration, 8 concurrent webhook observations => 1 push, 8 concurrent authenticated entries => 1 record, private report authorization. No production network/points.');
}finally{await mf.dispose();}
