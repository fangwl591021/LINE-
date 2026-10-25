// Synthetic Workerd-only audit fixture. No real LINE, wallet or remote image request is allowed.
import { handleCheckinChatDashboard, readCheckinDashboardSnapshots } from '../../worker/checkin-chat-dashboard.mjs';
import { handleCheckinMall, supplementCheckinMallCards } from '../../worker/checkin-mall-card.mjs';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32),S='U'+'d'.repeat(32);
const stats={profiles:0,verifies:0,pushes:[],walletReads:[],unexpected:0,faults:0};
globalThis.fetch=async()=>{stats.unexpected++;throw Error('External network forbidden in product dashboard audit');};
const fake=async(url,options={})=>{
 if(String(url).startsWith('https://api.line.me/oauth2/v2.1/verify?access_token=')){
  stats.verifies++;return Response.json({client_id:'1660923784',expires_in:3600});
 }
 if(url==='https://api.line.me/v2/profile'){
  stats.profiles++;const uid={'Bearer synthetic-admin':A,'Bearer synthetic-user':B,'Bearer synthetic-forwarded':C,'Bearer synthetic-store':S}[options.headers?.Authorization];
  return uid?Response.json({userId:uid,displayName:uid===C?'FORWARDED_ACTOR':'SYNTHETIC_ACTOR'}):Response.json({}, {status:401});
 }
 if(url==='https://api.line.me/v2/bot/message/push'){
  stats.pushes.push({...JSON.parse(options.body),hasRetryKey:/^[0-9a-f-]{36}$/i.test(options.headers['X-Line-Retry-Key']||'')});return Response.json({});
 }
 stats.unexpected++;throw Error('Unexpected mocked network');
};
function faultDb(raw,mode,productId){
 let fired=0;
 const before=async sql=>{
  if(mode==='click-write-fail'&&/^\s*INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+\w*product_clicks\b/i.test(sql)){stats.faults++;throw Error('Synthetic analytics write outage');}
  if(mode==='send-merchant-downgrade'&&/^\s*INSERT\s+INTO\s+checkin_chat_dashboard_snapshots\b/i.test(sql)&&fired++===0){stats.faults++;await raw.prepare("UPDATE users SET role='reward' WHERE line_id=?").bind(S).run();}
  const target=/^\s*INSERT\s+INTO\s+checkin_chat_dashboard_snapshots\b/i.test(sql),publishing=/^\s*UPDATE\s+checkin_chat_dashboard_templates\s+SET\s+published_json\b/i.test(sql);
  if(mode==='publish-change'&&publishing&&!fired++){stats.faults++;await raw.prepare('UPDATE store_shop_products SET price_cents=price_cents+100,version=version+1 WHERE id=?').bind(productId).run();}
  if(!target)return;
  if(mode==='send-change-once'&&fired++===0){stats.faults++;await raw.prepare('UPDATE store_shop_products SET price_cents=price_cents+100,version=version+1 WHERE id=?').bind(productId).run();}
  if(mode==='send-change-always'&&fired++<2){stats.faults++;await raw.prepare('UPDATE store_shop_products SET price_cents=price_cents+100,version=version+1 WHERE id=?').bind(productId).run();}
 };
 const wrap=(statement,sql)=>({_statement:statement,_sql:sql,bind(...args){return wrap(statement.bind(...args),sql);},async run(){await before(sql);return statement.run();},async first(...args){await before(sql);return statement.first(...args);},async all(){await before(sql);return statement.all();},async raw(...args){await before(sql);return statement.raw(...args);}});
 const db={prepare(sql){return wrap(raw.prepare(sql),sql);},withSession(){return this;},async batch(statements){for(const statement of statements)await before(statement._sql);return raw.batch(statements.map(statement=>statement._statement));}};
 return db;
}
export default {async fetch(request,env){
 const path=new URL(request.url).pathname,now=Date.UTC(2026,9,25,4);
 if(path==='/fixture/stats')return Response.json(stats);
 if(path==='/fixture/snapshots'){const {ids}=await request.json();return Response.json([...await readCheckinDashboardSnapshots(env.ACTMASTER_DB,ids)]);}
 const fault=request.headers.get('x-fixture-fault'),productId=request.headers.get('x-fixture-product')||'';
 const environment=fault?{...env,ACTMASTER_DB:faultDb(env.ACTMASTER_DB,fault,productId)}:env;
 if(path==='/fixture/webhook'){
  const input=await request.json(),uid=input.uid||B,at=input.now??now;
  const event={type:'message',mode:input.mode||'active',timestamp:at,webhookEventId:input.eventId||'synthetic-event',replyToken:'SYNTHETIC_REPLY_TOKEN_DO_NOT_COPY',source:{type:'user',userId:uid},message:{id:input.eventId||'synthetic-event',type:'text',text:'會員打卡'}};
  const forward=input.forwardResult||{success:true},before=JSON.stringify({event,forward});
  await supplementCheckinMallCards([event],environment,forward,{read:async identity=>{stats.walletReads.push(identity);return {identity,balance:input.balance??12867};}},fake,at);
  return Response.json({unchanged:before===JSON.stringify({event,forward})});
 }
 return await handleCheckinChatDashboard(request,environment,row=>({role:row.role}),fake,now)||await handleCheckinMall(request,environment,row=>({role:row.role}),fake,now)||new Response('',{status:404});
}};
