const {spawn}=require('node:child_process'),{chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
(async()=>{
 const server=spawn(process.execPath,['test/browser/home-spacing-preview.mjs'],{stdio:['ignore','pipe','pipe']});
 let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(let i=0;i<100&&!log.includes('Static homepage preview');i++)await new Promise(r=>setTimeout(r,50));
  if(!log.includes('Static homepage preview'))throw Error('preview failed '+log);
  const results=[];
  for(const width of [320,390,1280]){
   const page=await browser.newPage({viewport:{width,height:844}});
   await page.goto('http://127.0.0.1:8776/?role=user',{waitUntil:'domcontentloaded',timeout:15000});
   await page.waitForFunction(()=>getComputedStyle(document.getElementById('home-discovery-header')).display==='flex');
   await page.addScriptTag({content:fs.readFileSync('js/modules/home-discovery-20261110.js','utf8')});
   const state=await page.evaluate(()=>{
    window.demo=[];window.openStoreShop=(...args)=>window.demo.push(args);window.openPointsWallet=()=>window.demo.push('wallet');
    window.openHomeShopCategory('食');window.openHomeShopCategory('未知');window.userRole='user';window.openHomePointAction();window.userRole='store';window.openHomePointAction();
    const box=id=>document.getElementById(id).getBoundingClientRect();
    return {width:document.documentElement.scrollWidth,viewport:innerWidth,hero:box('home-mall-banner').top,cats:box('home-shop-categories').top,shortcuts:box('home-primary-shortcuts').top,teaching:document.querySelector('.home-teaching-row').getBoundingClientRect().top,ai:box('home-ai-services').top,footer:getComputedStyle(document.getElementById('home-discovery-bottom')).display,calls:window.demo};
   });
   assert.equal(state.width<=state.viewport,true,'no page horizontal overflow');
   assert.ok(state.hero<state.cats&&state.cats<state.shortcuts&&state.shortcuts<state.teaching&&state.teaching<state.ai,JSON.stringify(state));
   assert.equal(state.footer,'flex');assert.equal(state.calls[0][5].initialCategory,'食');assert.equal(state.calls[1][5].initialCategory,'');assert.equal(state.calls[2],'wallet');assert.equal(state.calls[3][3],'cashier');
   await page.screenshot({path:path.join(os.tmpdir(),'home-discovery-'+width+'.png'),fullPage:true});
   results.push({width,order:true,category:true,roles:true,overflow:false});await page.close();
  }
  console.log('PASS '+JSON.stringify(results));
 }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
