const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.argv[2],url='http://127.0.0.1:8828/';fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true}),snaps={},receipt={mode:'Production UI and backend logic; synthetic local membership/card/AI fixtures',snaps,widths:[]};
  for(const width of [320,390,768,1200]){
    const page=await browser.newPage({viewport:{width,height:760}}),requests=[],errors=[];
    page.on('request',r=>{if(r.url().includes('/v1/'))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
    assert.equal(requests.length,0,'no startup data fetch');
    const left=await page.locator('#home-tutorial-entry').boundingBox(),right=await page.locator('#home-ai-advance-entry').boundingBox();assert.ok(Math.abs(left.width-right.width)<1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#home-tutorial-entry').click();assert.equal(await page.locator('[data-course]').count(),5);
    await page.locator('[data-course="ai-advance"]').click();assert.equal(requests.length,0,'tutorial never fetches account data');
    if(width===390){await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video')?.readyState>=1,{},{timeout:20000});assert.ok(Math.abs(await page.locator('#tutorial-dialog video').evaluate(v=>v.duration)-258)<1);await page.getByRole('button',{name:'執行回報',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#tutorial-dialog video').currentTime>100&&document.querySelector('#tutorial-dialog video').currentTime<110);}
    await page.evaluate(()=>window.retiredTutorialVideo=document.querySelector('#tutorial-dialog video'));await page.locator('[data-tutorial-back]').click();assert.equal(await page.evaluate(()=>window.retiredTutorialVideo.getAttribute('src')),null);await page.locator('[data-tutorial-close]').click();
    await page.locator('#home-ai-advance-entry').click();await page.locator('[data-new]').waitFor();assert.equal(await page.locator('.ai-advance-dialog video').count(),0);await page.locator('[data-new]').click();
    await page.locator('[name=title]').fill('版面驗收任務 '+width);await page.locator('[name=description]').fill('將合作提案寄給對方');await page.locator('[name=contactCardId]').selectOption('demo-contact');
    await page.getByRole('button',{name:'建立任務',exact:true}).click();await page.locator('[data-report]').waitFor();assert.equal(await page.locator('[data-ai]').isDisabled(),true);
    assert.equal(await page.locator('.aa-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    await page.locator('[name=note]').fill('已寄出提案，下週回覆');await page.getByRole('button',{name:'儲存回報',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-ai]').disabled);
    await page.locator('[data-ai]').click();await page.locator('[data-accept]').waitFor({timeout:35000});await page.locator('[data-accept]').click();await page.getByRole('heading',{name:'下週確認合作提案',exact:true}).waitFor();
    await page.locator('[data-back]').click();await page.locator('[data-new]').waitFor();await page.locator('[data-remind]').check();await page.waitForFunction(()=>!document.querySelector('[data-remind]').disabled);
    await page.locator('[data-refresh]').click();await page.locator('[data-remind]').waitFor();assert.equal(await page.locator('[data-remind]').isChecked(),true);
    await page.locator('[data-back]').click();assert.equal(await page.locator('.ai-advance-dialog').count(),0);assert.equal(await page.evaluate(()=>document.activeElement.id),'home-ai-advance-entry');assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.equal(errors.length,0,JSON.stringify(errors));receipt.widths.push({width,equalButtons:true,noOverflow:true,directEntry:true,tutorialInBeginner:true,crudReportAIConfirm:true,errors});await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:510}});await page.request.post(url+'__reset');await page.goto(url);
  async function snap(name,selector){if(selector)await page.locator(selector).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,name+'.png')});snaps[name]={file:name+'.png'};}
  await snap('home');await page.locator('#home-tutorial-entry').click();await snap('lessons');await page.locator('[data-course="ai-advance"]').click();await snap('guide');await page.locator('[data-tutorial-close]').click();await page.locator('#home-ai-advance-entry').click();await page.locator('[data-new]').waitFor();await snap('dashboard');
  await page.locator('[data-new]').click();await page.locator('[name=title]').fill('寄送合作提案');await page.locator('[name=description]').fill('介紹服務方案，討論合作需求');await page.locator('[name=contactCardId]').selectOption('demo-contact');await snap('create-top','[name=title]');await snap('create-due','[data-create] button[type=submit]');
  await page.getByRole('button',{name:'建立任務',exact:true}).click();await page.locator('[data-report]').waitFor();await snap('task');await page.locator('[name=note]').fill('已寄出提案，對方希望下週聯繫');await snap('report','[name=note]');
  await page.getByRole('button',{name:'儲存回報',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-ai]').disabled);await snap('saved','[data-ai]');
  await page.locator('[data-ai]').click();await page.locator('[data-accept]').waitFor({timeout:35000});await snap('suggestion','[data-suggestion]');await page.locator('[data-accept]').click();await page.getByRole('heading',{name:'下週確認合作提案',exact:true}).waitFor();await snap('next','h3');
  await page.locator('[data-back]').click();await page.locator('[data-remind]').waitFor();await snap('reminder','[data-remind]');
  await page.locator('[data-new]').click();await page.locator('[name=title]').fill('未儲存內容');let confirmed=false;page.once('dialog',async dialog=>{confirmed=true;await dialog.dismiss();});await page.locator('[data-close]').click();assert.ok(confirmed);assert.equal(await page.locator('[name=title]').inputValue(),'未儲存內容');page.once('dialog',d=>d.accept());await page.locator('[data-close]').click();
  fs.writeFileSync(path.join(out,'capture-receipt.json'),JSON.stringify(receipt,null,2));await browser.close();console.log('BROWSER PASS',JSON.stringify(receipt.widths));
})().catch(e=>{console.error(e);process.exit(1);});
