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
  assert.match(html,/member-hosted-events\.js\?v=8/);assert.match(html,/home\.js\?v=8\.26/);assert.match(ui,/確認發布活動/);assert.match(ui,/確認儲存修改/);assert.match(ui,/capacity.*人數上限/);assert.match(ui,/收費只作資訊展示/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|OPENAI_API_KEY|gift_money|\/activities\/|courses\/|registerUser/);
});
test('privacy, auth captured on every request, stale response and close/scan/ticket cleanup',()=>{
  assert.match(ui,/current\.uid!==identity\.uid\|\|current\.token!==identity\.token/);assert.match(ui,/credentials:'omit',cache:'no-store'/);assert.match(ui,/scope\?\.closed/);assert.match(ui,/controllers\.forEach\(c=>c\.abort\(\)\)/);
  assert.match(ui,/每人限一場未結束活動/);assert.match(ui,/不贈點、不扣點/);assert.match(ui,/getTracks\(\)\.forEach\(t=>t\.stop\(\)\)/);assert.match(ui,/visibilitychange/);assert.match(ui,/清|close/);assert.match(ui,/clearTimeout\(timer\)/);assert.match(ui,/同一筆活動不會重複建立/);
});

const block=(start,end)=>{const a=ui.indexOf(start),b=ui.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return ui.slice(a,b);};
test('hosting calendar navigates once and opens the real draft immediately, without awaiting history',()=>{
  for(const alreadyChecked of [false,true]){
    const calls=[],checkbox={checked:alreadyChecked,dispatchEvent:e=>calls.push(['change',e.type])};
    const window={goPage:(...args)=>calls.push(['page',...args]),loadMyActivities:()=>{calls.push(['load']);return new Promise(()=>{});},toggleAgendaForm:force=>calls.push(['draft',force])};
    const c={window,document:{getElementById:id=>{assert.equal(id,'agenda-host-activity');return checkbox;}},Event:class{constructor(type){this.type=type;}}};
    vm.createContext(c);vm.runInContext(block('  function openHostingCalendar(', '  async function showList('),c);
    c.openHostingCalendar({close:()=>calls.push(['close']),note:message=>calls.push(['note',message])});
    assert.deepEqual(calls,[['close'],['page','my-activities',true],['load'],['draft',true],...alreadyChecked?[]:[['change','change']]]);
    assert.equal(checkbox.checked,true);assert.doesNotMatch(ui,/switchPage/);
  }
});
test('missing calendar module keeps the modal open and explains retry instead of silently doing nothing',()=>{
  const calls=[],c={window:{},document:{getElementById:()=>null}};vm.createContext(c);
  vm.runInContext(block('  function openHostingCalendar(', '  async function showList('),c);
  c.openHostingCalendar({close:()=>calls.push('closed'),note:message=>calls.push(message)});
  assert.deepEqual(calls,['行事曆功能尚未載入，請重新整理後再試']);
});
test('calendar projection retains past host and registered events once, but excludes cancellations and public strangers',async()=>{
  const e=(id,past=false)=>({id,title:id,status:'active',startsAt:past?'2020-10-08T06:00:00Z':'2099-10-08T06:00:00Z',endsAt:past?'2020-10-08T08:00:00Z':'2099-10-08T08:00:00Z',organizerName:'主辦'});
  const host=e('host'),past=e('past-host',true),guest=e('past-registered',true),cancelled={...e('cancelled'),status:'cancelled'};
  const calls=[],c={window:{},api:async path=>{calls.push(path);return {hosting:[host,past,cancelled],my:[{...host,registrationStatus:'registered'},{...guest,registrationStatus:'registered'},{...e('cancelled-registration'),registrationStatus:'cancelled'}],sessions:[e('stranger')]};},closed:e=>e.status!=='active'||Date.parse(e.endsAt)<=Date.now()};
  vm.createContext(c);vm.runInContext(block('  window.loadMemberHostedAgenda=', '  const query='),c);
  const rows=await c.window.loadMemberHostedAgenda();
  assert.deepEqual(Array.from(rows,r=>r.taskId),['host','past-host','past-registered']);
  assert.deepEqual(Array.from(rows,r=>r.status),['pending','done','done']);
  assert.ok(rows.every(r=>r.memberHosted&&r.taskType==='hosted'&&r.recurrenceType==='none'));assert.deepEqual(calls,['/overview']);
});
test('hosting roster pagination, refresh and scanner preserve return-to-hosting while original detail entry remains intact',async()=>{
  const node=()=>({children:[],innerHTML:'',append(...children){this.children.push(...children);}}),calls=[];
  const c={document:{createElement:node,createTextNode:text=>({text})},esc:value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;'),stamp:v=>v,
    button:(label,fn)=>({label,click:fn}),actions:container=>{const a=node();container.append(a);return a;},
    api:async path=>{calls.push(['read',path]);return {event:{title:'我的活動',registrationCount:1,checkedInCount:0,cancelledCount:0},registrations:[{displayName:'<img src=x>',status:'registered',registeredAt:'2020-10-08'}],nextOffset:path.endsWith('=0')?100:null};},
    showList:(m,view)=>calls.push(['list',view]),detail:(m,id,view)=>calls.push(['detail',id,view]),scanner:(m,id,view)=>calls.push(['scanner',id,view])};
  const m={body:node(),closed:false,frame(title){this.body=node();calls.push(['frame',title]);},work:fn=>fn()};
  const find=label=>{const walk=n=>n.label===label?n:n.children?.map(walk).find(Boolean);return walk(m.body);};
  vm.createContext(c);vm.runInContext(block('  async function roster(', '  async function decoder('),c);
  await c.roster(m,'own-event',0,'hosting');assert.match(m.body.children[1].innerHTML,/&lt;img src=x&gt;/);
  await find('下一頁').click();assert.equal(calls.filter(c=>c[0]==='read').at(-1)[1],'/own-event/registrations?offset=100');
  await find('重新整理名單').click();assert.equal(calls.filter(c=>c[0]==='read').at(-1)[1],'/own-event/registrations?offset=100');
  await find('上一頁').click();find('開啟核銷掃描器').click();assert.deepEqual(calls.at(-1),['scanner','own-event','hosting']);
  await m.onBack();assert.deepEqual(calls.at(-1),['list','hosting']);
  await c.roster(m,'own-event');await m.onBack();assert.deepEqual(calls.at(-1),['detail','own-event','hosting']);
  assert.match(ui,/if\(view==='hosting'\)a\.append\(button\('報名名冊'/);
  assert.match(ui,/function scanner\(m,id,returnView='detail'\)/);assert.match(ui,/roster\(m,id,0,returnView\)/);
});
