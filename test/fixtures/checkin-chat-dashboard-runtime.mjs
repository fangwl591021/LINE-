// Isolated runtime only: every LINE request is intercepted, all people/tokens are synthetic.
import {handleCheckinChatDashboard,readCheckinDashboardSnapshots} from '../../worker/checkin-chat-dashboard.mjs';
import {supplementCheckinMallCards} from '../../worker/checkin-mall-card.mjs';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),OLD='U'+'f'.repeat(32);
const stats={profiles:0,walletReads:[],pushes:[],unexpected:0,faults:0};
globalThis.fetch=async()=>{stats.unexpected++;throw Error('External network forbidden in dashboard audit');};
const fake=async(url,options)=>{
 if(url==='https://api.line.me/v2/profile'){
  stats.profiles++;const uid={'Bearer synthetic-admin':A,'Bearer synthetic-user':B,'Bearer synthetic-old':OLD}[options.headers.Authorization];
  return uid?Response.json({userId:uid}):Response.json({}, {status:401});
 }
 if(url==='https://api.line.me/v2/bot/message/push'){
  stats.pushes.push({...JSON.parse(options.body),hasRetryKey:/^[0-9a-f-]{36}$/i.test(options.headers['X-Line-Retry-Key']||'')});
  return Response.json({});
 }
 stats.unexpected++;throw Error('Unexpected mocked network');
};
function faultDb(raw,mode){
 let fired=false;
 const before=async sql=>{if(fired||!/^\s*UPDATE\s+checkin_chat_dashboard_templates\b/i.test(sql))return;fired=true;stats.faults++;
  if(mode==='downgrade')await raw.prepare("UPDATE users SET role='user' WHERE line_id=?").bind(A).run();
  if(mode==='unlink')await raw.prepare("DELETE FROM user_identity_links WHERE old_line_id=?").bind(OLD).run();
 };
 const wrap=(statement,sql)=>({bind(...args){return wrap(statement.bind(...args),sql);},async run(){await before(sql);return statement.run();},async first(...args){await before(sql);return statement.first(...args);},async all(){await before(sql);return statement.all();}});
 const db={prepare(sql){return wrap(raw.prepare(sql),sql);},withSession(){return this;}};
 return db;
}
export default {async fetch(request,env){
 const path=new URL(request.url).pathname,now=Date.UTC(2026,9,25,4);
 if(path==='/fixture/stats')return Response.json(stats);
 if(path==='/fixture/snapshots'){const {ids}=await request.json();return Response.json([...await readCheckinDashboardSnapshots(env.ACTMASTER_DB,ids)]);}
 if(path==='/fixture/webhook'){
  const input=await request.json(),uid=input.uid||B,at=input.now??now;
  const event={type:'message',mode:input.mode||'active',timestamp:at,webhookEventId:input.eventId||'synthetic-event',replyToken:'SYNTHETIC_REPLY_TOKEN_DO_NOT_COPY',source:{type:'user',userId:uid},message:{id:input.eventId||'synthetic-event',type:'text',text:input.text||'會員打卡'}};
  const forward=input.forwardResult||{success:true},before=JSON.stringify({event,forward});
  await supplementCheckinMallCards([event],env,forward,{read:async identity=>{stats.walletReads.push(identity);return {identity,balance:input.balance??12867};}},fake,at);
  return Response.json({unchanged:before===JSON.stringify({event,forward})});
 }
 const fault=request.headers.get('x-fixture-fault'),environment=fault?{...env,ACTMASTER_DB:faultDb(env.ACTMASTER_DB,fault)}:env;
 return await handleCheckinChatDashboard(request,environment,row=>({role:row.role}),fake,now)||new Response('',{status:404});
}};
