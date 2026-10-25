import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { projectCheckinMallMonitor } from '../worker/checkin-mall-monitor.mjs';
import { defaultCheckinDashboardConfig, buildCheckinDashboardMessage } from '../worker/checkin-chat-dashboard-render.mjs';

const A='U'+'1'.repeat(32),B='U'+'2'.repeat(32),NOW=Date.parse('2026-10-25T03:56:00Z');
const cardId=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture(t) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  for(const file of ['0011_line_oa_chat_monitor.sql','0063_checkin_mall_cards.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  sql.exec("CREATE TABLE protected_points(id TEXT PRIMARY KEY,balance INTEGER);INSERT INTO protected_points VALUES('sentinel',333);");
  const queries=[];let unavailable='';
  const db={prepare(query){
    assert.match(query.trim(),/^(WITH|SELECT)\b/i,'Monitor projection is strictly read-only');
    const statement=args=>({bind(...values){return statement(values);},async all(){
      queries.push({query,args});if(unavailable&&query.includes(unavailable))throw Error('private read error');
      return {success:true,results:sql.prepare(query).all(...args)};
    }});return statement([]);
  }};
  const thread=(uid,extra={})=>{
    const values={thread_id:'line:'+uid,user_id:uid,source_type:'user',display_name:'合成會員',last_message_text:'會員打卡',last_message_type:'text',last_event_type:'message',message_count:1,unread_count:1,status:'open',tags:'保持',note:'勿修改',last_event_at:new Date(NOW-60000).toISOString(),created_at:new Date(NOW-60000).toISOString(),...extra};
    const keys=Object.keys(values);sql.prepare('INSERT INTO line_oa_threads('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>values[k]));
    return values.thread_id;
  };
  const physical=(uid,id='IN-'+uid,time=NOW-60000,extra={})=>{
    const values={message_id:id,thread_id:'line:'+uid,user_id:uid,direction:'inbound',message_type:'text',text_content:'會員打卡',event_type:'message',reply_token:'',raw_json:'{}',created_at:new Date(time).toISOString(),...extra};
    const keys=Object.keys(values);sql.prepare('INSERT INTO line_oa_messages('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>values[k]));
  };
  const card=(uid,n=1,extra={})=>{
    const values={id:cardId(n),event_id:'event-'+n,recipient_uid:uid,taipei_day:'synthetic-day-'+n,created_at:NOW,state:'accepted',retry_key:'retry-'+n,balance:12867,accepted_at:NOW,...extra};
    const keys=Object.keys(values);sql.prepare('INSERT INTO checkin_mall_cards('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>values[k]));return values.id;
  };
  const data=(selected='line:'+A,limit=100)=>{
    const summary=sql.prepare('SELECT COUNT(*) threads,COALESCE(SUM(message_count),0) messages,COALESCE(SUM(unread_count),0) unread FROM line_oa_threads').get();
    const threads=sql.prepare('SELECT * FROM line_oa_threads ORDER BY last_event_at DESC,thread_id LIMIT ?').all(limit);
    const messages=sql.prepare('SELECT message_id,thread_id,user_id,direction,message_type,text_content,event_type,created_at FROM line_oa_messages WHERE thread_id=? ORDER BY created_at DESC,message_id DESC LIMIT 80').all(selected).reverse();
    return {summary:{...summary,active24h:1},threads,selectedThreadId:selected,messages};
  };
  const snapshot=()=>JSON.stringify(['line_oa_threads','line_oa_messages','checkin_mall_cards','checkin_mall_clicks','protected_points'].map(table=>sql.prepare('SELECT * FROM '+table+' ORDER BY 1').all()));
  return {sql,db,queries,thread,physical,card,data,snapshot,fail:value=>unavailable=value};
}

