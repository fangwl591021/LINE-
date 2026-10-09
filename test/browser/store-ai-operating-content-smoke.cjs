const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mkdirSync}=require('node:fs');
(async()=>{
  const {startPreview,description}=await import('./store-ai-operating-content-preview.mjs');
  const server=await startPreview(),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const width of [320,390,1366]){
      const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
      const external=[];page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});
      await page.goto(base,{waitUntil:'networkidle'});await page.locator('[data-store-tax-id]').fill('24456660');
      await page.getByRole('button',{name:'統編查公司',exact:true}).click();
      await page.getByRole('status').filter({hasText:'官方登記資料已查到'}).waitFor();
      assert.equal(await page.locator('[data-ai-field="description"]').count(),0);
      await page.getByRole('button',{name:'AI 補充介紹',exact:true}).click();
      await page.getByRole('status').filter({hasText:'草稿已完成'}).waitFor();
      assert.equal(await page.locator('.shop-ai-field').filter({has:page.locator('[data-ai-field="description"]')}).locator('.shop-ai-value').innerText(),description);
      assert.equal(await page.locator('[name="description"]').inputValue(),'原有介紹');
      assert.equal(await page.locator('[data-ai-field="description"]').isChecked(),false);
      // Regeneration must execute search again, not silently use registration.
      // Fixture-only quota reset, before pressing the actual UI button again.
      // No production quota or store is changed by this browser harness.
      await page.request.post(base+'/test-reset-quota');
      await page.getByRole('button',{name:'重新產生草稿',exact:true}).click();
      await page.getByRole('status').filter({hasText:'草稿已完成'}).waitFor();
      assert.equal(await page.locator('.shop-ai-field').filter({has:page.locator('[data-ai-field="description"]')}).locator('.shop-ai-value').innerText(),description);
      const retry=await page.request.post(base+'/v1/store-shop/store-ai-draft',{headers:{Authorization:'Bearer U'+'a'.repeat(32)},data:{taxId:'24456660'}});
      assert.equal(retry.status(),429,'the original AI throttle must remain intact');
      await page.locator('[data-ai-field="description"]').check();await page.getByRole('button',{name:'確認帶入勾選欄位',exact:true}).click();
      assert.equal(await page.locator('[name="description"]').inputValue(),description);
      assert.match(await page.locator('.shop-ai-status').innerText(),/尚未儲存/);
      let metrics=await(await page.request.get(base+'/test-metrics')).json();assert.equal(metrics.saves,0);assert.deepEqual(metrics.providerSearches,[true,true]);assert.equal(metrics.businessItemLookups,0);
      await page.goto(base+'/?mode=registry-only',{waitUntil:'networkidle'});await page.locator('[data-store-tax-id]').fill('24456660');
      await page.getByRole('button',{name:'✨ AI 產生店家草稿',exact:true}).click();
      await page.getByRole('status').filter({hasText:'已取得部分資料'}).waitFor();
      assert.equal(await page.locator('[data-ai-field="description"]').count(),0);assert.equal(await page.locator('[name="description"]').inputValue(),'原有介紹');
      assert.doesNotMatch(await page.locator('.shop-ai-status').innerText(),/草稿已完成/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(process.env.STORE_AI_SCREENSHOTS){mkdirSync(process.env.STORE_AI_SCREENSHOTS,{recursive:true});await page.locator('[data-store-ai-draft]').screenshot({path:process.env.STORE_AI_SCREENSHOTS+'/partial-'+width+'.png'});}
      metrics=await(await page.request.get(base+'/test-metrics')).json();assert.equal(metrics.saves,0);assert.deepEqual(metrics.providerSearches,[true]);assert.equal(external.length,0);
      await page.getByRole('button',{name:'關閉草稿',exact:true}).click();assert.equal(await page.locator('.shop-ai-draft').count(),0);
      await page.goto(base+'/?mode=indexed',{waitUntil:'networkidle'});await page.locator('[data-store-tax-id]').fill('24456660');await page.locator('[name="description"]').fill('');
      await page.getByRole('button',{name:'✨ AI 產生店家草稿',exact:true}).click();
      await page.getByRole('status').filter({hasText:'核對索引來源'}).waitFor();
      assert.equal(await page.locator('[data-ai-field="description"]').isChecked(),false);assert.equal(await page.locator('[data-ai-field="category"]').isChecked(),false);
      assert.match(await page.locator('.shop-ai-warning').last().innerText(),/尚未直接核對內文且索引可能過時/);
      assert.equal(await page.locator('.shop-ai-field').filter({has:page.locator('[data-ai-field="description"]')}).locator('.shop-ai-value').innerText(),description);
      if(process.env.STORE_AI_SCREENSHOTS)await page.locator('[data-store-ai-draft]').screenshot({path:process.env.STORE_AI_SCREENSHOTS+'/indexed-'+width+'.png'});
      await page.getByRole('button',{name:'確認帶入勾選欄位',exact:true}).click();assert.equal(await page.locator('[name="description"]').inputValue(),'');
      metrics=await(await page.request.get(base+'/test-metrics')).json();assert.equal(metrics.saves,0);assert.equal(external.length,0);
      for(const mode of ['brand-social','social-indexed']){
        await page.goto(base+'/?mode='+mode,{waitUntil:'networkidle'});await page.locator('[name="description"]').fill('');
        await page.getByRole('button',{name:'✨ AI 產生店家草稿',exact:true}).click();
        await page.getByRole('status').filter({hasText:mode==='social-indexed'?'核對索引來源':'草稿已完成'}).waitFor();
        assert.equal(await page.locator('[data-store-tax-id]').inputValue(),'');
        assert.equal(await page.locator('.shop-ai-field').filter({has:page.locator('[data-ai-field="description"]')}).locator('.shop-ai-value').innerText(),description);
        assert.equal(await page.locator('.shop-ai-sources a[href="https://www.facebook.com/example.digital/"]').count(),1);
        assert.equal(await page.locator('[data-ai-field="description"]').isChecked(),mode==='brand-social');
        assert.equal(await page.locator('[name="description"]').inputValue(),'');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        if(process.env.STORE_AI_SCREENSHOTS)await page.locator('[data-store-ai-draft]').screenshot({path:process.env.STORE_AI_SCREENSHOTS+'/'+mode+'-'+width+'.png'});
        await page.getByRole('button',{name:'確認帶入勾選欄位',exact:true}).click();assert.equal(await page.locator('[name="description"]').inputValue(),mode==='brand-social'?description:'');
        metrics=await(await page.request.get(base+'/test-metrics')).json();assert.equal(metrics.saves,0);assert.deepEqual(metrics.providerSearches,[true]);assert.equal(metrics.businessItemLookups,0);assert.equal(external.length,0);
      }
      await context.close();console.log('PASS '+width+'px: registry→services→regenerate; company-only discovery→proven brand→public social; direct/indexed distinction; no auto-save; legal-source rejection; partial status; index review unchecked; no overflow; close');
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
