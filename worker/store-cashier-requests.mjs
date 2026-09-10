// At-most-once shared cashier boundary. Unknown external writes are never retried.
const validId = v => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail = error => ({success:false,error});
const actor = p => String(p.authenticatedUserId||'').trim();
const pending = id => ({success:false,error:'交易處理中或結果待核對，請查詢原交易，勿重新扣點。',transactionId:id,transactionStatus:'unknown'});
const resultOf = r => r.result_json?JSON.parse(r.result_json):pending(r.request_id);
const find = (db,a,id) => db.prepare('SELECT * FROM store_cashier_requests WHERE actor_id=? AND request_id=?').bind(a,id).first();

export async function getCashierRequest(p,env) {
 if(!actor(p)||!validId(p.requestId)) return fail('交易編號不正確');
 const row=await find(env.ACTMASTER_DB,actor(p),p.requestId);
 return row?resultOf(row):{success:false,error:'尚未找到此交易，可使用原編號重送。',transactionStatus:'not_found',transactionId:p.requestId};
}
export async function getRedemptionProduct(p,env) {
 if(!validId(p.productId)||!actor(p)) return fail('商品編號不正確或尚未登入');
 const row=await env.ACTMASTER_DB.prepare(`SELECT p.*,s.version AS shop_version,s.name AS shop_name
 FROM store_shop_products p JOIN store_shop_stores s ON s.id=p.shop_id JOIN users u ON u.line_id=s.owner_uid
 WHERE p.id=? AND s.owner_uid=? AND p.status='active' AND s.status='active'
 AND lower(u.role) IN ('store','tenant','admin','店長','租戶','總管')`).bind(p.productId,actor(p)).first();
 if(!row) return fail('商品已下架、店面未公開，或不是您管理的商品');
 if(!Number.isSafeInteger(row.price_cents)||row.price_cents<=0||row.price_cents%100!==0) return fail('目前商品收銀僅支援正整數元價格，請先調整商品價格');
 const amount=row.price_cents/100;
 const maxPoints=row.redeem_type==='fixed'?Math.min(amount,row.redeem_value):row.redeem_type==='percent'?Math.floor(amount*row.redeem_value/100):row.redeem_type==='full'?amount:0;
 return {success:true,data:{productId:p.productId,title:row.title,shopName:row.shop_name,amount,maxPoints,productVersion:row.version,shopVersion:row.shop_version}};
}
async function run(p,env,resolveCustomer,execute) {
 const a=actor(p),id=p.requestId,db=env.ACTMASTER_DB;
 if(!a||!validId(id)) return fail('請更新頁面後再操作（缺少有效交易編號）');
 const mode=p.mode,amount=Number(p.amount),deductPoints=Number(p.deductPoints||0),raw=String(p.customerUserId||'').trim();
 if(!['reward','redeem'].includes(mode)||!Number.isSafeInteger(amount)||amount<=0||amount>1000000||!Number.isSafeInteger(deductPoints)||deductPoints<0||
 (mode==='redeem'&&(deductPoints<=0||deductPoints>amount))||!raw||raw.length>100) return fail('顧客、金額或折抵點數不正確');
 const fingerprint=JSON.stringify({raw,amount,deductPoints,mode,autoBind:p.autoBindPointAccount===true,productId:p.productId||'',productVersion:p.productVersion??null,shopVersion:p.shopVersion??null});
 const previous=await find(db,a,id);
 if(previous) return previous.fingerprint===fingerprint?resultOf(previous):fail('同一交易編號不可變更內容');
 let product=null;
 if(p.productId) {
  const check=await getRedemptionProduct(p,env); if(!check.success) return check; product=check.data;
  if(mode!=='redeem'||amount!==product.amount||deductPoints>product.maxPoints||product.productVersion!==p.productVersion||product.shopVersion!==p.shopVersion)
   return fail('商品價格、版本或折抵上限已改變，請重新開啟商品確認');
 }
 const resolved=await resolveCustomer(raw),customer=resolved?.customerPointUserId;
 if(resolved?.error||!/^U[0-9a-fA-F]{20,64}$/.test(customer||'')) return fail(resolved?.error||'無法辨識顧客點數帳戶');
 try {await db.prepare("INSERT INTO store_cashier_requests(actor_id,request_id,customer_id,fingerprint,status) VALUES(?,?,?,?,'pending')").bind(a,id,customer,fingerprint).run();}
 catch(error) {
  const same=await find(db,a,id);
  if(same) return same.fingerprint===fingerprint?resultOf(same):fail('同一交易編號不可變更內容');
  if(/UNIQUE/.test(String(error.message))) return fail('此顧客尚有未完成交易，請先查單核對，不可再次扣點');
  throw error;
 }
 let attempted=false;
 const save=async(state,output)=>db.prepare('UPDATE store_cashier_requests SET status=?,result_json=?,updated_at=CURRENT_TIMESTAMP WHERE actor_id=? AND request_id=?').bind(state,JSON.stringify(output),a,id).run();
 try {
  const beforeWrite=async(actualCustomer=customer)=>{
   if(actualCustomer!==customer) throw Error('點數身分已改變，請重新確認顧客');
   if(product) {const check=await getRedemptionProduct(p,env);if(!check.success||JSON.stringify(check.data)!==JSON.stringify(product)) throw Error('商品已更新，尚未扣點，請重新確認');}
   const change=await db.prepare("UPDATE store_cashier_requests SET status='sending',updated_at=CURRENT_TIMESTAMP WHERE actor_id=? AND request_id=? AND status='pending'").bind(a,id).run();
   if(change.meta.changes!==1) throw Error('交易狀態已改變');
   attempted=true;
  };
  const result=await execute({authenticatedUserId:a,authenticatedNetworkId:p.authenticatedNetworkId,
    customerUserId:customer,amount,deductPoints,mode,autoBindPointAccount:p.autoBindPointAccount===true,
    cashierSessionId:'',transactionId:id},beforeWrite,product);
  const state=result?.success===true?'succeeded':attempted?'unknown':'failed';
  const output={...(state==='unknown'?pending(id):result),transactionId:id,transactionStatus:state};
  await save(state,output);return output;
 }catch(error){
  const state=attempted?'unknown':'failed';
  const output={...(attempted?pending(id):fail('尚未送出點數：'+error.message)),transactionId:id,transactionStatus:state};
  await save(state,output).catch(()=>null);return output;
 }
}
export async function runCashierRequest(p,env,resolveCustomer,execute) {
 const result=await run(p,env,resolveCustomer,execute);
 return result.transactionStatus?result:{...result,transactionStatus:'rejected'};
}
