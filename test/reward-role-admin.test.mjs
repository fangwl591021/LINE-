import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const memberId = 'U' + 'a'.repeat(32);
const operatorId = 'U' + 'b'.repeat(32);
function between(source, start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, start);
  return source.slice(first, last);
}

for (const file of ['admin.html', 'admin-v2.html']) {
  const source = read(file);
  const normalizer = between(source, '    function getSafeUserRole(', '    function showToast(');
  const label = between(source, '    function getRoleLabel(', '    function getCrmStatus(');
  const updater = between(source, '    async function updateRole(', '    async function syncBoundCardsToUsers(');
  function setup(options = {}) {
    const user = {userId:memberId, role:options.oldRole || 'user', name:'測試會員'};
    const calls = [], messages = [], confirmations = [];
    const context = {
      allUsersData:[user], adminRole:options.operatorRole || 'admin', adminProfile:{userId:operatorId},
      normalizeLineId:value=>String(value || '').trim(), getUserId:user=>user.userId,
      isHardAdminAccount:()=>options.protected === true,
      showToast:(...args)=>messages.push(args),
      window:{confirm:message=>{confirmations.push(message); return options.confirm !== false;}},
      fetchAPI:async(action,payload)=>{
        calls.push({action,payload});
        if (options.error) throw Error('mock failure');
        return Object.hasOwn(options,'response') ? options.response : {userId:memberId,role:payload.newRole};
      },
      loadUsers:async()=>{if(options.reloadError)throw Error('mock reload failure');}
    };
    vm.runInNewContext(normalizer + label + updater, context);
    return {context,user,calls,messages,confirmations,select:{value:'reward',disabled:false}};
  }

  test(file + ': CRM role dropdown/filter and label preserve reward without elevating it', () => {
    const {context} = setup();
    assert.equal(context.getSafeUserRole({role:' REWARD '}),'reward');
    assert.equal(context.getRoleLabel('reward'),'贈點用戶');
    assert.equal(context.getSafeUserRole({role:'invented'}),'user');
    assert.equal(context.getSafeUserRole({role:'admin'}),'user');
    assert.match(source, /id="admin-crm-role-filter"[\s\S]*?<option value="reward">贈點用戶<\/option>[\s\S]*?<\/select>/);
    assert.match(source, /onchange="updateRole\([^\n]+this.value, this\)"[^\n]+isHardAdminAccount/);
    assert.ok(source.includes('<option value="reward" ${role===\'reward\'?\'selected\':\'\'}>贈點用戶</option>'));
  });

  test(file + ': explicit confirmation sends only the reward role via the existing API', async () => {
    const s=setup(); await s.context.updateRole(memberId,'reward',s.select);
    assert.equal(s.calls.length,1); assert.equal(s.calls[0].action,'updateUserRole');
    assert.equal(s.calls[0].payload.newRole,'reward'); assert.equal(s.calls[0].payload.operatorRole,'admin');
    assert.equal(s.user.role,'reward'); assert.equal(s.select.disabled,false);
    assert.match(s.confirmations[0],/只能|僅能/); assert.match(s.confirmations[0],/不能扣點/);
    assert.match(s.messages.at(-1)[0],/贈點用戶/);
  });

  test(file + ': cancel and invalid roles do not send writes and restore the selection', async () => {
    const canceled=setup({oldRole:'store',confirm:false});
    await canceled.context.updateRole(memberId,'reward',canceled.select);
    assert.equal(canceled.calls.length,0); assert.equal(canceled.select.value,'store');
    for (const role of ['admin','tenant','invented']) {
      const s=setup({oldRole:'reward'}); await s.context.updateRole(memberId,role,s.select);
      assert.equal(s.calls.length,0); assert.equal(s.select.value,'reward');
    }
  });

  test(file + ': reward role survives a failed attempted role change', async () => {
    for (const options of [{response:null},{response:{success:false,error:'rejected'}},{error:true}]) {
      const s=setup({oldRole:'reward',...options}); s.select.value='store';
      await s.context.updateRole(memberId,'store',s.select);
      assert.equal(s.select.value,'reward'); assert.equal(s.user.role,'reward'); assert.equal(s.select.disabled,false);
    }
  });

  test(file + ': store/reward actors and protected hard-admin targets cannot change roles', async () => {
    for (const options of [{operatorRole:'store'},{operatorRole:'reward'},{protected:true}]) {
      const s=setup(options); await s.context.updateRole(memberId,'reward',s.select);
      assert.equal(s.calls.length,0); assert.equal(s.user.role,'user');
    }
  });

  test(file + ': a list reload failure does not undo a successful role update', async () => {
    const s=setup({reloadError:true}); await s.context.updateRole(memberId,'reward',s.select);
    assert.equal(s.user.role,'reward'); assert.equal(s.select.value,'reward'); assert.equal(s.select.disabled,false);
  });
}

