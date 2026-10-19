// Local preview of the exact generated Flex payload, plus real UI deep-link checks.
// This is not a LINE client render or phone-delivery acceptance.
import {buildAiReminderFlex} from '../worker/ai-advance-reminder-batches.mjs';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let pw;try{pw=require('playwright');}catch{pw=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const out=join(tmpdir(),'ai-reminder-flex-qa-20261019');mkdirSync(out,{recursive:true});
const jobs=[1,2,3].map((n)=>({task_id:'0000000'+n+'-1111-4111-8111-111111111111',due_at:'2026-10-19T0'+n+':30:00.000Z'}));
const flex=buildAiReminderFlex(jobs,'https://liff.line.me/1660923784-vViMTZ1y?aiAdvance=1');
writeFileSync(join(out,'synthetic-flex.json'),JSON.stringify({messages:[flex]},null,2));
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;font:16px system-ui,"Microsoft JhengHei",sans-serif;background:#edf7f4;color:#163c35}main{padding:18px;max-width:1060px;margin:auto}h1{font-size:22px}small{color:#526b65}.carousel{display:flex;gap:14px;overflow:auto;scroll-snap-type:x mandatory;padding:20px 0}.bubble{background:white;flex:0 0 292px;border-radius:18px;overflow:hidden;scroll-snap-align:start;display:flex;flex-direction:column;box-shadow:0 3px 12px #003f2420}.bubble header{background:#007F68;color:#fff;padding:16px}.bubble section{padding:20px;flex:1}.bubble footer{padding:16px}.text{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 14px;line-height:1.55}.button{display:block;background:#007F68;color:white;text-decoration:none;text-align:center;padding:13px;border-radius:9px;font-weight:700}.tag{background:#d8f0e6;border-radius:20px;padding:8px 12px;display:inline-block;font-size:14px}.pages{font-size:13px;color:#536a64}
</style><main><small>本機合成預覽｜非 LINE 實機截圖</small><h1>AI 推進｜多筆提醒合併一則</h1><p class="tag">1 次推播 · 3 筆任務 · 左右滑動查看</p><div class="carousel" aria-label="提醒多頁卡片"></div><p class="pages">每頁可開啟對應任務；私人內容登入後才顯示。</p></main><script>
const flex=${JSON.stringify(flex)};
function text(item,parent){const p=document.createElement('p');p.className='text';p.textContent=item.text;if(item.weight==='bold')p.style.fontWeight='700';p.style.fontSize=({xs:'12px',sm:'14px',md:'16px',xl:'22px'}[item.size]||'16px');if(item.color)p.style.color=item.color;parent.append(p);}
for(const b of flex.contents.contents){const a=document.createElement('article');a.className='bubble';for(const [k,tag]of [['header','header'],['body','section'],['footer','footer']]){const box=document.createElement(tag);for(const c of b[k].contents){if(c.type==='text')text(c,box);else if(c.type==='button'){const link=document.createElement('a');link.className='button';link.textContent=c.action.label;link.href=c.action.uri;box.append(link);}}a.append(box);}document.querySelector('.carousel').append(a);}
</script></html>`;
const server=spawn(process.execPath,['tools/ai-advance-preview.mjs'],{env:{...process.env,PORT:'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
try{
 const origin=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('fixture timeout')),15000);server.stdout.on('data',b=>{s+=b;const m=s.match(/Synthetic preview: (http:\/\/127\.0\.0\.1:\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});server.once('error',reject);server.once('exit',c=>{clearTimeout(timer);reject(Error('fixture exit '+c));});});
 browser=await pw.chromium.launch({channel:'chrome',headless:true});
 const r=await fetch(origin+'/v1/ai-advance/tasks',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({requestKey:crypto.randomUUID(),title:'合成任務：核對合作需求',description:'只讀驗收，不發送通知',dueAt:'2026-10-19T01:30:00.000Z',priority:'normal',contactCardId:''})});
 const {task}=await r.json();assert.ok(task);
 for(const width of [320,390,1200]){
  const page=await browser.newPage({viewport:{width,height:850}}),writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
  await page.route('**/*',route=>{if(route.request().url()===origin+'/flex-preview')return route.fulfill({contentType:'text/html',body:html});return new URL(route.request().url()).origin===origin?route.continue():route.abort();});
  await page.goto(origin+'/flex-preview');assert.equal(await page.locator('.bubble').count(),3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(new URL(await page.locator('.button').nth(1).getAttribute('href')).searchParams.get('aiAdvanceTask'),jobs[1].task_id);
  await page.screenshot({path:join(out,'carousel-'+width+'.png'),fullPage:true});
  await page.goto(origin+'/?aiAdvance=1&aiAdvanceTask='+task.id);await page.getByRole('heading',{name:'合成任務：核對合作需求',exact:true}).waitFor();assert.equal(writes.length,0,'Notification click must not mutate');
  await page.screenshot({path:join(out,'task-link-'+width+'.png'),fullPage:true});
  await page.goto(origin+'/?aiAdvance=1&aiAdvanceTask=00000001-1111-4111-8111-111111111111');await page.locator('.aa-status').filter({hasText:'無法開啟該任務'}).waitFor();
  assert.equal(await page.locator('[data-report]').count(),0);assert.equal(writes.length,0);assert.deepEqual(errors,[]);await page.close();
 }
 console.log(JSON.stringify({passed:true,widths:[320,390,1200],oneFlexThreePages:true,taskLinkReadOnly:true,forbiddenTaskRejected:true,productionWrites:0,out}));
}finally{await browser?.close();server.kill();}
