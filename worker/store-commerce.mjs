// Isolated online remittance orders; online points use a separate state machine.
import {BuyerProfileError,readBuyerProfile,saveBuyerProfile} from './store-buyer-profile.mjs';
import {CommercePointError,commercePointsEnabled,requireCommercePointService,commerceWallet,pointLockStatements,pointLockError,executePointOperation,reconcilePointOrder} from './store-commerce-points.mjs';
import {storePlanForRole,retailRoleSql,pickupRoleSql} from '../js/modules/store-cooperation-plans.mjs';
const root='/v1/store-commerce';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
class CommerceError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const fail=(message,status)=>{throw new CommerceError(message,status);};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
function str(data,key,max,required=true) {
  const value=data?.[key]??'';
  if(typeof value!=='string'||value.length>max||/[\u0000-\u001f]/.test(value))fail(`${key} 格式錯誤`);
  if(required&&!value.trim())fail(`${key} 不可空白`);return value.trim();
}
function integer(value,max,label,min=0) {if(!Number.isSafeInteger(value)||value<min||value>max)fail(`${label} 必須為 ${min} 至 ${max} 的整數`);return value;}
function uuid(value) {if(typeof value!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))fail('請重新開啟表單取得交易編號');return value;}
async function hash(value) {const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function json(request) {
  const reader=request.body?.getReader();if(!reader)fail('缺少資料');const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000){await reader.cancel();fail('資料過大',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('JSON 格式錯誤');}
  if(!data||typeof data!=='object'||Array.isArray(data))fail('資料格式錯誤');return data;
}
async function actor(request,db,fetcher) {
  const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!token||token.length>4096)fail('請先登入',401);
  const response=await fetcher('https://api.line.me/v2/profile',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
  if(!response.ok)fail('登入已失效',401);const profile=await response.json();
  if(!/^U[0-9a-f]{32}$/i.test(profile.userId||''))fail('登入身分無效',401);
  const user=await q(db,'SELECT line_id,role,name FROM users WHERE line_id=? LIMIT 1',profile.userId).first();
  if(!user)fail('請先完成會員註冊',403);return user;
}
async function ownShop(db,user) {
  if(!storePlanForRole(user.role).canOnline)fail('目前合作方案未開放商城管理',403);
  const shop=await q(db,'SELECT * FROM store_shop_stores WHERE owner_uid=?',user.line_id).first();if(!shop)fail('請先建立店面',404);return shop;
}
const defaults={enabled:0,bank_name:'',bank_code:'',bank_account:'',bank_holder:'',shipping_fee_cents:0,free_shipping_cents:0,version:0};
const settings=(db,id)=>q(db,'SELECT * FROM store_commerce_settings WHERE shop_id=?',id).first();
function settingsInput(data) {
  if(typeof data.enabled!=='boolean')fail('請選擇是否開放匯款下單');
  const result={enabled:Number(data.enabled),bank_name:str(data,'bank_name',60,data.enabled),bank_code:str(data,'bank_code',3,data.enabled),bank_account:str(data,'bank_account',24,data.enabled),bank_holder:str(data,'bank_holder',80,data.enabled),shipping_fee_cents:integer(data.shipping_fee_cents,1000000,'運費'),free_shipping_cents:integer(data.free_shipping_cents,100000000,'免運門檻')};
  if(result.bank_code&&!/^\d{3}$/.test(result.bank_code))fail('銀行代碼須為三碼');
  if(result.bank_account&&!/^\d{5,24}$/.test(result.bank_account))fail('銀行帳號須為 5 至 24 碼數字');return result;
}
function contact(data,label) {
  if(!data||typeof data!=='object'||Array.isArray(data))fail(`缺少${label}資料`);
  const name=str(data,'name',80),phone=str(data,'phone',30).replace(/[ ()-]/g,'').replace(/^\+8860?/,'0');
  if(!/^09\d{8}$/.test(phone))fail(`${label}手機須為 09 開頭的 10 碼手機號碼`);
  return {name,phone};
}
function checkoutInput(data) {
  if(data.payment_method!=='REMITTANCE')fail('目前只開放銀行匯款；LINE Pay 尚未啟用');
  const points=integer(data.points_used??0,1000000,'折抵點數');
  if(!Array.isArray(data.items)||!data.items.length||data.items.length>20)fail('每筆訂單限 1 至 20 種商品');
  const items=data.items.map(item=>({id:str(item,'id',80),quantity:integer(item?.quantity,99,'數量',1)})).sort((a,b)=>a.id.localeCompare(b.id));
  if(new Set(items.map(i=>i.id)).size!==items.length)fail('請合併重複商品數量');
  const buyer={...contact(data.buyer,'購買人'),email:str(data.buyer,'email',254,false)};
  if(buyer.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email))fail('購買人 Email 格式錯誤');
  const customer=data.customer;if(!customer||typeof customer!=='object'||Array.isArray(customer))fail('缺少收件資料');
  const carrier=str(customer,'carrier',10);if(!['POST','FAMILY','SEVEN','PICKUP'].includes(carrier))fail('寄送方式無效');
  const pickup=carrier==='PICKUP';
  const recipient={...contact(customer,pickup?'取貨人':'收件人'),carrier,postal_code:pickup?'':str(customer,'postal_code',6,false),city:pickup?'':str(customer,'city',20,carrier==='POST'),district:pickup?'':str(customer,'district',20,carrier==='POST'),address:pickup?'':str(customer,'address',200,carrier==='POST'),store_info:pickup?'':str(customer,'store_info',120,carrier!=='POST'),note:str(customer,'note',300,false)};
  if(recipient.postal_code&&!/^\d{3,6}$/.test(recipient.postal_code))fail('郵遞區號須為 3 至 6 碼數字');
  return {shop_id:str(data,'shop_id',80),items,buyer,customer:recipient,payment_method:'REMITTANCE',points_used:points};
}
async function quote(db,user,input,env,pointService) {
  if(input.points_used&&!commercePointsEnabled(env,pointService))fail('線上點數折抵尚未完成開放，本次不會扣點');
  const shop=await q(db,`SELECT s.*,(EXISTS(SELECT 1 FROM users u WHERE u.line_id=s.owner_uid AND ${pickupRoleSql()})) AS can_pickup FROM store_shop_stores s WHERE s.id=? AND s.status='active' AND EXISTS(SELECT 1 FROM users u WHERE u.line_id=s.owner_uid AND ${retailRoleSql()})`,input.shop_id).first();
  if(!shop)fail('店家尚未開放',404);const config=await settings(db,shop.id);if(!config?.enabled)fail('店家尚未開放線上匯款下單',409);
  const pickup=input.customer.carrier==='PICKUP';
  if(pickup&&!shop.can_pickup)fail('折抵店家的到店取貨尚待確認，目前請選擇寄送方式',403);
  if(pickup&&(!String(shop.address||'').trim()||!String(shop.phone||'').trim()))fail('店家尚未完整設定自取地址與電話，請先選擇寄送方式',409);
  const products=(await q(db,`SELECT id,title,price_cents,version,redeem_type,redeem_value,shipping_fee_cents FROM store_shop_products WHERE shop_id=? AND status='active' AND purchase_mode='online' AND id IN (${input.items.map(()=>'?').join(',')})`,shop.id,...input.items.map(i=>i.id)).all()).results;
  if(products.length!==input.items.length)fail('商品限店內、已下架或不屬於此店，請重新選購',409);
  const items=input.items.map(item=>{const product=products.find(p=>p.id===item.id),unit=Math.floor(product.price_cents/100);
    const max=product.redeem_type==='full'?unit:product.redeem_type==='fixed'?Math.min(unit,product.redeem_value):product.redeem_type==='percent'?Math.min(unit,Math.floor(product.price_cents*product.redeem_value/10000)):0;
    return {...product,shipping_fee_cents:pickup?0:product.shipping_fee_cents,quantity:item.quantity,line_total_cents:product.price_cents*item.quantity,max_points:max*item.quantity,line_shipping_fee_cents:pickup?0:product.shipping_fee_cents==null?null:integer(product.shipping_fee_cents,1000000,'商品運費')*item.quantity};});
  const subtotal=items.reduce((sum,i)=>sum+i.line_total_cents,0);
  const legacyFee=!pickup&&items.some(i=>i.shipping_fee_cents==null)?(config.free_shipping_cents>0&&subtotal>=config.free_shipping_cents?0:config.shipping_fee_cents):0;
  const fee=legacyFee+items.reduce((sum,i)=>sum+(i.line_shipping_fee_cents??0),0);
  integer(subtotal+fee,100000000,'訂單金額',1);
  const maxPoints=items.reduce((sum,i)=>sum+i.max_points,0);
  if(input.points_used>maxPoints)fail('折抵點數超過商品上限，運費不可折抵');
  const wallet=input.points_used?await commerceWallet(pointService,user.line_id,env):null;
  if(wallet&&input.points_used>wallet.balance)fail('購物金不足，請減少折抵點數');
  const customer=pickup?{...input.customer,store_info:[shop.name,shop.address,shop.phone].join('｜'),pickup_shop_name:shop.name,pickup_address:shop.address,pickup_phone:shop.phone}:input.customer;
  const snapshot={shop_id:shop.id,shop_name:shop.name,shop_version:shop.version,settings_version:config.version,buyer_name:input.buyer.name,buyer:input.buyer,items,customer,payment_method:'REMITTANCE',points_used:input.points_used,max_points:maxPoints,discount_cents:input.points_used*100,subtotal_cents:subtotal,shipping_fee_cents:fee,legacy_shipping_fee_cents:legacyFee,total_cents:subtotal+fee-input.points_used*100,bank:{name:config.bank_name,code:config.bank_code,account:config.bank_account,holder:config.bank_holder}};
  return {snapshot,wallet,merchant_uid:shop.owner_uid,quote_hash:await hash({buyer:user.line_id,pointIdentity:wallet?.identity||'',snapshot})};
}
function publicOrder(row) {const {buyer_uid,request_hash,request_key,...order}=row;const snapshot=JSON.parse(order.snapshot_json);delete order.snapshot_json;return {...order,snapshot};}
async function orderFor(db,user,id,merchant) {
  const scope=merchant?'shop_id':'buyer_uid',owner=merchant?(await ownShop(db,user)).id:user.line_id;
  const order=await q(db,`SELECT * FROM store_commerce_orders WHERE id=? AND ${scope}=?`,id,owner).first();if(!order)fail('找不到訂單',404);return order;
}
async function createOrder(db,user,data,now,env,pointService) {
  const input=checkoutInput(data),key=uuid(data.request_key),requestHash=await hash(input);
  const previous=await q(db,'SELECT * FROM store_commerce_orders WHERE buyer_uid=? AND request_key=?',user.line_id,key).first();
  if(previous){if(previous.request_hash!==requestHash)fail('相同下單編號不可修改內容',409);return publicOrder(previous);}
  const priced=await quote(db,user,input,env,pointService);if(data.quote_hash!==priced.quote_hash)fail('價格、折抵、運費或收款資料已變更，請重新確認訂單',409);
  const s=priced.snapshot,id=crypto.randomUUID();
  // One conditional insert closes the race with product/settings updates.
  const guards=s.items.map(()=>"EXISTS(SELECT 1 FROM store_shop_products WHERE id=? AND shop_id=? AND version=? AND status='active' AND purchase_mode='online')").join(' AND ');
  const insert=q(db,`INSERT INTO store_commerce_orders(id,shop_id,buyer_uid,request_key,request_hash,snapshot_json,total_cents,created_at,updated_at,points_status)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM store_shop_stores s JOIN users u ON u.line_id=s.owner_uid WHERE s.id=? AND s.version=? AND s.status='active' AND ${retailRoleSql()}${s.customer.carrier==='PICKUP'?' AND '+pickupRoleSql():''})
    AND EXISTS(SELECT 1 FROM store_commerce_settings WHERE shop_id=? AND version=? AND enabled=1) AND ${guards}
    ON CONFLICT(buyer_uid,request_key) DO NOTHING`,id,s.shop_id,user.line_id,key,requestHash,JSON.stringify(s),s.total_cents,now,now,s.points_used?'pending':'none',s.shop_id,s.shop_version,s.shop_id,s.settings_version,...s.items.flatMap(i=>[i.id,s.shop_id,i.version]));
  if(s.points_used){try{await db.batch([insert,...pointLockStatements(db,{id,order_id:id,kind:'debit',buyer_uid:user.line_id,merchant_uid:priced.merchant_uid,operator_uid:user.line_id,point_identity:priced.wallet.identity,points:-s.points_used,now})]);}catch(error){pointLockError(error);}}
  else await insert.run();
  const stored=await q(db,'SELECT * FROM store_commerce_orders WHERE buyer_uid=? AND request_key=?',user.line_id,key).first();
  if(!stored)fail('商品或收款設定剛被更新，請重新確認',409);if(stored.request_hash!==requestHash)fail('相同下單編號不可修改內容',409);
  if(s.points_used&&stored.id===id){await executePointOperation(db,id,pointService,env);return publicOrder(await orderFor(db,user,id,false));}
  return publicOrder(stored);
}
async function refundPoints(db,user,order,key,requestHash,action,now,env,pointService) {
  requireCommercePointService(pointService);
  const debit=await q(db,"SELECT * FROM store_commerce_point_operations WHERE order_id=? AND kind='debit' AND status='succeeded'",order.id).first();
  if(!debit)fail('找不到已確認扣點紀錄，請人工查核',409);
  const id=crypto.randomUUID(),eventId=crypto.randomUUID();
  const op={id,order_id:order.id,kind:'refund',buyer_uid:order.buyer_uid,merchant_uid:debit.merchant_uid,operator_uid:user.line_id,point_identity:debit.point_identity,points:-debit.points,original_operation_id:debit.id,now};
  try {const results=await db.batch([
    q(db,`INSERT INTO store_commerce_events(id,order_id,actor_uid,request_key,request_hash,action,order_version,created_at)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM store_commerce_orders WHERE id=? AND version=? AND points_status='debited' AND payment_status=? AND fulfillment_status='unfulfilled') ON CONFLICT DO NOTHING`,eventId,order.id,user.line_id,key,requestHash,action,order.version+1,now,order.id,order.version,order.payment_status),
    q(db,`UPDATE store_commerce_orders SET points_status='refunding',version=version+1,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM store_commerce_events WHERE id=?)`,now,order.id,order.version,eventId),
    ...pointLockStatements(db,op)
  ]);if(results[1].meta.changes!==1){const duplicate=await q(db,'SELECT request_hash FROM store_commerce_events WHERE actor_uid=? AND request_key=?',user.line_id,key).first();if(!duplicate||duplicate.request_hash!==requestHash)fail('訂單已更新，請重新載入',409);return publicOrder(await orderFor(db,user,order.id,action==='refund'));}}
  catch(error){if(error instanceof CommerceError)throw error;pointLockError(error);}
  await executePointOperation(db,id,pointService,env);
  return publicOrder(await orderFor(db,user,order.id,action==='refund'));
}
async function transition(db,user,data,now,env,pointService) {
  const action=str(data,'action',30),merchant=['verify_remittance','ship','complete','refund'].includes(action);
  if(!['report_remittance','cancel','verify_remittance','ship','complete','refund'].includes(action))fail('不支援此訂單操作');
  const order=await orderFor(db,user,str(data,'order_id',80),merchant),key=uuid(data.request_key),version=integer(data.version,1000000000,'版本',1);
  const input={order_id:order.id,action,version};let set='',args=[];
  if(action==='report_remittance'){input.last5=str(data,'last5',5);if(!/^\d{5}$/.test(input.last5))fail('請填寫匯款帳號末五碼');}
  if(action==='verify_remittance'){input.received_cents=integer(data.received_cents,100000000,'實際入帳金額',1);if(data.confirmed!==true)fail('請確認已查核銀行實際入帳');input.confirmed=true;}
  const pickup=JSON.parse(order.snapshot_json).customer?.carrier==='PICKUP';
  if(action==='ship')input.tracking_number=pickup?'':str(data,'tracking_number',100);
  if(action==='complete'&&pickup){if(data.confirmed_pickup!==true)fail('請確認取貨人已領取本筆商品');input.confirmed_pickup=true;}
  if(action==='refund'){input.returned_cash_cents=integer(data.returned_cash_cents,100000000,'已退款金額');if(data.confirmed!==true)fail('請先確認已退還買家款項');input.confirmed=true;}
  const requestHash=await hash(input),previous=await q(db,'SELECT * FROM store_commerce_events WHERE actor_uid=? AND request_key=?',user.line_id,key).first();
  if(previous){if(previous.request_hash!==requestHash)fail('同一操作編號不可變更內容',409);return publicOrder(order);}
  if(version!==order.version)fail('訂單已更新，請重新載入',409);
  if(!['none','debited'].includes(order.points_status||'none'))fail('本筆扣點／退點結果待查核，不可付款、出貨或再次退點',409);
  if(action==='refund'){
    if(order.points_status!=='debited'||order.payment_status!=='paid'||order.fulfillment_status!=='unfulfilled'||input.returned_cash_cents!==order.received_cents)fail('僅本店已付款、未出貨且已全額退還款項的扣點訂單可退點',409);
    return refundPoints(db,user,order,key,requestHash,action,now,env,pointService);
  }
  if(action==='report_remittance') {
    if(!['pending','reported'].includes(order.payment_status))fail('此訂單不可回報匯款',409);
    set="payment_status='reported',remittance_last5=?,remittance_reported_at=?";args=[input.last5,now];
  } else if(action==='cancel') {
    if(order.payment_status!=='pending')fail('已回報匯款或已付款的訂單，須聯絡店家處理，不會自動退款',409);set="payment_status='cancelled'";
    if(order.points_status==='debited')return refundPoints(db,user,order,key,requestHash,action,now,env,pointService);
  } else if(action==='verify_remittance') {
    if(order.payment_status!=='reported')fail('訂單須先回報匯款才可核帳',409);
    if(input.received_cents!==order.total_cents)fail('入帳金額不符，請人工核對；不可標記已付款',409);
    set="payment_status='paid',received_cents=?,paid_at=?";args=[input.received_cents,now];
  } else if(action==='ship') {
    if(order.payment_status!=='paid'||order.fulfillment_status!=='unfulfilled')fail(pickup?'僅已付款且未備妥的訂單可通知取貨':'僅已付款且未出貨的訂單可出貨',409);
    set="fulfillment_status='shipped',tracking_number=?,shipped_at=?";args=[input.tracking_number,now];
  } else {
    if(order.payment_status!=='paid'||order.fulfillment_status!=='shipped')fail(pickup?'僅已備妥待取貨訂單可確認已取貨':'僅已出貨訂單可標記完成',409);
    set="fulfillment_status='completed',completed_at=?";args=[now];
  }
  const eventId=crypto.randomUUID();
  // D1 transactional batch: audit CAS and update succeed or roll back together.
  const results=await db.batch([
    q(db,`INSERT INTO store_commerce_events(id,order_id,actor_uid,request_key,request_hash,action,order_version,created_at)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM store_commerce_orders WHERE id=? AND version=? AND points_status IN ('none','debited')) ON CONFLICT DO NOTHING`,eventId,order.id,user.line_id,key,requestHash,action,version+1,now,order.id,version),
    q(db,`UPDATE store_commerce_orders SET ${set},version=version+1,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM store_commerce_events WHERE id=?)`,...args,now,order.id,version,eventId)
  ]);
  if(!results[1].meta.changes){const duplicate=await q(db,'SELECT request_hash FROM store_commerce_events WHERE actor_uid=? AND request_key=?',user.line_id,key).first();if(!duplicate||duplicate.request_hash!==requestHash)fail('訂單已更新，請重新載入',409);}
  return publicOrder(await orderFor(db,user,order.id,merchant));
}
export async function handleStoreCommerce(request,env,fetcher=fetch,pointService=null) {
  const url=new URL(request.url);if(url.pathname!==root&&!url.pathname.startsWith(root+'/'))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const path=url.pathname.slice(root.length),enabled=env.STORE_COMMERCE_ENABLED==='true';
  try {
    if(path==='/capabilities'&&request.method==='GET')return reply({success:true,enabled,payments:enabled?['REMITTANCE']:[],points_enabled:enabled&&commercePointsEnabled(env,pointService),linepay_enabled:false});
    const db=env.ACTMASTER_DB,user=await actor(request,db,fetcher);
    if(path==='/wallet'&&request.method==='GET'){
      if(!enabled||!commercePointsEnabled(env,pointService))fail('線上點數折抵尚未完成開放',503);
      const wallet=await commerceWallet(pointService,user.line_id,env);return reply({success:true,balance:wallet.balance});
    }
    // Private account data is independent of whether order creation is enabled.
    if(path==='/buyer-profile'){
      if(request.method==='GET')return reply({success:true,profile:await readBuyerProfile(db,user.line_id)});
      if(request.method!=='POST')fail('不支援的操作',405);
      return reply({success:true,profile:await saveBuyerProfile(db,user.line_id,await json(request))});
    }
    if(path==='/settings') {
      const shop=await ownShop(db,user);if(request.method==='GET')return reply({success:true,release_enabled:enabled,cooperation_plan:storePlanForRole(user.role),settings:(await settings(db,shop.id))||defaults});
      if(request.method!=='POST')fail('不支援的操作',405);
      const data=await json(request),value=settingsInput(data),version=integer(data.version,1000000000,'版本'),now=new Date().toISOString();let result;
      const gate=`EXISTS(SELECT 1 FROM store_shop_stores s JOIN users u ON u.line_id=s.owner_uid WHERE s.id=? AND s.owner_uid=? AND u.role IS ? AND ${retailRoleSql()})`;
      if(version===0)result=await q(db,`INSERT INTO store_commerce_settings(shop_id,enabled,bank_name,bank_code,bank_account,bank_holder,shipping_fee_cents,free_shipping_cents,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${gate} ON CONFLICT(shop_id) DO NOTHING`,shop.id,...Object.values(value),now,shop.id,user.line_id,user.role).run();
      else result=await q(db,`UPDATE store_commerce_settings SET enabled=?,bank_name=?,bank_code=?,bank_account=?,bank_holder=?,shipping_fee_cents=?,free_shipping_cents=?,version=version+1,updated_at=? WHERE shop_id=? AND version=? AND ${gate}`,...Object.values(value),now,shop.id,version,shop.id,user.line_id,user.role).run();
      if(!result.meta.changes)fail('收款設定已更新，請重新載入後再編輯',409);
      return reply({success:true,release_enabled:enabled,cooperation_plan:storePlanForRole(user.role),settings:await settings(db,shop.id)});
    }
    // Keep order history available when checkout is paused.
    if(request.method==='GET'&&path==='/orders/lookup') {
      const key=uuid(url.searchParams.get('request_key'));
      const order=await q(db,'SELECT * FROM store_commerce_orders WHERE buyer_uid=? AND request_key=?',user.line_id,key).first();
      return reply({success:true,order:order?publicOrder(await reconcilePointOrder(db,order,pointService,env)):null});
    }
    if(request.method==='GET'&&path==='/orders') {
      const merchant=url.searchParams.get('scope')==='merchant',scope=merchant?'shop_id':'buyer_uid',id=merchant?(await ownShop(db,user)).id:user.line_id;
      const page=Number(url.searchParams.get('page')||0);integer(page,10000,'頁碼');
      const rows=(await q(db,`SELECT * FROM store_commerce_orders WHERE ${scope}=? ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?`,id,page*20).all()).results;
      return reply({success:true,orders:rows.slice(0,20).map(publicOrder),has_more:rows.length>20,page});
    }
    if(request.method==='POST'&&path==='/orders/reconcile'){
      const data=await json(request),order=await orderFor(db,user,str(data,'order_id',80),data.scope==='merchant');
      return reply({success:true,order:publicOrder(await reconcilePointOrder(db,order,pointService,env))});
    }
    if(!enabled)fail('線上交易尚未開放；不會建立訂單或扣點',503);
    if(request.method!=='POST')fail('不支援的操作',404);
    const data=await json(request),now=new Date().toISOString();
    if(path==='/quote'){const result=await quote(db,user,checkoutInput(data),env,pointService);return reply({success:true,snapshot:result.snapshot,quote_hash:result.quote_hash});}
    if(path==='/orders')return reply({success:true,order:await createOrder(db,user,data,now,env,pointService)});
    if(path==='/orders/action')return reply({success:true,order:await transition(db,user,data,now,env,pointService)});
    fail('不支援的操作',404);
  } catch(error) {
    if(error instanceof CommerceError||error instanceof BuyerProfileError||error instanceof CommercePointError)return reply({success:false,error:error.message},error.status);
    const missing=/no such table/.test(String(error?.message));console.error(JSON.stringify({event:'store_commerce_failed',code:missing?'SCHEMA_NOT_READY':'UNAVAILABLE'}));
    return reply({success:false,error:missing?'線上商城尚未完成資料庫更新':'操作結果未確認，請重新查詢原訂單，勿重複付款'},503);
  }
}
