import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommercePointService,commerceMarker} from '../worker/store-commerce-mother.mjs';
import {readFileSync} from 'node:fs';
const buyer='U'+'a'.repeat(32),identity='U'+'b'.repeat(32),merchant='U'+'c'.repeat(32);
function fixture(){
  const state={identity,rows:[],inserts:[],raw:{success:true,data:{success:true,data:{insert_id:123}}},queryHook:null,insertHook:null};
  const points={apiUrl:'https://mother.invalid/query',pointApiKey:()=> 'synthetic-key',resolvePointUserId:async()=>state.identity,
    async insertUserPoint(payload,env){state.inserts.push(payload);assert.equal(env.test,true);if(state.insertHook)return state.insertHook(payload);return state.raw;}};
  const service=createCommercePointService(points,async(url,options)=>{
    assert.equal(url,points.apiUrl);const body=JSON.parse(options.body);
    assert.equal(body.LINE_user_id,identity);assert.equal(body.point_type,'gift_money');assert.equal(body.api_key,'synthetic-key');
    assert(options.signal instanceof AbortSignal);
    if(state.queryHook)return state.queryHook(body);
    return Response.json({success:true,data:{list:state.rows,pagination:{total:state.rows.length,total_pages:1}}});
  });
  const op={id:crypto.randomUUID(),order_id:crypto.randomUUID(),kind:'debit',buyer_uid:buyer,point_identity:identity,merchant_uid:merchant,points:-10};
  const row=(o=op)=>({id:'123',LINE_user_id:identity,point_type:'gift_money',get_point:String(o.points),point_balance:'90',event_content:commerceMarker(o)});
  return {service,state,op,row};
}
test('thin production bridge does not change protected cashier or identity implementation',()=>{
  const source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
  assert(source.includes('export const storeCommercePointService = createCommercePointService(PointModule)'));
  const entry=readFileSync(new URL('../worker-entry.mjs',import.meta.url),'utf8');
  assert(entry.includes('handleStoreCommerce(request, env, fetch, storeCommercePointService)'));
});
test('only strict raw mother ledger can produce a wallet; empty/malformed errors never become zero',async()=>{
  const f=fixture();f.state.rows=[f.row()];assert.deepEqual(await f.service.read(buyer,{}),{identity,balance:90});
  for(const payload of [{success:false,data:{list:[],pagination:{total:0}}},{success:true,data:{}},{success:true,data:{list:[],pagination:{total:1}}},
    {success:true,data:{list:[{...f.row(),point_balance:''}]}},{success:true,data:{list:[{...f.row(),point_type:'system_point'}]}},
    {success:true,data:{list:[{...f.row(),point_balance:'1.5'}]}}]){
    f.state.queryHook=()=>Response.json(payload);await assert.rejects(f.service.read(buyer,{}));
  }
  f.state.queryHook=null;f.state.rows=[];assert.equal((await f.service.read(buyer,{})).balance,0);
});
test('observed nested insert receipt is verified against exact raw mother record, not bare success',async()=>{
  const f=fixture();f.state.rows=[f.row()];const result=await f.service.adjust(f.op,{test:true});
  assert.equal(result.mother_receipt_id,'123');assert.equal(result.balance_before,100);assert.equal(result.balance_after,90);
  assert.equal(result.source,'mother');assert.equal(f.state.inserts.length,1);
  const p=f.state.inserts[0];assert.equal(p.LINE_user_id,identity);assert.equal(p.get_point,-10);assert.equal(p.requireConfirmedResult,true);assert.equal(p.skipMotherMemberSetup,true);
  assert.equal(p.event_content,commerceMarker(f.op));assert(!('idempotency_key' in p));assert(!('balance' in p));
  f.state.rows=[];assert.equal(await f.service.adjust(f.op,{test:true}),null);
});
test('wrong receipt, identity, currency, amount, negative balance, duplicate marker or imprecise marker fail closed',async()=>{
  for(const mutate of [r=>[{...r,id:'124'}],r=>[{...r,LINE_user_id:merchant}],r=>[{...r,point_type:'system_point'}],r=>[{...r,get_point:'10'}],
    r=>[{...r,point_balance:'-1'}],r=>[r,{...r,id:'124'}],r=>[{...r,event_content:r.event_content+'1'}]]){
    const f=fixture();f.state.rows=mutate(f.row());
    const result=await f.service.adjust(f.op,{test:true}).catch(e=>{assert.match(e.message,/COMMERCE_MOTHER/);return null;});assert.equal(result,null);
    assert.equal(f.state.inserts.length,1);
  }
});
test('lost insert response is reconciled read-only; lookup never posts an insert',async()=>{
  const f=fixture();f.state.rows=[f.row()];f.state.insertHook=()=>{throw Error('response lost after commit');};
  assert.equal((await f.service.adjust(f.op,{test:true})).mother_receipt_id,'123');
  await f.service.lookup(f.op,{});await f.service.lookup(f.op,{});assert.equal(f.state.inserts.length,1);
  f.state.rows=[];assert.equal(await f.service.lookup(f.op,{}),null);assert.equal(f.state.inserts.length,1);
});
test('all bounded raw pages are checked for uniqueness; missing pages or oversized history cannot unlock',async()=>{
  const f=fixture();f.state.queryHook=body=>Response.json({success:true,data:{list:body.page===1?[f.row()]:[{...f.row(),id:'124'}],pagination:{total:2,total_pages:2}}});
  assert.equal(await f.service.lookup(f.op,{}),null);
  f.state.queryHook=body=>body.page===2?new Response('',{status:503}):Response.json({success:true,data:{list:[f.row()],pagination:{total_pages:2}}});
  await assert.rejects(f.service.lookup(f.op,{}));
  f.state.queryHook=()=>Response.json({success:true,data:{list:[f.row()],pagination:{total_pages:21}}});await assert.rejects(f.service.lookup(f.op,{}),/COMMERCE_RECONCILE_LIMIT/);
});
test('refund ledger marker links its original debit, with no fabricated refund API',async()=>{
  const f=fixture();const o={...f.op,id:crypto.randomUUID(),kind:'refund',points:10,original_operation_id:f.op.id};
  f.state.rows=[{...f.row(o),point_balance:'100'}];const r=await f.service.adjust(o,{test:true});
  assert.equal(r.original_operation_id,f.op.id);assert.equal(r.balance_before,90);assert.equal(r.balance_after,100);
  assert.equal(f.state.inserts[0].event_content,commerceMarker(o));
  await assert.rejects(f.service.adjust({...o,original_operation_id:''},{test:true}),/COMMERCE_OPERATION_INVALID/);
});
