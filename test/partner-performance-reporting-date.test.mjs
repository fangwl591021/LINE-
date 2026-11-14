import test from 'node:test';
import assert from 'node:assert/strict';
import {readPerformanceReportingDate} from '../worker/partner-bonus-v2.mjs';

function database(event,hasTable=true){
 return {prepare(sql){
  return {bind(...args){
   return {async first(){
    if(sql.includes('sqlite_master'))return hasTable?{present:1}:null;
    if(sql.includes('partner_bonus_performance_date_events'))return event&&args[0]==='order-1'?event:null;
    throw new Error('unexpected query');
   }};
  }};
 }};
}
const event=(precision,value)=>({event_id:'event-1',version:2,precision,value,recorded_at:'2026-11-12T00:00:00.000Z',recorded_by:'admin'});

test('report period retains the administrative event and exact supplied precision',async()=>{
 for(const [precision,value] of [['month','2026-10'],['day','2026-10-31'],['minute','2026-10-31T23:59']]){
  const result=await readPerformanceReportingDate(database(event(precision,value)),'order-1');
  assert.deepEqual(result,{eventId:'event-1',version:2,precision,value,month:'2026-10',recordedAt:'2026-11-12T00:00:00.000Z',recordedBy:'admin'});
 }
});
test('legacy and unadjusted orders keep their existing behavior',async()=>{
 assert.equal(await readPerformanceReportingDate(database(null,false),'order-1'),null);
 assert.equal(await readPerformanceReportingDate(database(null),'order-1'),null);
 assert.equal(await readPerformanceReportingDate(database(event('month','2026-10')),'other-order'),null);
});
test('malformed dates or database errors stop rather than assigning a month',async()=>{
 for(const [precision,value] of [['month','2026-13'],['day','2026-02-30'],['minute','2026-10-31T24:00'],['month','2026-10-01']])
  await assert.rejects(readPerformanceReportingDate(database(event(precision,value)),'order-1'),/業績歸屬日期/);
 await assert.rejects(readPerformanceReportingDate({prepare(){throw new Error('unavailable')}},'order-1'),/unavailable/);
});
