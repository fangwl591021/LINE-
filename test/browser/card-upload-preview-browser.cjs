// Synthetic image jobs only. Start PORT=8824 node test/browser/card-collection-sides-preview.mjs.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  async function setup(){
   await page.goto('http://127.0.0.1:8824/');await page.waitForFunction(()=>!!document.querySelector('#new').onclick);
   await page.evaluate(()=>{
    const base=fetch;window.jobEvents=[];
    window.fetch=async(url,options)=>{
     if(String(url).startsWith(location.origin+'/v1/card-images')){
      const event={kind:String(url).endsWith('/result')?'processed':'original',token:options.headers.authorization,aborted:false,complete:false};jobEvents.push(event);
      await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,2000);options.signal?.addEventListener('abort',()=>{event.aborted=true;clearTimeout(timer);reject(new DOMException('aborted','AbortError'));},{once:true});});event.complete=true;
     }
     return base(url,options);
    };
   });
  }
  await setup();let started=Date.now();await page.click('#new');await page.waitForSelector('#ak-start-ocr');
  assert.ok(Date.now()-started<1500,'front preview must not wait for delayed upload');
  assert.match(await page.locator('#ak-upload-status').textContent(),/可以繼續操作/);
  started=Date.now();await page.click('#back');await page.waitForFunction(()=>document.querySelector('#ak-start-ocr')?.textContent==='正反面一起辨識');
  assert.ok(Date.now()-started<1500,'back preview must not wait for delayed upload');
  await page.evaluate(()=>window.liff.getAccessToken=()=> 'ROTATED_TEST_TOKEN');
  await page.click('#ak-start-ocr');await page.waitForSelector('#ak-review-save');
  await page.check('#ak-confirm-front');await page.check('#ak-confirm-back');await page.locator('[data-ak-field="姓名"]').fill('網路等待核對');
  await page.click('#ak-review-save');
  assert.equal(await page.evaluate(()=>testCalls.filter(c=>c.action==='saveCard').length),0,'save waits for original preservation');
  await page.waitForSelector('#akaffit-card-review',{state:'detached'});
  const saved=await page.evaluate(()=>testCalls.filter(c=>c.action==='saveCard'));
  assert.equal(saved.length,1);assert.equal(saved[0].payload.姓名,'網路等待核對');
  const events=await page.evaluate(()=>jobEvents);assert.equal(events.length,4);assert.ok(events.every(e=>e.complete&&e.token==='Bearer LOCAL-ONLY'),'original/result retain same captured credential');
  console.log('PASS fast previews, status, archive-gated single record, draft preservation and captured credential');
  await setup();await page.click('#new');await page.waitForSelector('#ak-start-ocr');await page.click('#back');await page.waitForFunction(()=>!!document.querySelector('#ak-remove-back'));
  await page.click('#back');await page.waitForFunction(()=>jobEvents.filter(e=>e.aborted).length===1);
  await page.click('#ak-remove-back');await page.waitForFunction(()=>jobEvents.filter(e=>e.aborted).length===2);
  await page.click('#ak-cancel-scan');await page.waitForFunction(()=>jobEvents.every(e=>e.aborted));
  assert.equal(await page.evaluate(()=>testCalls.length),0,'replacement/removal/cancel write no records or OCR');
  assert.equal(errors.length,0);console.log('PASS replacement, back removal and cancellation stop old jobs without card writes');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
