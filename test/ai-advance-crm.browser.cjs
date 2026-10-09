// Actual production UI + handlers, isolated in-memory SQLite and fake outbound LINE/AI only.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.TEMP;
(async()=>{
 const server=spawn(process.execPath,['tools/ai-advance-preview.mjs'],{cwd:root,env:{...process.env,PORT:'0',AI_ADVANCE_CRM_FIXTURE:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 let browser;
 try {
  const base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('fixture start timeout')),15000);server.stdout.on('data',data=>{output+=data;const m=output.match(/Synthetic preview: (http:\/\/127\.0\.0\.1:\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});server.once('exit',code=>{clearTimeout(timer);reject(Error('fixture exit '+code));});});
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const width of [320,390,768,1200]){
   await fetch(base+'/__reset',{method:'POST'});
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],writes=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')writes.push(new URL(request.url()).pathname);});
   await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   await page.goto(base);assert.equal(writes.length,0);
   await page.locator('#home-ai-advance-entry').click();await page.locator('[data-crm]').waitFor();
   await page.locator('[data-crm]').click();await page.locator('[data-crm-form]').waitFor();assert.equal(await page.locator('[data-candidate]').count(),10);assert.equal(writes.length,0,'preview never creates');
   await page.locator('[data-crm-form] button[type=submit]').click();assert.match(await page.locator('.aa-status').innerText(),/勾選/);
   const candidates=page.locator('[data-candidate]');for(let n=0;n<10;n++){await candidates.nth(n).locator('[data-select]').check();await candidates.nth(n).locator('[data-due]').fill('2026-01-01T14:00');}
   await page.locator('[data-crm-form] button[type=submit]').click();await page.locator('[data-list-title]').filter({hasText:'待辦任務（10）'}).waitFor();
   assert.equal(await page.locator('article.aa-task').count(),10);assert.equal(await page.locator('.aa-overdue').count(),10);assert.match(await page.locator('.aa-meta').first().innerText(),/名片 CRM/);
   await page.locator('article.aa-task').first().locator('summary').click();assert.match(await page.locator('article.aa-task').first().innerText(),/建立任務/);
   assert.equal(await page.locator('.aa-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
   await page.locator('.aa-body').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(out,'veo-crm-tasks-'+width+'.png')});
   const taskId=await page.locator('article.aa-task').first().getAttribute('data-task-id'),task=page.locator(`[data-task-id="${taskId}"]`);
   await task.locator('[data-push]').click();assert.match(await page.locator('.aa-status').innerText(),/先開啟/);assert.equal(writes.filter(p=>p.endsWith('/remind')).length,0);
   await task.locator('[data-report-action=note]').click();await page.locator('[data-report]').waitFor();assert.equal(await page.locator('[name=action]').inputValue(),'note');await page.locator('[name=note]').fill('已首次聯繫，確認合作需求');await page.locator('[data-report] button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('[data-ai]').disabled);
   await page.locator('[data-back]').click();await page.locator('[data-crm]').waitFor();await task.locator('summary').click();assert.match(await task.innerText(),/已首次聯繫/);
   await task.locator('[data-report-action=postpone]').click();await page.locator('[data-report]').waitFor();assert.equal(await page.locator('[name=action]').inputValue(),'postpone');assert.equal(await page.locator('[data-postpone]').isVisible(),true);await page.locator('[name=dueAt]').fill('2099-01-02T14:00');await page.locator('[name=note]').fill('協調改為未來日期');await page.locator('[data-report] button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('[data-ai]').disabled);
   await page.locator('[data-back]').click();await page.locator('[data-remind]').check();await page.waitForFunction(()=>!document.querySelector('[data-remind]').disabled);
   page.once('dialog',dialog=>dialog.dismiss());await task.locator('[data-push]').click();assert.equal(writes.filter(p=>p.endsWith('/remind')).length,0);
   page.once('dialog',dialog=>dialog.accept());await task.locator('[data-push]').click();await page.waitForFunction(()=>!document.querySelector('[data-new]').disabled);await page.locator('[data-refresh]').click();await task.locator('[data-delivery]').filter({hasText:'LINE 已接受提醒'}).waitFor();
   await task.locator('[data-report-action=complete]').click();await page.locator('[name=note]').fill('完成首次聯繫');await page.locator('[data-report] button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('[data-ai]').disabled);await page.locator('[data-back]').click();await page.locator('[data-list-title]').filter({hasText:'待辦任務（9）'}).waitFor();
   await page.locator('.aa-tabs button').filter({hasText:'已完成'}).click();assert.match(await page.locator('[data-list-title]').innerText(),/已完成/);assert.equal(await page.locator('[data-report-action=complete]').count(),0);assert.equal(await page.locator('[data-report-action=note]').count(),1);
   await page.locator('[data-crm]').click();await page.locator('[data-crm-form]').waitFor();assert.equal(await page.locator('[data-candidate]').count(),0,'closed tasks never regenerate');
   await page.locator('[data-back]').click();await page.locator('[data-new]').waitFor();await page.locator('[data-back]').click();assert.equal(await page.locator('.ai-advance-dialog').count(),0);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.equal(await page.evaluate(()=>document.activeElement.id),'home-ai-advance-entry');assert.deepEqual(errors,[]);
   console.log('BROWSER PASS',JSON.stringify({width,crmTasks:10,report:true,postpone:true,complete:true,reminderConfirmation:true,noRevival:true,noOverflow:true,externalProviders:'stubbed'}));await context.close();
  }
  const page=await browser.newPage();await page.route('**/v1/ai-advance/dashboard',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'合成暫時失敗'})}));await page.goto(base);await page.locator('#home-ai-advance-entry').click();await page.locator('.aa-status').filter({hasText:'合成暫時失敗'}).waitFor();assert.equal(await page.locator('[data-initial-retry]').isEnabled(),true);
 }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
