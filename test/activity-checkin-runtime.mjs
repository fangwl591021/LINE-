import assert from 'node:assert/strict';
const base=process.argv[2];assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const call=async(action,payload={},who='owner-a')=>{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:{...payload,lineAccessToken:who}})});return r.json();};
const state=async()=>{const r=await fetch(base+'/fixture-state');return (await r.json()).results;};
for(const [rowId,activityId] of [['REG_A','A'],['REG_COURSE','COURSE'],['REG_CHILD','PARENT']]){
  if((await state()).find(r=>r.row_id===rowId).checked_in===1)assert.equal((await call('toggleCheckin',{rowId,activityId})).data.checkedIn,false);
  const concurrent=await Promise.all(Array.from({length:8},()=>call('redeemActivityCheckin',{rowId,activityId})));
  assert.ok(concurrent.every(r=>r.success&&r.data.checkedIn===true),JSON.stringify(concurrent));assert.equal(concurrent.filter(r=>!r.data.duplicate).length,1);
  const first=(await state()).find(r=>r.row_id===rowId);assert.equal(first.checked_in,1);assert.ok(first.nfc_checkin_time);
  assert.equal((await call('redeemActivityCheckin',{rowId,activityId})).data.duplicate,true);assert.equal((await state()).find(r=>r.row_id===rowId).nfc_checkin_time,first.nfc_checkin_time);
  for(const who of ['owner-b','member-a',''])assert.equal((await call('redeemActivityCheckin',{rowId,activityId,role:'admin',networkId:'owner-a'},who)).success,false);
  assert.equal((await call('redeemActivityCheckin',{rowId,activityId:'WRONG'})).success,false);
  assert.equal((await call('toggleCheckin',{rowId,activityId})).data.checkedIn,false);
  assert.equal((await call('redeemActivityCheckin',{rowId,activityId})).data.checkedIn,true);
  console.log('PASS Workers/D1 runtime: '+activityId+' concurrent idempotency, exact scope, separate manual cancel');
}
assert.equal((await call('redeemActivityCheckin',{rowId:'REG_CANCELLED',activityId:'A'})).success,false);
assert.equal((await state()).find(r=>r.row_id==='REG_CANCELLED').checked_in,0);
console.log('PASS actual worker-entry runtime; local synthetic D1 only; production writes 0');
