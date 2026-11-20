import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('member area shows only the current member number and clears on identity changes',()=>{
  const source=readFileSync(new URL('../js/navigation.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const auth=readFileSync(new URL('../js/auth.js',import.meta.url),'utf8');
  assert.match(html,/id="profile-member-number"/);
  assert.match(auth,/window\.currentUser = \{ \.\.\.info \};\s*window\.renderProfileMemberNumber\?\.\(\)/);
  const element={textContent:''},window={},document={getElementById:id=>id==='profile-member-number'?element:null};
  vm.runInNewContext(source,{window,document});
  const render=window.renderProfileMemberNumber;
  render();assert.equal(element.textContent,'尚未取得會員編號');
  window.currentUserProfile={userId:'alice'};window.currentUser={userId:'alice',memberNumber:'20261021009'};
  render();assert.equal(element.textContent,'20261021009');
  window.currentUserProfile={userId:'bob'};
  render();assert.equal(element.textContent,'尚未取得會員編號');
  window.currentUser={userId:'canonical',requestedUserId:'bob',memberNumber:'20260514002'};
  render();assert.equal(element.textContent,'20260514002');
  window.currentUser.memberNumber='<script>bad</script>';
  render();assert.equal(element.textContent,'尚未取得會員編號');
  window.currentUser=null;render();assert.equal(element.textContent,'尚未取得會員編號');
});
