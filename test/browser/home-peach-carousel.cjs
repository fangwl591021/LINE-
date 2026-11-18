const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const carousel=html.slice(html.indexOf('      <section id="home-promo-carousel"'),html.indexOf('\n      <section id="home-network-search-entry"'));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of [320,390,1280]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.route('https://home.test/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/css/home-discovery-20261110.css"><body class="home-page"><div id="page-home">${carousel}</div><script>window.openStoreShop=(...args)=>{window.lastShop=args};</script><script src="/js/modules/home-discovery-20261110.js"></script></body>`});
    const name='.'+url.pathname;if(!fs.existsSync(name))return route.fulfill({status:404,body:'missing'});
    const type=url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.webp')?'image/webp':'image/jpeg';
    return route.fulfill({contentType:type,body:fs.readFileSync(name)});
   });
   await page.goto('https://home.test/');
   const frame=await page.locator('.home-promo-frame').boundingBox();
   for(let i=0;i<7;i++){
    await page.locator(`[data-promo-index="${i}"]`).click();
    const slide=page.locator('.home-promo-slide').nth(i),image=slide.locator('img');
    await image.evaluate(im=>im.decode());
    const geometry=await slide.boundingBox();assert.ok(Math.abs(geometry.height-frame.height)<1&&Math.abs(geometry.width-frame.width)<1);
    assert.ok((await image.evaluate(im=>im.naturalWidth))>0,'image loaded');
    await slide.click({position:{x:10,y:10}});
    assert.equal(await page.evaluate(()=>window.lastShop?.[3]),'partners');
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.close();
  }
  console.log('PASS 7 linked slides with loaded images and equal dimensions at 320/390/1280px');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
