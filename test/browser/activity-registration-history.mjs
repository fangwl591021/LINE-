// Synthetic registrations only; exercise the production list renderer and CSS.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require=createRequire(import.meta.url);
let pw;try{pw=require('playwright');}catch{pw=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const source=read('js/modules/home.js'),index=read('index.html');
const block=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start+a.length);assert.ok(start>=0&&end>start);return s.slice(start,end);};
const markup=block(index,'<div id="page-my-activities"','<!-- ==================== 收件匣');
const code=[['function isTruthy_(', 'function getInitialActivityId_('],['window.loadMyActivities =','function buildActivityFromRegistration_(']]
  .map(([a,b])=>block(source,a,b)).join('\n');
const tailwind=await(await fetch('https://cdn.tailwindcss.com',{signal:AbortSignal.timeout(20000)})).text();
const browser=await pw.chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:390,height:740}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>r.request().url()==='http://localhost/'
  ? r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main class="p-4">'+markup+'<div id="my-act-detail-content"></div></main>'})
  : r.abort());
const output=join(tmpdir(),'registration-inactive-browser');mkdirSync(output,{recursive:true});
try{
  await page.goto('http://localhost/');
  await page.addScriptTag({content:tailwind});
  await page.addStyleTag({content:read('css/styles.css')+'\n'+read('css/home-reference-theme.css')});
  await page.evaluate(()=>{
    Date.now=()=>Date.parse('2026-09-28T04:00:00Z');
    document.getElementById('page-my-activities').classList.remove('hidden');
    window.currentUserProfile={userId:'synthetic-viewer',displayName:'測試會員'};window.currentUser={name:'測試會員'};
    window.escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.formatDisplayTime=String;window.goPage=name=>{window.lastPage=name;};window.showToast=()=>{};
    window.ensurePersonalAgendaPanel_=()=>{};window.loadPersonalAgenda=()=>{};
    window.fetchActivitiesByFallback_=async()=>[
      {rowId:'future',activityId:'future',activityName:'商機雙週會｜10/7（三）',startTime:'2026-10-07 14:00',activityEndTime:'2026-10-07 17:00',activityStatus:'上架',status:'active'},
      {rowId:'past',activityId:'past',activityName:'已結束的交流活動',startTime:'2026-05-07 14:00',activityEndTime:'2026-05-07 17:00',activityStatus:'上架',status:'checkedin'},
      {rowId:'closed',activityId:'closed',activityName:'已下架的交流活動',startTime:'2026-11-07 14:00',activityEndTime:'2026-11-07 17:00',activityStatus:'下架',status:'active'}
    ];
  });
  await page.addScriptTag({content:code});
  await page.evaluate(()=>loadMyActivities());
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-activity-state="expired"]')).backgroundColor==='rgb(248, 250, 252)');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:740});
    const styles=await page.locator('[data-activity-state]').evaluateAll(rows=>rows.map(row=>({
      state:row.dataset.activityState,bg:getComputedStyle(row).backgroundColor,
      title:getComputedStyle(row.querySelector('.truncate')).color,clickable:!!row.onclick
    })));
    assert.deepEqual(styles.map(s=>s.state),['active','expired','unlisted']);
    assert.equal(styles[0].title,'rgb(30, 41, 59)');
    for(const s of styles.slice(1)){assert.equal(s.title,'rgb(100, 116, 139)');assert.equal(s.bg,'rgb(248, 250, 252)');assert.ok(s.clickable);}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
    await page.screenshot({path:join(output,`history-${width}.png`),fullPage:true});
  }
  await page.locator('[data-activity-state="expired"] .truncate').click();
  assert.equal(await page.evaluate(()=>lastPage),'my-act-detail');
  assert.ok((await page.locator('#my-act-detail-content').innerText()).includes('已結束的交流活動'));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,widths:[390,320],detailsClickable:true,screenshots:output}));
}finally{await browser.close();}