test('accepted check-in card appears as an honest outbound preview and counts without any database writes',async t=>{
  const f=fixture(t);f.thread(A);f.physical(A);const id=f.card(A),before=f.snapshot(),data=f.data(),input=JSON.stringify(data);
  const result=await projectCheckinMallMonitor(f.db,data);
  assert.equal(result.messages.length,2);assert.equal(result.summary.messages,2);assert.equal(result.threads[0].message_count,2);
  const message=result.messages[1];assert.equal(message.message_id,'CHECKIN_MALL:'+id);assert.equal(message.user_id,A);assert.equal(message.thread_id,'line:'+A);
  assert.equal(message.direction,'outbound');assert.equal(message.message_type,'flex');assert.equal(message.event_type,'checkin_mall_card');
  assert.equal(message.created_at,'2026-10-25T03:56:00.000Z');assert.equal(message.delivery_status,'accepted');assert.equal(message.record_source,'checkin_mall_cards');
  assert.deepEqual(message.card_preview,{title:'會員購物金',balance:12867,queried_at:'2026-10-25T03:56:00.000Z',mother_reply_available:false});
  assert.match(message.text_content,/12,867 元/);assert.match(message.text_content,/LINE API已接受/);assert.match(message.text_content,/送達與已讀未確認/);assert.doesNotMatch(message.text_content,/打卡成功|已讀成功|已送達|贈點100/);
  assert.equal(result.threads[0].last_message_type,'flex');assert.equal(result.threads[0].unread_count,1);assert.equal(result.summary.unread,1);assert.equal(result.threads[0].status,'open');assert.equal(result.threads[0].note,'勿修改');
  assert.equal(JSON.stringify(data),input);assert.equal(f.snapshot(),before);assert.equal(f.queries.length,4);
});

test('zero is real and unknown or invalid balances never become a fictional zero',async t=>{
  const f=fixture(t);f.thread(A);f.physical(A);
  for(const [index,balance]of [0,null,-1,2.5,9007199254740992].entries())f.card(A,index+1,{created_at:NOW+index*86400000,balance});
  const result=await projectCheckinMallMonitor(f.db,f.data()),cards=result.messages.filter(row=>row.record_source==='checkin_mall_cards');
  assert.deepEqual(cards.map(row=>row.card_preview.balance),[0,null,null,null,null]);assert.match(cards[0].text_content,/購物金：0 元/);
  for(const card of cards.slice(1)){assert.match(card.text_content,/暫時無法取得/);assert.doesNotMatch(card.text_content,/購物金：0 元/);}
});

test('recipient and thread identities are exact; no aliases, other recipients or group records enter a conversation',async t=>{
  const f=fixture(t);f.thread(A);f.thread(B);f.physical(A);f.physical(B);f.card(A,1);f.card(B,2,{balance:999});
  const group='U'+'3'.repeat(32);f.thread(group,{source_type:'group'});f.card(group,3);
  const wrong='U'+'4'.repeat(32);f.thread(wrong,{user_id:A});f.card(wrong,4);
  const result=await projectCheckinMallMonitor(f.db,f.data());
  assert.ok(result.messages.every(row=>row.user_id===A&&row.thread_id==='line:'+A));assert.equal(result.messages.filter(row=>row.record_source).length,1);
  assert.equal(result.summary.messages,6); // Four physical thread counts plus the two exact accepted user cards.
  assert.equal(result.threads.find(row=>row.user_id===B).message_count,2);assert.equal(result.threads.find(row=>row.source_type==='group').message_count,1);
  assert.equal((await projectCheckinMallMonitor(f.db,{...f.data(),selectedThreadId:'not-line:'+A,messages:[]})).messages.length,0);
});

test('only accepted states project; failed, unknown, sending and preparing never imply a successful delivery',async t=>{
  const f=fixture(t);f.thread(A);f.physical(A);
  for(const [index,state]of ['unknown','sending','failed','preparing'].entries())f.card(A,index+1,{state,accepted_at:null});
  const data=f.data(),before=f.snapshot();assert.equal(await projectCheckinMallMonitor(f.db,data),data);assert.equal(f.snapshot(),before);
});

test('physical messages win over virtual IDs and repeated reads cannot duplicate counts or mutate unread state',async t=>{
  const f=fixture(t);f.thread(A,{message_count:2,unread_count:7});f.physical(A);const id=f.card(A);
  f.physical(A,'CHECKIN_MALL:'+id,NOW,{direction:'outbound',message_type:'flex',text_content:'既有正式訊息優先',event_type:'stored_reply'});
  f.thread(B);f.card(B,2);
  const data=f.data(),before=f.snapshot(),first=await projectCheckinMallMonitor(f.db,data),second=await projectCheckinMallMonitor(f.db,data);
  assert.equal(first.messages.length,2);assert.equal(first.messages[1].text_content,'既有正式訊息優先');assert.equal(first.messages[1].card_preview,undefined);
  assert.equal(first.threads.find(row=>row.user_id===A).message_count,2);assert.equal(first.summary.messages,4);assert.deepEqual(first,second);assert.equal(f.snapshot(),before);
});

