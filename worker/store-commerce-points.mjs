// Online-only state machine; never calls or changes the cashier/session handler.
// Shared unique customer lock prevents parallel LINE- cashier/online writes.
import {commerceMarker} from './store-commerce-mother.mjs';
import {storePlanForRole,retailRoleSql,pickupRoleSql} from '../js/modules/store-cooperation-plans.mjs';
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
export class CommercePointError extends Error {constructor(message,status=409){super(message);this.status=status;}}
export const commercePointServiceReady=service=>service?.contract?.version==='commerce-ledger-v1'
  &&service.contract.rawLedgerVerification===true&&service.contract.atMostOnceCallerRequired===true
  &&typeof service.read==='function'&&typeof service.adjust==='function'&&typeof service.lookup==='function';
export const commercePointsEnabled=(env,service)=>env.STORE_COMMERCE_POINTS_ENABLED==='true'&&commercePointServiceReady(service);
const reject=(message,status)=>{throw new CommercePointError(message,status);};
export function requireCommercePointService(service) {
  if(!commercePointServiceReady(service))reject('母站網購扣點／退點安全介面尚未驗證，本次不會異動點數',503);
}
export function confirmedCommercePointReceipt(result,o) {
  if(result?.success!==true||result.operation_id!==o.id||result.order_id!==o.order_id
    ||result.point_identity!==o.point_identity||result.point_type!=='gift_money'
    ||result.kind!==o.kind||result.points!==o.points||result.source!=='mother'
    ||!/^\d+$/.test(result.mother_receipt_id||'')||!Number.isSafeInteger(Number(result.mother_receipt_id))||Number(result.mother_receipt_id)<=0
    ||result.event_content!==commerceMarker(o)
    ||(o.mother_receipt_id&&result.mother_receipt_id!==o.mother_receipt_id)
    ||!Number.isSafeInteger(result.balance_before)||!Number.isSafeInteger(result.balance_after)
    ||!Number.isSafeInteger(result.balance_before+o.points)||result.balance_after!==result.balance_before+o.points
    ||(o.points<0&&result.balance_after<0))return false;
  return o.kind!=='refund'||(typeof o.original_operation_id==='string'&&o.original_operation_id.length>0
    &&result.original_operation_id===o.original_operation_id);
}
export async function commerceWallet(service,buyer,env) {
  requireCommercePointService(service);
  let wallet;try{wallet=await service.read(buyer,env);}catch{reject('購物金暫時無法讀取，本次未扣點',503);}
  if(!wallet||!/^U[0-9a-f]{20,64}$/i.test(wallet.identity||'')||!Number.isSafeInteger(wallet.balance))reject('購物金暫時無法讀取，本次未扣點',503);
  return wallet;
}
export function pointLockStatements(db,operation) {
  const o=operation;
  return [
    q(db,`INSERT INTO store_commerce_point_operations(id,order_id,kind,buyer_uid,merchant_uid,operator_uid,point_identity,points,created_at,updated_at,original_operation_id)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM store_commerce_orders WHERE id=? AND points_status=?)
      ON CONFLICT(order_id,kind) DO NOTHING`,o.id,o.order_id,o.kind,o.buyer_uid,o.merchant_uid,o.operator_uid,o.point_identity,o.points,o.now,o.now,o.original_operation_id||null,o.order_id,o.kind==='debit'?'pending':'refunding'),
    // Do not swallow a conflict on customer_id: the entire order batch rolls back.
    q(db,`INSERT INTO store_cashier_requests(actor_id,request_id,customer_id,fingerprint,status)
      SELECT merchant_uid,id,point_identity,?,'pending' FROM store_commerce_point_operations WHERE id=?
      ON CONFLICT(actor_id,request_id) DO NOTHING`,JSON.stringify({commerceOrder:o.order_id,kind:o.kind,points:o.points}),o.id)
  ];
}
export function pointLockError(error) {
  if(/UNIQUE.*(customer_id|store_cashier_one_open_customer)/i.test(String(error?.message)))reject('購物金尚有一筆交易待確認，請先查核原交易，勿重複扣點');
  throw error;
}
async function finish(db,o,status,now,balance=null,receipt=null) {
  const success=status==='succeeded',debit=o.kind==='debit';
  const state=success?(debit?'debited':'refunded'):(status==='failed'?'failed':debit?'unknown':'refund_unknown');
  const results=await db.batch([
    q(db,`UPDATE store_commerce_point_operations SET status=?,balance_before=?,balance_after_estimate=?,mother_receipt_id=?,receipt_json=?,updated_at=? WHERE id=? AND status IN ('pending','sending','unknown')
      AND EXISTS(SELECT 1 FROM store_commerce_orders WHERE id=? AND points_status IN (?,?))
      AND EXISTS(SELECT 1 FROM store_cashier_requests WHERE actor_id=? AND request_id=? AND customer_id=? AND status IN ('pending','sending','unknown'))`,status,balance,success&&balance!==null?balance+o.points:null,receipt?.mother_receipt_id||null,receipt?JSON.stringify(receipt):null,now,o.id,o.order_id,debit?'pending':'refunding',debit?'unknown':'refund_unknown',o.merchant_uid,o.id,o.point_identity),
    q(db,`UPDATE store_commerce_orders SET points_status=?,
      payment_status=CASE WHEN ?=1 THEN 'cancelled' WHEN ?=1 AND total_cents=0 THEN 'paid' ELSE payment_status END,
      paid_at=CASE WHEN ?=1 AND total_cents=0 THEN ? ELSE paid_at END,
      version=version+1,updated_at=? WHERE id=? AND points_status IN (?,?)
      AND EXISTS(SELECT 1 FROM store_commerce_point_operations WHERE id=? AND status=? AND updated_at=?)`,state,Number((success&&!debit)||status==='failed'),Number(success&&debit),Number(success&&debit),now,now,o.order_id,debit?'pending':'refunding',debit?'unknown':'refund_unknown',o.id,status,now),
    q(db,`UPDATE store_cashier_requests SET status=?,result_json=?,updated_at=? WHERE actor_id=? AND request_id=? AND EXISTS(SELECT 1 FROM store_commerce_point_operations WHERE id=? AND status=?) AND EXISTS(SELECT 1 FROM store_commerce_orders WHERE id=? AND points_status=?)`,status,JSON.stringify({success,transactionStatus:status,transactionId:o.id,source:'store_commerce'}),now,o.merchant_uid,o.id,o.id,status,o.order_id,state)
  ]);
  if(results[1].meta.changes!==1){
    const current=await q(db,'SELECT status FROM store_commerce_point_operations WHERE id=?',o.id).first();
    if(current?.status!==status)throw Error('COMMERCE_POINT_FINALIZE_UNCONFIRMED');
  }
}
export async function executePointOperation(db,id,service,env) {
  const o=await q(db,'SELECT * FROM store_commerce_point_operations WHERE id=?',id).first();
  if(!o||o.status!=='pending')return; // no retry of pending in a different request or any external write
  let wallet,pickupDebit=false;
  try {
    wallet=await commerceWallet(service,o.buyer_uid,env);
    if(wallet.identity!==o.point_identity)reject('會員購物金身分已變更');
    if(o.points<0&&wallet.balance<-o.points)reject('購物金不足');
    const owner=await q(db,`SELECT s.owner_uid,u.role,c.snapshot_json FROM store_commerce_orders c JOIN store_shop_stores s ON s.id=c.shop_id JOIN users u ON u.line_id=s.owner_uid WHERE c.id=?`,o.order_id).first();
    if(owner?.owner_uid!==o.merchant_uid||!storePlanForRole(owner.role).canOnline)reject('店家權限已變更');
    pickupDebit=o.kind==='debit'&&JSON.parse(owner.snapshot_json).customer?.carrier==='PICKUP';
    if(pickupDebit&&!storePlanForRole(owner.role).canPickup)reject('到店取貨資格已變更');
    if(o.kind==='refund'){
      const debit=await q(db,"SELECT * FROM store_commerce_point_operations WHERE order_id=? AND kind='debit' AND status='succeeded'",o.order_id).first();
      if(!debit||debit.id!==o.original_operation_id||debit.buyer_uid!==o.buyer_uid||debit.point_identity!==o.point_identity||debit.points!==-o.points
        ||!confirmedCommercePointReceipt(await service.lookup(debit,env),debit))reject('原始扣點紀錄不一致');
    }
  }catch {
    // For refunds preflight failure keeps cancellation locked for manual resolution,
    // not a falsely cancelled order or permission to submit a second refund.
    await finish(db,o,o.kind==='debit'?'failed':'unknown',new Date().toISOString());return;
  }
  const sendingAt=new Date().toISOString();
  const claimed=await db.batch([
    q(db,`UPDATE store_commerce_point_operations SET status='sending',balance_before=?,updated_at=? WHERE id=? AND status='pending'
      AND EXISTS(SELECT 1 FROM store_cashier_requests WHERE actor_id=? AND request_id=? AND customer_id=? AND status='pending')
      AND EXISTS(SELECT 1 FROM store_commerce_orders c JOIN store_shop_stores s ON s.id=c.shop_id JOIN users u ON u.line_id=s.owner_uid
        WHERE c.id=? AND s.owner_uid=? AND ${retailRoleSql()}${pickupDebit?' AND '+pickupRoleSql():''})`,wallet.balance,sendingAt,id,o.merchant_uid,id,o.point_identity,o.order_id,o.merchant_uid),
    q(db,`UPDATE store_cashier_requests SET status='sending',updated_at=? WHERE actor_id=? AND request_id=? AND customer_id=? AND status='pending'
      AND EXISTS(SELECT 1 FROM store_commerce_point_operations WHERE id=? AND status='sending' AND updated_at=?)`,sendingAt,o.merchant_uid,id,o.point_identity,id,sendingAt)
  ]);
  if(claimed[0].meta.changes!==1||claimed[1].meta.changes!==1)return;
  // Both durable sending records are committed before the external call.
  let result,confirmed=false;
  try {
    requireCommercePointService(service);
    result=await service.adjust({...o,identity:o.point_identity},env);
    confirmed=confirmedCommercePointReceipt(result,o);
  }catch{ /* ambiguous, do not retry */ }
  await finish(db,o,confirmed?'succeeded':'unknown',new Date().toISOString(),confirmed?result.balance_before:wallet.balance,confirmed?result:null);
}

export async function reconcilePointOrder(db,order,service,env){
  if(!commercePointServiceReady(service)||!['pending','unknown','refunding','refund_unknown'].includes(order.points_status))return order;
  const o=await q(db,"SELECT * FROM store_commerce_point_operations WHERE order_id=? AND status IN ('sending','unknown') ORDER BY created_at DESC LIMIT 1",order.id).first();
  if(!o)return order; // Pending is not evidence that any external call happened.
  try{
    const receipt=await service.lookup(o,env);
    if(confirmedCommercePointReceipt(receipt,o))await finish(db,o,'succeeded',new Date().toISOString(),receipt.balance_before,receipt);
  }catch{ /* A failed read never unlocks, compensates or retries a write. */ }
  return await q(db,'SELECT * FROM store_commerce_orders WHERE id=?',order.id).first()||order;
}
