// Online-only adapter. Generic mother inserts are NOT atomic or idempotent.
// Callers must persist sending first and must never repeat an ambiguous write.
const uid=v=>typeof v==='string'&&/^U[0-9a-f]{20,64}$/i.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const integer=v=>typeof v==='number'&&Number.isSafeInteger(v)?v:typeof v==='string'&&/^-?\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):null;
export const commerceMarker=o=>`網購訂單：${o.order_id}；交易：${o.id}${o.kind==='refund'?`；原扣點：${o.original_operation_id}`:''}`;
export function createCommercePointService(points,fetcher=fetch) {
  async function page(identity,env,pageNumber,signal){
    const key=points.pointApiKey(env);if(!key||!uid(identity))throw Error('COMMERCE_MOTHER_UNAVAILABLE');
    const response=await fetcher(points.apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},signal,
      body:JSON.stringify({api_key:key,LINE_user_id:identity,page:pageNumber,per_page:100,point_type:'gift_money'})});
    const data=await response.json();
    if(!response.ok||data?.success!==true||!Array.isArray(data.data?.list))throw Error('COMMERCE_MOTHER_UNAVAILABLE');
    return data.data;
  }
  function latest(rows){
    if(!rows.length)return null;
    if(rows.some(r=>r.point_type!=='gift_money'||integer(r.id)===null||integer(r.point_balance)===null))throw Error('COMMERCE_MOTHER_INVALID_LEDGER');
    return rows.slice().sort((a,b)=>integer(b.id)-integer(a.id))[0];
  }
  async function lookup(o,env){
    const identity=await points.resolvePointUserId(env,o.buyer_uid);
    if(identity!==o.point_identity||!uuid(o.id)||!uuid(o.order_id)||(o.kind==='refund'&&!uuid(o.original_operation_id)))throw Error('COMMERCE_IDENTITY_CHANGED');
    const signal=AbortSignal.timeout(12000),first=await page(identity,env,1,signal),newest=latest(first.list);
    const count=integer(first.pagination?.total_pages);
    if(count===null||count<0||count>20||(first.list.length&&count<1))throw Error('COMMERCE_RECONCILE_LIMIT');
    const rows=first.list.slice();
    // Complete the bounded ledger before judging uniqueness. Never infer failure
    // from an empty search, and never use locally enriched/display-only rows.
    for(let n=2;n<=count;n++)rows.push(...(await page(identity,env,n,signal)).list);
    const matches=rows.filter(r=>String(r.event_content||'')===commerceMarker(o));
    if(matches.length!==1)return null;
    const row=matches[0],id=integer(row.id),after=integer(row.point_balance),amount=integer(row.get_point);
    if(id===null||id<=0||after===null||amount!==o.points||row.point_type!=='gift_money'
      ||!Number.isSafeInteger(after-o.points)||(o.points<0&&(after<0||!newest||integer(newest.point_balance)<0))
      ||(row.LINE_user_id!==undefined&&row.LINE_user_id!==identity)
      ||(o.mother_receipt_id&&String(id)!==String(o.mother_receipt_id)))return null;
    return {success:true,source:'mother',operation_id:o.id,order_id:o.order_id,point_identity:identity,point_type:'gift_money',kind:o.kind,points:o.points,
      balance_before:after-o.points,balance_after:after,mother_receipt_id:String(id),event_content:commerceMarker(o),
      ...(o.kind==='refund'?{original_operation_id:o.original_operation_id}:{})};
  }
  return {
    contract:{version:'commerce-ledger-v1',rawLedgerVerification:true,atMostOnceCallerRequired:true},
    async read(buyer,env){
      const identity=await points.resolvePointUserId(env,buyer);if(!uid(identity))throw Error('COMMERCE_IDENTITY_CHANGED');
      const data=await page(identity,env,1,AbortSignal.timeout(8000)),row=latest(data.list);
      if(!row&&integer(data.pagination?.total)!==0)throw Error('COMMERCE_MOTHER_INVALID_LEDGER');
      return {identity,balance:row?integer(row.point_balance):0};
    },
    lookup,
    async adjust(o,env){
      if(!uuid(o.id)||!uuid(o.order_id)||!uid(o.point_identity)||!Number.isSafeInteger(o.points)||!o.points
        ||!['debit','refund'].includes(o.kind)||(o.kind==='debit'&&o.points>=0)||(o.kind==='refund'&&(!uuid(o.original_operation_id)||o.points<=0)))throw Error('COMMERCE_OPERATION_INVALID');
      let receiptId=null;
      try{
        const result=await points.insertUserPoint({LINE_user_id:o.point_identity,point_type:'gift_money',get_point:o.points,
          event_name:o.kind==='debit'?'網購訂單購物金折抵':'網購訂單取消退點',event_content:commerceMarker(o),
          shop_user_lineid:o.merchant_uid,child_shop_name:'LINE 網購訂單',shop_remark:o.order_id,
          skipMotherMemberSetup:true,requireConfirmedResult:true},env);
        // Observed on the user's authorised -1/+1 test, not a fabricated API.
        const raw=result?.data?.data?.insert_id;
        if(raw!==undefined){receiptId=integer(raw);if(receiptId===null||receiptId<=0)return null;}
      }catch{ /* response may be lost AFTER mother commits: read only, never retry */ }
      return lookup({...o,...(receiptId?{mother_receipt_id:String(receiptId)}:{})},env);
    }
  };
}