test('older card counts do not overwrite a newer physical thread summary or activity time',async t=>{
  const f=fixture(t),newer=new Date(NOW+3600000).toISOString();f.thread(A,{last_event_at:newer,last_message_text:'較新的使用者訊息',last_message_type:'text',last_event_type:'message'});f.physical(A);f.card(A);
  const result=await projectCheckinMallMonitor(f.db,f.data());assert.equal(result.threads[0].message_count,2);assert.equal(result.threads[0].last_message_text,'較新的使用者訊息');assert.equal(result.threads[0].last_event_at,newer);
});

test('merged history selects the latest eighty messages with deterministic tie order',async t=>{
  const f=fixture(t);f.thread(A,{message_count:100,last_event_at:new Date(NOW+10000).toISOString()});
  for(let n=1;n<=100;n++){f.physical(A,'PHYSICAL-'+String(n).padStart(3,'0'),NOW+n*86400000);f.card(A,n,{created_at:NOW+n*86400000});}
  const data=f.data(),before=f.snapshot(),first=await projectCheckinMallMonitor(f.db,data),second=await projectCheckinMallMonitor(f.db,data);
  assert.equal(first.messages.length,80);assert.equal(new Set(first.messages.map(row=>row.message_id)).size,80);assert.deepEqual(first.messages,second.messages);
  assert.ok(first.messages.every(row=>Date.parse(row.created_at)>=NOW+61*86400000));assert.equal(first.summary.messages,200);assert.equal(first.threads[0].message_count,200);assert.equal(f.snapshot(),before);
  for(let n=1;n<first.messages.length;n++)assert.ok(Date.parse(first.messages[n].created_at)>=Date.parse(first.messages[n-1].created_at));
  assert.ok(f.queries.filter(row=>row.query.includes('WHERE recipient_uid=?')).every(row=>/LIMIT 80/.test(row.query)));
});

test('missing tables or an auxiliary read failure preserve the existing monitor unchanged',async t=>{
  const f=fixture(t);f.thread(A);f.physical(A);f.card(A);const data=f.data();
  f.fail('COUNT(*) AS virtual_count');assert.equal(await projectCheckinMallMonitor(f.db,data),data);f.fail('');
  f.sql.exec('DROP TABLE checkin_mall_clicks;DROP TABLE checkin_mall_cards;');assert.equal(await projectCheckinMallMonitor(f.db,data),data);
});

test('recipient aggregate is bounded to the first hundred threads while selected old threads remain readable',async t=>{
  const f=fixture(t);for(let n=1;n<=101;n++){const uid='U'+n.toString(16).padStart(32,'0');f.thread(uid);f.card(uid,n);}
  const uid='U'+(101).toString(16).padStart(32,'0'),data=f.data('line:'+uid,100),before=f.snapshot();
  const result=await projectCheckinMallMonitor(f.db,data);assert.equal(result.messages.length,1);assert.equal(result.messages[0].user_id,uid);assert.equal(result.summary.messages,202);
  const aggregate=f.queries.find(row=>row.query.includes('json_each'));assert.equal(JSON.parse(aggregate.args[0]).length,100);assert.equal(f.queries.length,4);assert.equal(f.snapshot(),before);
});

