// Child-owned, display-only LINE keywords. Called only after signature verification.
const merchantRoles=['admin','總管','store','店長'];
const memberRoles=[...merchantRoles,'user','用戶'];
const admins=['admin','總管'];
export function shopKeyword(event){
 if(event?.type!=='message'||event.message?.type!=='text')return '';
 const text=String(event.message.text||'').normalize('NFKC').trim();
 if(text==='店家專區')return 'portal';
 if(['儀錶板','儀表板'].includes(text))return 'dashboard';
 if(text==='商城業績')return 'sales';
 if(/^商城商品(?:\s|$)/.test(text))return 'products';
 if(/^商城訂單(?:\s|$)/.test(text))return 'orders';
 return '';
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
 const kind=shopKeyword(event);
 if(['portal','products','orders'].includes(kind)){
  if(kind==='orders'&&!merchant)return {type:'text',text:'商城訂單僅開放管理員、店長查詢本人店家。'};
  const match=String(event.message.text).normalize('NFKC').trim().match(/^商城(?:商品|訂單)(?: ([1-9]\d{0,3}))?$/);
  const page=kind==='portal'?1:Number(match?.[1]||1);
  if(kind!=='portal'&&(!match||page>1000))return {type:'text',text:'請使用卡片的翻頁按鈕，或輸入「商城商品」「商城訂單」（頁碼 1–1000）。'};
  const result=await readChatPage(db,uid,kind==='orders'?'orders':'products',page);
  const buttons=[];
  const keyword=kind==='orders'?'商城訂單':'商城商品';
  if(page>1)buttons.push(command('上一頁',`${keyword} ${page-1}`));
  if(result.more&&page<1000)buttons.push(command('下一頁',`${keyword} ${page+1}`));
  if(kind==='portal'){
   buttons.push(command('我的商品','商城商品'));
   if(merchant)buttons.push(command('我的業績','商城業績'),command('我的網購訂單','商城訂單'),command('商城儀錶板','儀錶板'));
   buttons.push(action('新增／編輯商品（網頁）',link(env,'manage')));
  }else{
   buttons.push(command('返回店家專區','店家專區'));
   buttons.push(action(kind==='orders'?'核帳／出貨操作（網頁）':'新增／編輯商品（網頁）',link(env,kind==='orders'?'online-manage':'manage')));
  }
  const lines=[...result.lines];
  if(kind==='portal')lines.unshift(merchant?'商品、業績、訂單直接在聊天室查詢；變更資料才開啟登入操作頁。':'一般會員可管理 1 個商品；店長不限。業績、收款與折抵操作仍限店長／管理員。');
  if(result.more&&page===1000)lines.push('已達聊天室查詢範圍，較早資料請至商城管理查詢。');
  return card(kind==='portal'?'店家專區':`${kind==='orders'?'我的網購訂單':'我的商品'}・第 ${page} 頁`,lines,buttons);
 }
 if(!merchant)return {type:'text',text:'商城儀錶板僅開放管理員、店長。您仍可輸入「店家專區」管理自己的商品。'};
 const admin=kind==='dashboard'&&admins.includes(role),s=await readMallSummary(db,uid,admin,now);
 const n=v=>Number(v).toLocaleString('zh-TW');
 return card(kind==='sales'?'我的店家業績':admin?'全商城營運儀錶板':'我的店家儀錶板',[
  `店家：${n(s.shops.active)} 家上架／共 ${n(s.shops.total)} 家\n商品：${n(s.products.active)} 項上架／${n(s.products.draft)} 項草稿`,
  `網購訂單：共 ${n(s.orders.total)} 筆\n待匯款 ${n(s.orders.pending)}／待核帳 ${n(s.orders.reported)}\n已付款待出貨 ${n(s.orders.unfulfilled)}／已出貨待完成 ${n(s.orders.shipped)}\n網購累計已核帳 NT$ ${n(s.orders.received/100)}`,
  `${s.today}（台灣時間）商品 QR 折抵：${n(s.redemptions.total)} 筆\n商品金額 NT$ ${n(s.redemptions.amount)}／折抵 ${n(s.redemptions.points)} 點\n折抵後應收 NT$ ${n(s.redemptions.amount-s.redemptions.points)}（非銀行實收）`,
  '網購與現場 QR 分開統計；不包含未經本商城商品 QR 確認的交易。'+(String(env.STORE_COMMERCE_ENABLED)==='true'?'':'線上交易仍未開放。')
 ],[command('更新摘要',kind==='sales'?'商城業績':'儀錶板'),command('店家操作','店家專區')]);
}
const short=(value,max=80)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const money=cents=>Number(cents).toLocaleString('zh-TW',{minimumFractionDigits:0,maximumFractionDigits:2});
function orderTime(value){
 const raw=String(value||'');
 const date=new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(raw)?raw.replace(' ','T')+'Z':raw);
 return Number.isFinite(date.getTime())?date.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'時間未提供';
}
// Explicit field projection: no buyer identity, address, phone, bank or full snapshot.
async function readChatPage(db,uid,kind,page){
 const shop=await db.prepare('SELECT id,name,status FROM store_shop_stores WHERE owner_uid=?').bind(uid).first();
 if(!shop)return {lines:['尚未建立自己的店家。可使用「新增／編輯商品」入口建置。'],more:false};
 const query=kind==='orders'
  ?`SELECT id,total_cents,payment_status,fulfillment_status,created_at,
    substr(json_extract(snapshot_json,'$.items[0].title'),1,80) first_title,
    json_array_length(snapshot_json,'$.items') item_count
    FROM store_commerce_orders WHERE shop_id=? ORDER BY created_at DESC,id DESC LIMIT 6 OFFSET ?`
  :`SELECT title,price_cents,status,purchase_mode,redeem_type,redeem_value FROM store_shop_products
    WHERE shop_id=? AND status!='archived' ORDER BY updated_at DESC,id DESC LIMIT 6 OFFSET ?`;
 const result=await db.prepare(query).bind(shop.id,(page-1)*5).all();
 if(!Array.isArray(result.results))throw Error('Missing chat rows');
 const lines=[`${short(shop.name)}｜店面${shop.status==='active'?'已上架':'草稿未公開'}`];
 for(const row of result.results.slice(0,5)){
  if(kind==='orders'){
   const paid={pending:'待匯款',reported:'已回報匯款・待核帳',paid:'已核帳',cancelled:'已取消'}[row.payment_status]||'狀態待確認';
   const shipped={unfulfilled:'未出貨',shipped:'已出貨',completed:'已完成'}[row.fulfillment_status]||'狀態待確認';
   lines.push(`訂單 ${short(row.id,64)}\n${orderTime(row.created_at)}（台灣時間）\n${short(row.first_title)||'商品名稱未提供'}${row.item_count>1?` 等 ${row.item_count} 項商品`:''}\nNT$ ${money(row.total_cents/100)}｜${paid}／${shipped}`);
  }else{
   const redeem=row.redeem_type==='fixed'?`最多折抵 ${row.redeem_value} 點`:row.redeem_type==='percent'?`最多折抵 ${row.redeem_value}%`:row.redeem_type==='full'?'可全額折抵':'不折抵';
   lines.push(`${short(row.title)}\nNT$ ${money(row.price_cents/100)}｜${row.status==='active'?'已上架':'草稿'}｜${row.purchase_mode==='online'?'網購':'限店內'}\n${redeem}（依實際結帳規則）`);
  }
 }
 if(!result.results.length)lines.push(page===1?(kind==='orders'?'目前沒有網購訂單。':'目前沒有商品。'):'此頁沒有資料，請返回上一頁或重新查詢。');
 return {lines,more:result.results.length>5};
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
