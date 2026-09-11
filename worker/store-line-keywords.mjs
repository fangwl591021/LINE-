// Child-owned, display-only LINE keywords. Called only after signature verification.
const merchantRoles=['admin','總管','store','店長'];
const memberRoles=[...merchantRoles,'user','用戶'];
const admins=['admin','總管'];
export function shopKeyword(event){
 if(event?.type!=='message'||event.message?.type!=='text')return '';
 const text=String(event.message.text||'').normalize('NFKC').trim();
 return text==='店家專區'?'portal':['儀錶板','儀表板'].includes(text)?'dashboard':'';
}
const text=value=>({type:'text',text:String(value),wrap:true,size:'sm',color:'#16345a'});
const action=(label,uri)=>({type:'button',style:'secondary',action:{type:'uri',label,uri}});
const command=(label,value)=>({type:'button',style:'secondary',action:{type:'message',label,text:value}});
function link(env,section){
 const id=String(env.POINT_LIFF_ID||env.LIFF_ID||'1660923784-vViMTZ1y').trim();
 if(!/^\d+-[A-Za-z0-9]+$/.test(id))throw Error('Invalid LIFF configuration');
 const url=new URL('https://liff.line.me/'+id);url.searchParams.set('shopSection',section);return url.href;
}
function card(title,lines,buttons){
 return {type:'flex',altText:title,contents:{type:'bubble',size:'mega',
 header:{type:'box',layout:'vertical',backgroundColor:'#163b5a',contents:[{type:'text',text:title,color:'#ffffff',weight:'bold',size:'lg',wrap:true}]},
 body:{type:'box',layout:'vertical',spacing:'md',contents:lines.map(text)},
 footer:{type:'box',layout:'vertical',spacing:'sm',contents:buttons}}};
}
export async function readMallSummary(db,uid,admin,now=new Date()){
 const today=new Date(now.getTime()+8*3600000).toISOString().slice(0,10);
 const from=new Date(today+'T00:00:00+08:00').toISOString().slice(0,19).replace('T',' ');
 const until=new Date(Date.parse(today+'T00:00:00+08:00')+86400000).toISOString().slice(0,19).replace('T',' ');
 const scope=admin?'1=1':'s.owner_uid=?',binds=admin?[]:[uid];
 const first=(sql,args=binds)=>db.prepare(sql).bind(...args).first();
 const [shops,products,orders,redemptions]=await Promise.all([
  first(`SELECT COUNT(*) total,COALESCE(SUM(s.status='active'),0) active FROM store_shop_stores s WHERE ${scope}`),
  first(`SELECT COUNT(*) total,COALESCE(SUM(p.status='active'),0) active,COALESCE(SUM(p.status='draft'),0) draft FROM store_shop_products p JOIN store_shop_stores s ON s.id=p.shop_id WHERE ${scope} AND p.status!='archived'`),
  first(`SELECT COUNT(*) total,COALESCE(SUM(o.payment_status='pending'),0) pending,COALESCE(SUM(o.payment_status='reported'),0) reported,COALESCE(SUM(o.payment_status='paid' AND o.fulfillment_status='unfulfilled'),0) unfulfilled,COALESCE(SUM(o.payment_status='paid' AND o.fulfillment_status='shipped'),0) shipped,COALESCE(SUM(CASE WHEN o.payment_status='paid' THEN o.received_cents ELSE 0 END),0) received FROM store_commerce_orders o JOIN store_shop_stores s ON s.id=o.shop_id WHERE ${scope}`),
  first(`WITH journal AS (SELECT actor_id,CASE WHEN json_valid(fingerprint) THEN fingerprint ELSE '{}' END f FROM store_cashier_requests WHERE status='succeeded' AND updated_at>=? AND updated_at<?)
   SELECT COUNT(*) total,COALESCE(SUM(json_extract(j.f,'$.amount')),0) amount,COALESCE(SUM(json_extract(j.f,'$.deductPoints')),0) points FROM journal j
   JOIN store_shop_products p ON p.id=json_extract(j.f,'$.productId') JOIN store_shop_stores s ON s.id=p.shop_id
   WHERE ${scope} AND j.actor_id=s.owner_uid AND json_extract(j.f,'$.mode')='redeem'
   AND json_type(j.f,'$.amount')='integer' AND json_type(j.f,'$.deductPoints')='integer'
   AND json_extract(j.f,'$.amount') BETWEEN 1 AND 1000000 AND json_extract(j.f,'$.deductPoints') BETWEEN 1 AND json_extract(j.f,'$.amount')`,[from,until,...binds])
 ]);
 if(!shops||!products||!orders||!redemptions)throw Error('Missing aggregate');
 return {today,shops,products,orders,redemptions};
}
export async function buildShopKeywordMessage(event,env,now){
 if(event.source?.type!=='user'||!/^U[0-9a-f]{32}$/.test(event.source?.userId||''))return {type:'text',text:'請在與官方帳號的一對一聊天室輸入此指令，避免公開店家營運資料。'};
 const uid=event.source.userId,db=env.ACTMASTER_DB;
 const rows=(await db.prepare('SELECT role FROM users WHERE line_id=? LIMIT 2').bind(uid).all()).results;
 if(rows?.length!==1)return card('商城登入／註冊',['請先使用此 LINE 帳號完成會員註冊，再回聊天室操作。'],[action('開啟商城',link(env,'mine'))]);
 const role=String(rows[0].role||'').toLowerCase(),merchant=merchantRoles.includes(role);
 if(!memberRoles.includes(role))return {type:'text',text:'目前此帳號未開放商城管理，請聯絡管理員確認。'};
 if(shopKeyword(event)==='portal'){
  const buttons=[action('我的商城／商品管理',link(env,'manage'))];
  if(merchant)buttons.push(action('我的業績查詢',link(env,'sales')),action('我的訂單／收款寄送',link(env,'online-manage')),command('商城儀錶板','儀錶板'));
  buttons.push(action('查看商城',link(env,'list')));
  return card('店家專區',[merchant?'管理本人店家；實際操作仍須 LINE 登入與權限驗證。':'一般會員可管理 1 個商品；店長不限。業績、收款與折抵操作仍限店長／管理員。'],buttons);
 }
 if(!merchant)return {type:'text',text:'商城儀錶板僅開放管理員、店長。您仍可輸入「店家專區」管理自己的商品。'};
 const admin=admins.includes(role),s=await readMallSummary(db,uid,admin,now);
 const n=v=>Number(v).toLocaleString('zh-TW');
 return card(admin?'全商城營運儀錶板':'我的店家儀錶板',[
  `店家：${n(s.shops.active)} 家上架／共 ${n(s.shops.total)} 家\n商品：${n(s.products.active)} 項上架／${n(s.products.draft)} 項草稿`,
  `網購訂單：共 ${n(s.orders.total)} 筆\n待匯款 ${n(s.orders.pending)}／待核帳 ${n(s.orders.reported)}\n已付款待出貨 ${n(s.orders.unfulfilled)}／已出貨待完成 ${n(s.orders.shipped)}\n網購累計已核帳 NT$ ${n(s.orders.received/100)}`,
  `${s.today}（台灣時間）商品 QR 折抵：${n(s.redemptions.total)} 筆\n商品金額 NT$ ${n(s.redemptions.amount)}／折抵 ${n(s.redemptions.points)} 點\n折抵後應收 NT$ ${n(s.redemptions.amount-s.redemptions.points)}（非銀行實收）`,
  '網購與現場 QR 分開統計；不包含未經本商城商品 QR 確認的交易。'+(String(env.STORE_COMMERCE_ENABLED)==='true'?'':'線上交易仍未開放。')
 ],[command('更新摘要','儀錶板'),command('店家操作','店家專區')]);
}
export async function consumeShopKeywords(events,env,reply){
 const remaining=[],seen=new Set();
 for(const event of events){
  if(!shopKeyword(event)){remaining.push(event);continue;}
  // Ownership is claimed even on denial/error: never fall through to mother replies.
  if(event.mode==='standby'||!event.replyToken||seen.has(event.replyToken))continue;
  seen.add(event.replyToken);
  let message;
  try{message=await buildShopKeywordMessage(event,env);}
  catch{message={type:'text',text:'商城資料暫時無法讀取，請稍後再輸入「店家專區」或「儀錶板」。'};}
  try{const result=await reply({replyToken:event.replyToken,messages:[message]},env);if(result?.success===false)console.warn('store_keyword_reply_failed');}
  catch{console.warn('store_keyword_reply_failed');}
 }
 return remaining;
}
// Sign only the unclaimed subset; never forward a child-owned reply token.
export async function signRemainingShopEvents(rawBody,secret){
 const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(rawBody)))));
}
