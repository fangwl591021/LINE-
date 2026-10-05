// Run with the synthetic preview on PORT=8822. No production writes or live OCR.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=(condition,message)=>{assert.ok(condition,message);console.log('PASS '+message);};
  try{
    await page.goto('http://127.0.0.1:8822/');
    await page.waitForFunction(()=>typeof window.Cropper==='function'&&!!document.querySelector('#new').onclick);
    await page.click('#new');await page.waitForSelector('#ak-start-ocr');
    await page.click('#back');await page.waitForFunction(()=>document.querySelector('#ak-start-ocr')?.textContent==='正反面一起辨識');
    await page.click('#ak-start-ocr');await page.waitForSelector('#ak-review-save');
    await page.click('#ak-review-save');
    check((await page.locator('#ak-review-error').textContent()).includes('逐面確認'),'unconfirmed faces cannot save');
    await page.locator('[data-ak-field="姓名"]').fill('核對後姓名');
    await page.click('#ak-adjust-front');await page.waitForSelector('dialog .cropper-container');await page.click('dialog [data-cancel]');
    check(await page.locator('[data-ak-field="姓名"]').inputValue()==='核對後姓名','cancel crop preserves edited fields');
    check(!await page.locator('#ak-confirm-front').isChecked(),'cancel does not confirm the face');
    await page.click('#ak-adjust-front');await page.waitForFunction(()=>document.querySelector('dialog [data-save]')?.disabled===false);
    await page.screenshot({path:'.wrangler/card-crop-diagnosis/editor-mobile.png'});
    check(await page.evaluate(()=>document.querySelector('dialog').getBoundingClientRect().width<=innerWidth),'mobile crop editor fits viewport');
    await page.click('dialog [data-save]');await page.waitForSelector('dialog',{state:'detached'});
    check(await page.locator('#ak-confirm-front').isChecked(),'confirmed crop marks only front complete');
    check(!await page.locator('#ak-confirm-back').isChecked(),'back confirmation is independent');
    await page.check('#ak-confirm-back');await page.click('#ak-review-save');await page.waitForSelector('#akaffit-card-review',{state:'detached'});
    const writes=await page.evaluate(()=>testCalls.filter(x=>x.action==='saveCard'));
    check(writes.length===1&&writes[0].payload.姓名==='核對後姓名','paired review saves exactly one record with edited fields');
    check(Boolean(JSON.parse(writes[0].payload.自訂名片設定).collectionImages.back),'back is persisted');
    await page.click('#old');const before=await page.evaluate(()=>testCalls.length);
    await page.click('[data-repair-side="front"]');await page.waitForSelector('dialog .cropper-container');await page.click('dialog [data-cancel]');
    check(await page.evaluate(()=>testCalls.length)===before,'existing repair cancellation makes no API write');
    await page.click('[data-repair-side="front"]');await page.waitForFunction(()=>document.querySelector('dialog [data-save]')?.disabled===false);
    const replacement=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=500;const x=c.getContext('2d');x.fillStyle='#007755';x.fillRect(0,0,800,500);return c.toDataURL('image/png').split(',')[1];});
    await page.locator('dialog [data-replace]').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:Buffer.from(replacement,'base64')});
    await page.waitForFunction(()=>document.querySelector('dialog [data-save]')?.disabled===false&&document.querySelector('dialog [data-source]').cropper.getImageData().naturalWidth===800);
    check(true,'existing repair accepts replacement source photo');
    await page.click('dialog [data-rotate]');await page.click('dialog [data-reset]');await page.click('dialog [data-save]');
    await page.waitForFunction(()=>testCalls.some(x=>x.action==='updateCard'));
    const repair=await page.evaluate(()=>testCalls.filter(x=>x.action==='updateCard').at(-1));
    check(repair.payload.rowId==='EXISTING_ONE'&&!('姓名' in repair.payload.data),'existing image repair preserves record ID and contacts');
    check(await page.evaluate(()=>testCalls.filter(x=>x.action==='recognizeCardWithGPT4o').length)===1,'image-only repair never runs OCR');

    // Synthetic portrait camera frame, complete card at y=550..1190. The old wrong bbox
    // starts at y=850 and includes tabletop. Inspect pixels, not just CSS dimensions.
    await page.evaluate(async()=>{
      const c=document.createElement('canvas');c.width=1200;c.height=1600;const x=c.getContext('2d');x.fillStyle='#bbbbbb';x.fillRect(0,0,1200,1600);x.fillStyle='#992244';x.fillRect(50,550,1050,640);x.fillStyle='#ffffff';x.fillRect(75,575,1000,40);x.fillRect(75,1110,1000,40);
      const source=new File([await new Promise(r=>c.toBlob(r))],'synthetic.png',{type:'image/png'});
      const m=await import('/js/modules/card-side-crop-editor.mjs');window.cropResult=null;window.cropPromise=m.editCardSideImage(source,'正面').then(f=>window.cropResult=f);
    });
    await page.waitForFunction(()=>document.querySelector('dialog [data-save]')?.disabled===false);
    await page.evaluate(()=>document.querySelector('dialog [data-source]').cropper.setData({x:50,y:550,width:1050,height:640,rotate:0}));
    await page.click('dialog [data-save]');await page.waitForFunction(()=>!!window.cropResult);
    const pixels=await page.evaluate(async()=>{const b=await createImageBitmap(cropResult),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);return {width:b.width,height:b.height,top:[...x.getImageData(50,35,1,1).data],bottom:[...x.getImageData(50,580,1,1).data]};});
    check(pixels.width===1050&&pixels.height===640&&pixels.top[0]>240&&pixels.bottom[0]>240,'actual cropped pixels retain both top and bottom card content');

    // Optional private regression, originals remain ignored/local and never published.
    if(process.env.CARD_CROP_PRIVATE_DIR){
      for(const side of ['front','back']){
        const input=path.join(process.env.CARD_CROP_PRIVATE_DIR,side+'-original.jpg');
        await page.evaluate(async({data,side})=>{const blob=await(await fetch('data:image/jpeg;base64,'+data)).blob();const m=await import('/js/modules/card-side-crop-editor.mjs');window.cropResult=null;window.cropPromise=m.editCardSideImage(new File([blob],'original.jpg',{type:'image/jpeg'}),side==='front'?'正面':'背面').then(f=>window.cropResult=f);},{data:fs.readFileSync(input).toString('base64'),side});
        await page.waitForFunction(()=>document.querySelector('dialog [data-save]')?.disabled===false);
        const dimensions=await page.evaluate(side=>{const c=document.querySelector('dialog [data-source]').cropper;const image=c.getImageData();const scale=image.naturalWidth/1200;const box=side==='front'?{x:35,y:540,width:1080,height:660}:{x:60,y:535,width:1065,height:645};c.setData({x:box.x*scale,y:box.y*scale,width:box.width*scale,height:box.height*scale,rotate:0});return {width:image.naturalWidth,height:image.naturalHeight};},side);
        check(dimensions.height>dimensions.width,side+' camera orientation normalized before cropping');
        await page.click('dialog [data-save]');await page.waitForFunction(()=>!!window.cropResult);
        const bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await cropResult.arrayBuffer())));
        fs.writeFileSync(path.join(process.env.CARD_CROP_PRIVATE_DIR,side+'-verified.webp'),Buffer.from(bytes));
      }
    }
    check(errors.length===0,'no browser runtime errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
