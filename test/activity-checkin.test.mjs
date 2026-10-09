import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {startActivityCheckinFixture} from './browser/activity-checkin-flow-server.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='FIXTURE_ACTIVITY',rowId='REG_'+id;
async function fixture(t){const f=await startActivityCheckinFixture();t.after(()=>f.close());return f;}
const saved=f=>f.official.sql.prepare('SELECT * FROM registrants WHERE row_id=?').get(rowId);
test('Official QR sets checkin once; concurrent scans preserve the first time',async t=>{
  const f=await fixture(t);const results=await Promise.all(Array.from({length:12},()=>f.officialApi('redeemActivityCheckin',{rowId,activityId:id})));
  assert.ok(results.every(r=>r.success&&r.data.checkedIn===true));assert.equal(results.filter(r=>!r.data.duplicate).length,1);
  const first=saved(f);assert.equal(first.checked_in,1);assert.equal(first.nfc_checkin_source,'qr');assert.ok(first.nfc_checkin_time);
  const again=await f.officialApi('redeemActivityCheckin',{rowId});assert.equal(again.data.duplicate,true);assert.equal(saved(f).nfc_checkin_time,first.nfc_checkin_time);assert.equal(f.official.fallback,0);
});
for(const action of ['toggleCheckin','redeemActivityCheckin']){
  test(action+' requires real manager token and actual activity scope',async t=>{
    const f=await fixture(t);
    for(const who of ['owner-b','member-a','invalid','']){
      const result=await f.officialApi(action,{rowId,activityId:id,userId:'owner-a',role:'admin',networkId:'owner-a',authenticatedRole:'admin',authenticatedNetworkId:'owner-a'},who);
      assert.equal(result.success,false,who);assert.equal(saved(f).checked_in,0);
    }
    assert.equal((await f.officialApi(action,{rowId,activityId:'FIXTURE_COURSE'})).success,false);
    assert.equal((await f.officialApi(action,{rowId:'missing'})).success,false);assert.equal(f.official.fallback,0);
  });
}
test('Manual cancellation is separate and refresh-compatible',async t=>{
  const f=await fixture(t);await f.officialApi('redeemActivityCheckin',{rowId,activityId:id});
  const cancel=await f.officialApi('toggleCheckin',{rowId,activityId:id});assert.equal(cancel.data.checkedIn,false);assert.equal(saved(f).nfc_checkin_time,'');
  const roster=await f.officialApi('getActivityRegistrants',{activityId:id});assert.equal(roster.success,true);assert.equal(roster.data[0]['簽到'],false);
  assert.equal((await f.officialApi('redeemActivityCheckin',{rowId,activityId:id})).data.duplicate,false);
});
for(const [name,change] of [
  ['cancelled registration',"UPDATE registrants SET status='cancelled' WHERE row_id='REG_FIXTURE_ACTIVITY'"],
  ['unpublished activity',"UPDATE activities SET status='下架' WHERE activity_id='FIXTURE_ACTIVITY'"],
  ['changed activity owner',"UPDATE activities SET creator_id='owner-b',network_id='owner-b' WHERE activity_id='FIXTURE_ACTIVITY'"]]){
  test('QR refuses '+name+' including write-time race',async t=>{
    const f=await fixture(t);let fired=false;f.official.setBeforeRun(q=>{if(!fired&&q.startsWith('UPDATE registrants SET checked_in')){fired=true;f.official.sql.exec(change);}});
    assert.equal((await f.officialApi('redeemActivityCheckin',{rowId,activityId:id})).success,false);assert.equal(saved(f).checked_in,0);assert.equal(f.official.fallback,0);
  });
}
test('Already checked but cancelled/unpublished is not duplicate success',async t=>{
  const f=await fixture(t);await f.officialApi('redeemActivityCheckin',{rowId});f.official.sql.exec("UPDATE activities SET status='下架' WHERE activity_id='FIXTURE_ACTIVITY'");
  assert.equal((await f.officialApi('redeemActivityCheckin',{rowId})).success,false);assert.equal(saved(f).checked_in,1);
  // Explicit manual historical cancellation remains available to its own manager.
  assert.equal((await f.officialApi('toggleCheckin',{rowId})).data.checkedIn,false);
});
test('Legacy parent roster checks exact child registration; cross-parent and changed parent denied',async t=>{
  const f=await fixture(t);await f.official.create('PARENT','platform');await f.official.create('CHILD','platform','owner-a',{seriesId:'PARENT'});
  f.official.sql.exec("UPDATE activities SET series_id='PARENT' WHERE activity_id='CHILD'; INSERT INTO registrants(row_id,line_id,activity_id,name,status) VALUES('CHILD_ROW','member-a','CHILD','合成學員','active');");
  assert.equal((await f.officialApi('redeemActivityCheckin',{rowId:'CHILD_ROW',activityId:id})).success,false);
  assert.equal((await f.officialApi('redeemActivityCheckin',{rowId:'CHILD_ROW',activityId:'PARENT'})).success,true);
  f.official.sql.exec("UPDATE activities SET network_id='owner-b' WHERE activity_id='PARENT'");
  assert.equal((await f.officialApi('redeemActivityCheckin',{rowId:'CHILD_ROW',activityId:'PARENT'})).success,false);
  assert.equal(f.official.sql.prepare("SELECT checked_in FROM registrants WHERE row_id='CHILD_ROW'").get().checked_in,1);
});
test('Database failure never forwards checkin to legacy GAS',async t=>{
  const f=await fixture(t);f.official.setFail(true);assert.equal((await f.official.api('redeemActivityCheckin',{rowId},'owner-a')).success,false);assert.equal(f.official.fallback,0);
});
test('Changing child parent during write cannot redeem from the old parent scanner',async t=>{
  const f=await fixture(t);await f.official.create('PARENT','platform');await f.official.create('NEW_PARENT','platform');
  f.official.sql.exec("UPDATE activities SET series_id='PARENT' WHERE activity_id='FIXTURE_ACTIVITY'");
  f.official.setBeforeRun(q=>{if(q.startsWith('UPDATE registrants SET checked_in'))f.official.sql.exec("UPDATE activities SET series_id='NEW_PARENT' WHERE activity_id='FIXTURE_ACTIVITY'");});
  assert.equal((await f.officialApi('redeemActivityCheckin',{rowId,activityId:'PARENT'})).success,false);assert.equal(saved(f).checked_in,0);
});
test('QR parser rejects mall/card/foreign URLs and ambiguous aliases',()=>{
  const context=vm.createContext({window:{},location:{origin:'http://localhost',pathname:'/'},URL,Set});vm.runInContext(read('js/modules/activity-checkin.js'),context);
  const parse=context.window.parseActivityCheckinQr;
  for(const url of ['not-qr','https://evil.invalid/?verifyCheckin=x','https://liff.line.me/wrong?verifyCheckin=x','https://fangwl591021.github.io/LINE-/?verifyCheckin=x&verifyCheckin=y','https://fangwl591021.github.io/LINE-/?verifyCheckin=x&registrationId=y','https://fangwl591021.github.io/LINE-/?pt_uid=x','https://fangwl591021.github.io/LINE-/?verifyCheckin=x&amount=100'])assert.throws(()=>parse(url));
  for(const alias of ['verifyCheckin','checkinRowId','registrationId'])assert.equal(parse('https://liff.line.me/1660923784-vViMTZ1y?'+alias+'=r1&activityId=a1').rowId,'r1');
});
test('Both served surfaces include scanner dependencies and no third-party ticket render',()=>{
  for(const file of ['index.html','admin.html']){assert.match(read(file),/js\/modules\/activity-checkin\.js\?v=1/);assert.match(read(file),/css\/activity-checkin\.css\?v=1/);}
  assert.doesNotMatch(read('js/modules/member-hosted-events.js'),/new window\.QRCode/);
  const home=read('js/modules/home.js'),start=home.indexOf('window.showActivityCheckinQr ='),qr=home.slice(start,home.indexOf('window.cancelMyActivityRegistration =',start));
  assert.doesNotMatch(qr,/quickchart/);assert.match(qr,/renderActivityCheckinQr/);
  assert.match(read('js/config.js'),/fetchAPI\('redeemActivityCheckin'/);
  assert.doesNotMatch(read('js/modules/admin.js'),/openCheckinPage\('',/);
  assert.doesNotMatch(read('js/modules/activity-checkin.js'),/grantPoints|redeemStore|deductPoints|point-webhook/);
});
