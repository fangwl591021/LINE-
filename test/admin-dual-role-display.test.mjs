import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const part=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('dual-role members appear under both role filters and retain the store plan',()=>{
 const context={adminCrmFilters:{role:'admin'},hasDistributorProfileData:()=>true,getCrmStatus:()=>'',getSafeUserRole:u=>u.role,
  hasAnnualFeeActive:()=>false,isFollowUpDue:()=>false,matchAdminCrmQuickFilter:()=>true};
 vm.createContext(context);
 vm.runInContext(part('    function getAdminCrmFilteredUsers(', '    function getCrmSortTime('),context);
 const rows=[{name:'dual',role:'store',dualAdmin:true},{name:'store',role:'store'},{name:'admin',role:'admin'}];
 assert.deepEqual(Array.from(context.getAdminCrmFilteredUsers(rows),u=>u.name),['dual','admin']);
 context.adminCrmFilters.role='store';
 assert.deepEqual(Array.from(context.getAdminCrmFilteredUsers(rows),u=>u.name),['dual','store']);
 context.adminCrmFilters.role='reward';
 assert.equal(context.getAdminCrmFilteredUsers(rows).length,0);
});

test('table and selected plan visibly distinguish dual and ordinary store members',()=>{
 const nodes={'users-table-body':{},'stat-users':{}};
 const context={document:{getElementById:id=>nodes[id]},window:{MemberNumber:{summaryHtml:()=>''}},userPage:1,ADMIN_PAGE_SIZE:10,adminRole:'admin',
  hasDistributorProfileData:()=>true,sortAdminCrmUsers:u=>u,getAdminCrmFilteredUsers:u=>u,updateCrmSummaryCards:()=>{},renderAdminPager:()=>{},
  getSafeUserRole:u=>u.role,getUserId:u=>u.name,getCrmStatus:()=>'',getCrmStatusMeta:()=>['活躍',''],getIntentMeta:()=>['冷',''],
  getSponsorUser:()=>null,getPlacementUser:()=>null,getQualificationProgress:()=>({text:'0/2'}),getAnnualFeeStatus:()=>({className:'',text:'未建立'}),
  escapeHTML:s=>String(s),getLastInteraction:()=>'',formatDisplayTime:s=>s,getRoleLabel:r=>r==='store'?'雙向完整版':r,
  readSponsorId:()=>'',readPlacementParentId:()=>'',readPlacementSide:()=>'',isUserIndependent:()=>false,
  getDirectDownlineCount:()=>0,getPlacementChildCount:()=>0,isFollowUpDue:()=>false,isHardAdminAccount:()=>false};
 vm.createContext(context);
 vm.runInContext(part('    function renderUsersTable(', '    function changeUserPage('),context);
 context.renderUsersTable([{name:'dual',role:'store',dualAdmin:true},{name:'normal',role:'store'}]);
 const html=nodes['users-table-body'].innerHTML;
 assert.equal((html.match(/總管・雙向完整版/g)||[]).length,2);
 assert.match(html,/class="crm-role-select crm-role-select-dual/);
 assert.match(html,/<option value="store" selected>總管・雙向完整版<\/option>/);
 assert.match(html,/<option value="store" selected>雙向完整版<\/option>/);
});