test('CRM uses the sent carousel snapshot without reading the current draft or changing stored data',async t=>{
  const f=fixture(t);f.thread(A);f.physical(A);const id=f.card(A);
  f.sql.exec(readFileSync(new URL('../migrations/0071_checkin_chat_dashboard.sql',import.meta.url),'utf8'));
  const config=defaultCheckinDashboardConfig();config.pages[1].title='發送當時的說明';
  const message=buildCheckinDashboardMessage({},id,12867,NOW,config);
  f.sql.prepare('INSERT INTO checkin_chat_dashboard_snapshots(card_id,template_revision,config_json,message_json,created_at) VALUES(?,?,?,?,?)').run(id,7,JSON.stringify(config),JSON.stringify(message),NOW);
  const before=f.snapshot(),saved=JSON.stringify(f.sql.prepare('SELECT * FROM checkin_chat_dashboard_snapshots').all());
  const result=await projectCheckinMallMonitor(f.db,f.data());
  const preview=result.messages.find(row=>row.message_id==='CHECKIN_MALL:'+id).card_preview;
  assert.equal(preview.template_revision,7);assert.equal(preview.pages.length,2);assert.equal(preview.pages[1].title,'發送當時的說明');
  assert.equal(preview.balance,12867);assert.equal(preview.pages[0].kind,'wallet');assert.equal(preview.pages[1].buttons[0].target,'mall');
  assert.equal(Object.hasOwn(preview.pages[0].buttons[0],'uri'),false,'monitor previews cannot execute a raw URI');
  assert.ok(!f.queries.some(row=>/FROM checkin_chat_dashboard_templates/i.test(row.query)),'history must not read a mutable current template');
  assert.equal(f.snapshot(),before);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM checkin_chat_dashboard_snapshots').all()),saved);
});

test('a mismatched snapshot timestamp keeps the original legacy summary available',async t=>{
  const f=fixture(t);f.thread(A);f.physical(A);const id=f.card(A);
  f.sql.exec(readFileSync(new URL('../migrations/0071_checkin_chat_dashboard.sql',import.meta.url),'utf8'));
  const config=defaultCheckinDashboardConfig(),message=buildCheckinDashboardMessage({},id,12867,NOW,config);
  f.sql.prepare('INSERT INTO checkin_chat_dashboard_snapshots(card_id,template_revision,config_json,message_json,created_at) VALUES(?,?,?,?,?)').run(id,2,JSON.stringify(config),JSON.stringify(message),NOW+1);
  const result=await projectCheckinMallMonitor(f.db,f.data()),preview=result.messages.find(row=>row.message_id==='CHECKIN_MALL:'+id).card_preview;
  assert.equal(preview.balance,12867);assert.equal(Object.hasOwn(preview,'pages'),false);
});

test('historical product pages use frozen product data and never current catalog values',async t=>{
  const f=fixture(t);f.thread(A);f.physical(A);const id=f.card(A);
  for(const file of ['0071_checkin_chat_dashboard.sql','0072_checkin_dashboard_products.sql'])f.sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const product={shopId:'22222222-2222-4222-8222-222222222222',productId:'selected-product',title:'發送時商品',shopName:'發送時店家',imageUrl:'',priceCents:1180000,purchaseMode:'online',merchantEnabled:true,redeemType:'percent',redeemValue:50,version:1,shopVersion:1};
  const config=defaultCheckinDashboardConfig();config.pages[1]={id:'selected',kind:'product',shopId:product.shopId,productId:product.productId};
  const target={pageId:'selected',shopId:product.shopId,productId:product.productId,product,available:true,createdAt:NOW};
  const message=buildCheckinDashboardMessage({},id,12867,NOW,config,[target]);
  f.sql.prepare('INSERT INTO checkin_chat_dashboard_snapshots VALUES(?,?,?,?,?)').run(id,3,JSON.stringify(config),JSON.stringify(message),NOW);
  f.sql.prepare('INSERT INTO checkin_chat_dashboard_product_snapshots VALUES(?,?,?,?,?,?,?)').run(id,'selected',product.productId,product.shopId,JSON.stringify(product),1,NOW);
  const saved=JSON.stringify(f.sql.prepare('SELECT * FROM checkin_chat_dashboard_product_snapshots').all());
  const result=await projectCheckinMallMonitor(f.db,f.data()),preview=result.messages.find(row=>row.message_id==='CHECKIN_MALL:'+id).card_preview;
  assert.equal(preview.pages[1].kind,'product');assert.equal(preview.pages[1].title,'發送時商品');assert.match(preview.pages[1].body,/11,800/);
  assert.deepEqual(preview.pages[1].buttons,[{label:'查看商品',target:'product'}]);
  assert.ok(!f.queries.some(row=>/FROM store_shop_products/i.test(row.query)),'old product pages cannot query the current catalog');
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM checkin_chat_dashboard_product_snapshots').all()),saved);
});