const mobileSource=read('js/modules/admin.js');
const mobileRenderer=between(mobileSource,'window.renderStoreManagement =','// fetchAPI unwraps');
const mobileUpdater=between(mobileSource,'window.changeUserRole =','window.clearAnnouncementForm =');
function mobile(options={}) {
  const user={userId:memberId,role:options.oldRole || 'user',name:'測試會員'};
  const calls=[],messages=[],confirmations=[],container={innerHTML:''};
  const window={
    currentUserProfile:{userId:operatorId},userRole:options.operatorRole || 'admin',currentNetworkId:'test',
    isHardAdminUser:()=>options.protected === true,escapeJS:String,
    showToast:(...args)=>messages.push(args),
    confirm:message=>{confirmations.push(message);return options.confirm !== false;},
    fetchAPI:async(action,payload)=>{
      calls.push({action,payload}); if(options.error)throw Error('mock failure');
      return Object.hasOwn(options,'response') ? options.response : {userId:memberId,role:payload.newRole};
    }
  };
  const context={window,allSystemUsers:[user],currentUserProfile:window.currentUserProfile,document:{getElementById:()=>container}};
  vm.runInNewContext(mobileRenderer + mobileUpdater,context);
  return {window,user,calls,messages,confirmations,container,select:{value:'reward',disabled:false,dataset:{}}};
}

test('mobile CRM renders the saved reward role and keeps hard-admin choices disabled',()=>{
  const s=mobile({oldRole:'reward'});s.window.renderStoreManagement();
  assert.match(s.container.innerHTML,/<option value="reward" selected>贈點用戶<\/option>/);
  for (const options of [{oldRole:'admin'},{protected:true},{operatorRole:'store'}]) {
    const s=mobile(options);s.window.renderStoreManagement();assert.match(s.container.innerHTML,/<select[^>]+disabled/);
  }
});
test('mobile CRM has one role handler and sends reward after explicit confirmation',async()=>{
  assert.equal((mobileSource.match(/window.changeUserRole =/g)||[]).length,1);
  const s=mobile();await s.window.changeUserRole(memberId,'reward',{target:s.select});
  assert.equal(s.calls.length,1);assert.equal(s.calls[0].payload.newRole,'reward');
  assert.equal(s.user.role,'reward');assert.equal(s.select.dataset.originalRole,'reward');
  assert.match(s.confirmations[0],/不能扣點/);assert.match(s.messages.at(-1)[0],/贈點用戶/);
});
test('mobile CRM restores reward selection and state on API failure',async()=>{
  for(const options of [{response:null},{response:{success:false,role:'store',error:'rejected'}},{error:true}]){
    const s=mobile({oldRole:'reward',...options});s.select.value='store';
    await s.window.changeUserRole(memberId,'store',{target:s.select});
    assert.equal(s.user.role,'reward');assert.equal(s.select.value,'reward');assert.equal(s.select.disabled,false);
  }
});
test('mobile CRM rejects non-admin operators, protected targets and unapproved role values',async()=>{
  for(const options of [{operatorRole:'store'},{operatorRole:'reward'},{protected:true},{oldRole:'admin'},{confirm:false}]){
    const s=mobile(options);await s.window.changeUserRole(memberId,'reward',{target:s.select});assert.equal(s.calls.length,0);
  }
  const s=mobile({oldRole:'reward'});await s.window.changeUserRole(memberId,'admin',{target:s.select});
  assert.equal(s.calls.length,0);assert.equal(s.select.value,'reward');
});
