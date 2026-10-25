// Isolated synthetic fixture: actual sender/API/CRM projection, with no external network.
import {handleCheckinChatDashboard} from '../../worker/checkin-chat-dashboard.mjs';
import {handleCheckinMall,supplementCheckinMallCards} from '../../worker/checkin-mall-card.mjs';
import {projectCheckinMallMonitor} from '../../worker/checkin-mall-monitor.mjs';
import {defaultCheckinDashboardConfig,buildCheckinDashboardMessage} from '../../worker/checkin-chat-dashboard-render.mjs';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32);
const NOW=Date.UTC(2026,9,25,4),stats={profiles:0,walletReads:[],pushes:[],unexpected:0};
globalThis.fetch=async()=>{stats.unexpected++;throw Error('External requests forbidden in repeat Flex audit');};
function fake(mode=''){
 return async(url,options={})=>{
  if(String(url).startsWith('https://api.line.me/oauth2/v2.1/verify?access_token='))return Response.json({client_id:'1660923784',expires_in:3600});
  if(url==='https://api.line.me/v2/profile'){
   stats.profiles++;const uid={'Bearer synthetic-admin':A,'Bearer synthetic-user':B,'Bearer synthetic-other':C}[options.headers?.Authorization];
   return uid?Response.json({userId:uid,displayName:uid===C?'SYNTHETIC_OTHER_OPENER':'SYNTHETIC_MEMBER'}):Response.json({}, {status:401});
  }
  if(url==='https://api.line.me/v2/bot/message/push'){
   stats.pushes.push({...JSON.parse(options.body),retryKey:options.headers['X-Line-Retry-Key']});
   if(mode==='unknown')throw Error('Synthetic post-accept timeout');return Response.json({});
  }
  stats.unexpected++;throw Error('Unexpected mocked request');
 };
}
function failSnapshotDb(raw){
 const wrap=(statement,sql)=>({_statement:statement,_sql:sql,bind(...args){return wrap(statement.bind(...args),sql);},async run(){if(/INSERT INTO checkin_chat_dashboard_snapshots/i.test(sql))throw Error('Synthetic snapshot outage');return statement.run();},async first(...args){return statement.first(...args);},async all(){return statement.all();}});
 const db={prepare(sql){return wrap(raw.prepare(sql),sql);},withSession(){return this;},async batch(statements){if(statements.some(s=>/INSERT INTO checkin_chat_dashboard_snapshots/i.test(s._sql)))throw Error('Synthetic snapshot outage');return raw.batch(statements.map(s=>s._statement));}};return db;
}
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/fixture/stats')return Response.json(stats);
 if(path==='/fixture/render-old'){
  const input=await request.json(),config=defaultCheckinDashboardConfig();
  const targets=[];if(input.product){const product={...input.product,title:'歷史商品不改寫'};config.pages.push({id:'old_product',kind:'product',shopId:product.shopId,productId:product.productId});targets.push({pageId:'old_product',shopId:product.shopId,productId:product.productId,available:true,product});}
  return Response.json({config,productSnapshots:targets,message:buildCheckinDashboardMessage(env,input.cardId,4444,NOW-3600000,config,targets)});
 }
 if(path==='/fixture/monitor'){
  const uid=url.searchParams.get('uid')||B,threads=(await env.ACTMASTER_DB.prepare('SELECT * FROM line_oa_threads ORDER BY thread_id').all()).results;
  return Response.json(await projectCheckinMallMonitor(env.ACTMASTER_DB,{summary:{messages:0},threads,selectedThreadId:'line:'+uid,messages:[]}));
 }
 if(path==='/fixture/webhook'){
  const input=await request.json(),at=input.now??NOW;
  const event={type:'message',mode:'active',timestamp:at,webhookEventId:input.eventId,replyToken:'SYNTHETIC_REPLY_TOKEN_MOTHER_ONLY',source:{type:'user',userId:input.uid||B},message:{id:input.eventId,type:'text',text:'會員打卡'}};
  const forward=input.forward||{success:true,data:{messages:[{type:'text',text:'今日已贈點，請明天再來。'}]}};
  const before=JSON.stringify({event,forward}),environment=input.snapshotFail?{...env,ACTMASTER_DB:failSnapshotDb(env.ACTMASTER_DB)}:env;
  await supplementCheckinMallCards([event],environment,forward,{read:async uid=>{stats.walletReads.push({uid,balance:input.balance??12867});return {identity:uid,balance:input.balance??12867};}},fake(input.pushMode),at);
  return Response.json({unchanged:before===JSON.stringify({event,forward})});
 }
 const fetcher=fake();return await handleCheckinChatDashboard(request,env,row=>({role:row.role}),fetcher,NOW)||await handleCheckinMall(request,env,row=>({role:row.role}),fetcher,NOW)||new Response('',{status:404});
}};
