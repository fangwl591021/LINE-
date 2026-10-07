import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ui=readFileSync(new URL('../js/modules/member-hosted-events.js',import.meta.url),'utf8'),home=readFileSync(new URL('../js/modules/home.js',import.meta.url),'utf8'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('the actual member-event review form exposes category below title and retains it on save and display',()=>{
  const review=ui.slice(ui.indexOf('  function review('),ui.indexOf('  window.openMemberEvents='));
  assert.match(review,/field\('category','活動分類','text',seed\.category\|\|'活動','maxlength="40"/);
  assert.ok(review.indexOf("field('title'")<review.indexOf("field('category'"));assert.ok(review.indexOf("field('category'")<review.indexOf('class="me-times"'));
  assert.match(review,/type="button" data-category/);assert.match(review,/form\.elements\.category\.value=b\.dataset\.category/);
  assert.match(review,/\['title','category','description'/);assert.match(review,/values\.category=values\.category\.trim\(\)/);
  assert.equal((ui.match(/分類：\$\{esc\(e\.category\|\|'活動'\)\}/g)||[]).length,2);
});
test('pure deep link waits existing login; mixed/duplicate/invalid links do nothing',()=>{
  const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const document={getElementById:()=>null,querySelectorAll:()=>[]};
  for(const query of ['',`?memberEvent=${id}&a=ACT_demo`,`?memberEvent=${id}&shareCardId=abc`,`?memberEvent=${id}&memberEvent=${id}`,'?memberEvent=bad']){let timers=0;const window={addEventListener(){}};vm.runInNewContext(ui,{window,location:{search:query},URLSearchParams,setInterval(){timers++;},clearInterval(){},document,console});assert.equal(timers,0);assert.equal(typeof window.openMemberEvents,'function');}
  for(const query of [`?memberEvent=${id}`,`?liff.state=${encodeURIComponent('?memberEvent='+id)}`]){let timers=0;vm.runInNewContext(ui,{window:{addEventListener(){}},location:{search:query},URLSearchParams,setInterval(){timers++;},clearInterval(){},document,console});assert.equal(timers,1);}
});
test('calendar branch precedes private save, one projection, review and existing functions retained',()=>{
  const branch=home.slice(home.indexOf('window.savePersonalAgendaTask ='));assert.ok(branch.indexOf('reviewMemberHostedAgenda')<branch.indexOf("fetchAPI('savePersonalTask'"));
  assert.match(home,/task\.memberHosted/);assert.match(home,/loadMemberHostedAgenda/);assert.match(home,/loadSequence !== window\.personalAgendaLoadSequence/);
  assert.match(html,/member-hosted-events\.js\?v=5/);assert.match(html,/home\.js\?v=8\.21/);assert.match(ui,/確認發布活動/);assert.match(ui,/確認儲存修改/);assert.match(ui,/capacity.*人數上限/);assert.match(ui,/收費只作資訊展示/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|OPENAI_API_KEY|gift_money|\/activities\/|courses\/|registerUser/);
});
test('privacy, auth captured on every request, stale response and close/scan/ticket cleanup',()=>{
  assert.match(ui,/current\.uid!==identity\.uid\|\|current\.token!==identity\.token/);assert.match(ui,/credentials:'omit',cache:'no-store'/);assert.match(ui,/scope\?\.closed/);assert.match(ui,/controllers\.forEach\(c=>c\.abort\(\)\)/);
  assert.match(ui,/每人限一場未結束活動/);assert.match(ui,/不贈點、不扣點/);assert.match(ui,/getTracks\(\)\.forEach\(t=>t\.stop\(\)\)/);assert.match(ui,/visibilitychange/);assert.match(ui,/清|close/);assert.match(ui,/clearTimeout\(timer\)/);assert.match(ui,/同一筆活動不會重複建立/);
});
