import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('js/modules/home.js');
function block(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}
const series = {activityId:'series', networkId:'host-network', isBatch:true, activityName:'多梯次交流', status:'上架'};
const single = {activityId:'single', networkId:'host-network', activityName:'單場活動', status:'上架'};
function fixture(activities = [series, single]) {
  const calls = [], selected = ['B01', 'B02'];
  const choices = {dataset:{activityId:'series', ready:'true'}, querySelectorAll:()=>selected.map(value=>({value}))};
  const list = {innerHTML:'', className:''};
  const button = {innerHTML:'我要報名', disabled:false};
  const context = {
    document:{getElementById:id=>id==='activity-batch-choices'?choices:id==='user-activities-list'?list:null},
    allActivities:activities, currentPage:'home', homeActivityFilter:'全部', homeActivitiesLoadState_:'ready',
    currentUser:{name:'會員', phone:'0912345678'},
    canSeePublicActivity_:()=>true, renderHomeActivityFilters_:()=>{}, formatDisplayTime:String,
    escapeJS:String, escapeHTML:String,
    openActivityDetail:id=>calls.push(['detail', id]), showToast:(message,error)=>calls.push(['toast',message,error]),
    ActivityRegistration:{ensureMember:async()=>{calls.push(['member']);return true;}},
    fetchAPI:async(action,payload)=>{calls.push([action,payload]);return {success:true,data:{activityId:payload.activityId}};},
    goActivityRecordAfterJoin_:async id=>calls.push(['record', id]),
    event:{stopPropagation(){}}, fixtureButton:button
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('js/modules/activity-batches.js'), context);
  vm.runInContext(block('function getPublicActivityId_(', 'function getCurrentEffectiveNetwork_('), context);
  vm.runInContext(block('window.renderHomeActivities =', 'function normalizeActivityList_('), context);
  vm.runInContext(block('let activityJoinBusy =', '// === 模組初始化入口 ==='), context);
  return {context,calls,choices,list,button,selected};
}

test('series homepage CTA opens detail without membership or signup; single CTA stays signup', async()=>{
  const f = fixture();
  f.context.renderHomeActivities();
  const actions = [...f.list.innerHTML.matchAll(/onclick="event.stopPropagation\(\); ([^"]+)"[^>]*aria-label="(選擇梯次|報名)"/g)];
  assert.equal(actions.length, 2);
  const seriesAction = actions.find(a=>a[2]==='選擇梯次');
  assert.equal(seriesAction[1], "window.openActivityDetail('series')");
  vm.runInContext(seriesAction[1], f.context);
  assert.deepEqual(f.calls, [['detail','series']]);
  const singleAction = actions.find(a=>a[2]==='報名');
  assert.equal(singleAction[1], "window.joinPublicActivity('single', this)");
  await vm.runInContext(singleAction[1].replace(', this)', ', fixtureButton)'), f.context);
  assert.equal(f.calls.find(c=>c[0]==='joinActivity')[1].activityId,'single');
  assert.equal('batchIds' in f.calls.find(c=>c[0]==='joinActivity')[1],false);
});

test('legacy direct series signup from homepage cannot use checked hidden detail choices', async()=>{
  const f = fixture();
  await f.context.joinPublicActivity('series', f.button);
  assert.deepEqual(f.calls, [['detail','series']]);
  assert.equal(f.button.disabled, false);
  assert.deepEqual(f.selected,['B01','B02']);
});

test('another activity detail cannot submit its selections for this series', async()=>{
  const f = fixture();
  f.context.currentPage = 'my-act-detail';
  f.choices.dataset.activityId = 'different-series';
  await f.context.joinPublicActivity('series', f.button);
  assert.deepEqual(f.calls, [['detail','series']]);
});

test('loading or failed choices stay in detail without reopening or submitting', async()=>{
  for(const state of ['false','']) {
    const f = fixture();
    f.context.currentPage = 'my-act-detail';
    f.choices.dataset.ready = state;
    await f.context.joinPublicActivity('series', f.button);
    assert.equal(f.calls.length,1);
    assert.deepEqual(f.calls[0],['toast','梯次尚未載入完成，請稍候或按「重新讀取梯次」',true]);
    assert.equal(f.button.disabled,false);
  }
});

test('detail must explicitly select dates before any membership or signup API', async()=>{
  const f = fixture();
  f.context.currentPage = 'my-act-detail';
  f.selected.length = 0;
  await f.context.joinPublicActivity('series', f.button);
  assert.deepEqual(f.calls,[['toast','請勾選要報名的梯次',true]]);
});

test('selected detail dates preserve root, host network and member flow', async()=>{
  const f = fixture();
  f.context.currentPage = 'my-act-detail';
  await f.context.joinPublicActivity('series', f.button);
  assert.deepEqual(f.calls.map(c=>c[0]),['member','joinActivity','toast','record']);
  const payload = f.calls[1][1];
  assert.equal(payload.activityId,'series');
  assert.equal(payload.networkId,'host-network');
  assert.deepEqual(Array.from(payload.batchIds),['B01','B02']);
  assert.equal(payload.userName,'會員');
  assert.equal(payload.userPhone,'0912345678');
  assert.equal(f.button.innerHTML,'我要報名');
  assert.equal(f.button.disabled,false);
});

test('legacy series alias and missing module cannot silently become single-event signup', async()=>{
  const f = fixture([{...series,isBatch:false,'是否系列':'TRUE'}]);
  f.context.ActivityBatches = undefined;
  f.context.renderHomeActivities();
  assert.match(f.list.innerHTML,/aria-label="選擇梯次">選擇<br>梯次<\/button>/);
  await f.context.joinPublicActivity('series', f.button);
  assert.deepEqual(f.calls,[['detail','series']]);
  f.calls.length=0;
  f.context.currentPage='my-act-detail';
  await f.context.joinPublicActivity('series', f.button);
  assert.deepEqual(f.calls,[['toast','梯次選擇功能尚未載入，請重新整理後再試',true]]);
});

test('unknown activity never opens or submits a series registration', async()=>{
  const f = fixture();
  await f.context.joinPublicActivity('missing', f.button);
  assert.deepEqual(f.calls,[['toast','活動已下架',true]]);
});
