const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const card={name:'陶藝工坊',description:'手作陶器',address:'合成路',phone:'0223456789',image_url:'https://test.invalid/photo.jpg'};
    let cardReads=0,available=true;
    let saved=null,polishes=0,saves=0,hold=false,release;
    const polished='喜歡手作陶器嗎？歡迎來看看我們的作品。';
    const management=()=>({success:true,cooperation_plan:{id:'full',label:'雙向完整版'},shop:saved,card_prefill:saved?undefined:card,products:[],product_limit:20,product_count:0});
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/')return route.fulfill({contentType:'text/html;charset=utf-8',body:'<main id="root"></main>'});
      if(url.pathname.endsWith('/my-card')){cardReads++;return route.fulfill({json:{success:true,card:available?card:null}});}
      if(url.pathname.endsWith('/manage')){assert.equal(url.searchParams.get('card_prefill'),'1');return route.fulfill({json:management()});}
      if(url.pathname.endsWith('/polish-intro')){
        polishes++;if(hold)await new Promise(r=>release=r);
        return route.fulfill({json:{success:true,description:polished}});
      }
      if(url.pathname.endsWith('/store')){
        saved={...route.request().postDataJSON(),id:'test-store',version:1};saves++;
        return route.fulfill({json:management()});
      }
      return route.abort();
    });
    await page.goto('https://test.invalid/');
    await page.addScriptTag({content:fs.readFileSync('js/modules/store-shop.js','utf8')});
    await page.evaluate(()=>{
      window.currentPage='store-shop';window.Config={WORKER_URL:location.origin};window.userRole='store';
      window.currentUserProfile={userId:'synthetic'};window.liff={isLoggedIn:()=>true,getAccessToken:()=>'synthetic'};
      window.requestIdleCallback=()=>0;window.openForm=()=>StoreShop.mount(document.querySelector('main'),false,'','','','manage');window.openForm();
    });
    const form=page.locator('[data-form=store]'),desc=form.locator('[name=description]');
    await page.getByText('介紹已依名片服務美化，可直接修改。').waitFor();
    assert.equal(await desc.inputValue(),polished);assert.equal(await form.locator('[name=status]').inputValue(),'draft');
    assert.equal(await form.locator('[name=image_url]').inputValue(),card.image_url);
    assert.equal(await form.locator('.shop-upload-preview img').getAttribute('src'),card.image_url);
    assert.equal(await form.locator('[name=name]').inputValue(),card.name);assert.equal(saves,0);
    await page.getByRole('button',{name:'使用名片原文'}).click();assert.equal(await desc.inputValue(),card.description);
    hold=true;await form.locator('[data-polish]').click();await desc.fill('我自己寫的');
    while(!release)await new Promise(r=>setTimeout(r,10));release();hold=false;
    await page.getByText('內容已變更，可重新美化。').waitFor();assert.equal(await desc.inputValue(),'我自己寫的');
    await form.locator('[data-polish]').click();await form.locator('[data-apply]').waitFor();assert.equal(await desc.inputValue(),'我自己寫的');
    await form.locator('[data-apply]').click();assert.equal(await desc.inputValue(),polished);
    await desc.fill('已核對的店家介紹');await form.getByRole('button',{name:'儲存店面',exact:true}).click();
    await form.locator('[data-polish]').waitFor({state:'detached'});assert.equal(saved.status,'draft');assert.equal(saves,1);
    await page.evaluate(()=>openForm());await form.waitFor();assert.equal(await desc.inputValue(),saved.description);assert.equal(polishes,3);
    saved={...saved,status:'active',image_url:'https://test.invalid/old-cover.jpg'};
    await page.evaluate(()=>openForm());
    await page.waitForFunction(()=>document.querySelector('[data-form=store] [name=status]')?.value==='active');
    const openImport=page.getByRole('button',{name:'從我的名片匯入'});
    await openImport.waitFor();assert.equal(cardReads,0);
    await form.locator('[name=name]').fill('自選店名');await form.locator('[name=address]').fill('');
    const panel=form.locator('[data-card-preview]');
    await openImport.click();await panel.waitFor();
    assert.ok(await panel.locator('[data-card-field=address]').isChecked());
    assert.ok(!await panel.locator('[data-card-field=name]').isChecked());
    await panel.getByRole('button',{name:'取消'}).click();assert.equal(await desc.inputValue(),'已核對的店家介紹');assert.equal(saves,1);
    available=false;await openImport.click();await page.getByText(/本人名片目前沒有可匯入的資料/).waitFor();
    assert.equal(await form.locator('[name=address]').inputValue(),'');
    available=true;await openImport.click();await panel.waitFor();
    await form.locator('[name=address]').fill('編輯中的地址');
    await panel.locator('[data-import-apply]').click();await page.getByText('表單資料已變動，請重新開啟匯入預覽。').waitFor();
    await openImport.click();await panel.waitFor();
    for(const key of ['address','description','image_url'])await panel.locator('[data-card-field='+key+']').check();
    await panel.locator('[data-import-apply]').click();await page.getByText('介紹已依名片服務美化，可直接修改。').waitFor();
    assert.equal(await desc.inputValue(),polished);assert.equal(await form.locator('[name=name]').inputValue(),'自選店名');
    assert.equal(await form.locator('[name=address]').inputValue(),card.address);assert.equal(await form.locator('[name=status]').inputValue(),'active');assert.equal(saves,1);
    assert.equal(saved.image_url,'https://test.invalid/old-cover.jpg');assert.equal(await form.locator('.shop-upload-preview img').getAttribute('src'),card.image_url);
    await form.getByRole('button',{name:'儲存店面',exact:true}).click();await form.locator('[data-polish]').waitFor({state:'detached'});
    await page.evaluate(()=>openForm());await openImport.waitFor();assert.equal(await desc.inputValue(),polished);assert.equal(saves,2);assert.equal(saved.image_url,card.image_url);assert.equal(saved.status,'active');
    assert.deepEqual(errors,[]);console.log('PASS mobile first setup and existing shop opt-in, preview, cancellation, missing card, concurrent edits, photo and intro selection, explicit save and reopen');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
