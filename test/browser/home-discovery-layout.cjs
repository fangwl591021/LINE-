const {spawn}=require('node:child_process'),{chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto'),staticCache=path.resolve(__dirname,'../../../full-width-browser/static');
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
   await page.route('**/*',route=>{
    const url=route.request().url(),host=new URL(url).hostname;
    if(['cdn.tailwindcss.com','fonts.googleapis.com','fonts.gstatic.com'].includes(host)){
     const file=path.join(staticCache,createHash('sha256').update(url).digest('hex'));
     if(fs.existsSync(file)&&fs.existsSync(file+'.json'))return route.fulfill({contentType:JSON.parse(fs.readFileSync(file+'.json','utf8')).type,body:fs.readFileSync(file)});
    }
    return route.continue();
   });
   await page.goto('http://127.0.0.1:8776/?role=user',{waitUntil:'domcontentloaded',timeout:15000});
   await page.waitForFunction(()=>getComputedStyle(document.getElementById('home-discovery-header')).display==='flex'&&document.getElementById('home-my-card-button').getBoundingClientRect().height>=44);
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
   const shortcuts=await page.evaluate(html=>{
    const grid=document.querySelector('#home-primary-shortcuts>div'),exchange=document.getElementById('home-exchange-zone-button');
    const geometry=()=>[...grid.children].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.height;}).map(n=>{const r=n.getBoundingClientRect();return {label:n.querySelector('.home-quick-label').textContent.trim(),left:r.left,right:r.right,top:r.top};}).sort((a,b)=>a.left-b.left);
    // Positive presentation only; this does not exercise membership access checks.
    const gateClass=exchange.classList.contains('hidden');exchange.classList.remove('hidden');
    const withExchange=geometry(),gap=parseFloat(getComputedStyle(grid).columnGap),source=new DOMParser().parseFromString(html,'text/html'),calls=[];
    // The static preview strips inline handlers. Restore the real source handlers
    // only for these controls, with local spies instead of navigation or writes.
    window.openMyCardEntry=event=>calls.push(event instanceof MouseEvent?'my-card':'invalid-event');window.openBusinessRichman=()=>calls.push('island');window.openExchangeZone=()=>calls.push('exchange');window.goPage=target=>calls.push('page:'+target);
    for(const selector of ['#home-my-card-button','[aria-label="開啟人脈島"]','#home-exchange-zone-button','#inbox-nav-button','#home-primary-shortcuts>div>button:nth-child(5)']){
     const node=document.querySelector(selector),original=source.querySelector(selector);node.setAttribute('onclick',original.getAttribute('onclick'));node.click();
    }
    exchange.classList.add('hidden');
    return {gateClass,withExchange,gap,calls,overflow:document.documentElement.scrollWidth>innerWidth+1,localScroll:grid.scrollWidth>grid.clientWidth};
   },fs.readFileSync('index.html','utf8'));
   assert.equal(shortcuts.gateClass,true,'the original exchange visibility gate class stays on the source element');
   assert.deepEqual(shortcuts.withExchange.slice(0,6).map(n=>n.label),['收藏名片','我的名片','人脈島','交流專區','收件夾','個人行事曆']);
   for(const [left,right]of [[1,2],[2,3]]){
    const a=shortcuts.withExchange[left],b=shortcuts.withExchange[right];assert.ok(Math.abs(a.top-b.top)<1,'adjacent shortcuts stay in the same row');assert.ok(Math.abs(b.left-a.right-shortcuts.gap)<1,'island and exchange sit immediately after my card');
   }
   assert.deepEqual(shortcuts.calls,['my-card','island','exchange','page:inbox','page:my-activities'],'source inline handlers keep their original destinations');assert.equal(shortcuts.overflow,false,'only the shortcut strip may scroll horizontally');
   await page.screenshot({path:path.join(os.tmpdir(),'home-discovery-'+width+'.png'),fullPage:true});
   results.push({width,order:true,category:true,roles:true,shortcutAdjacency:true,originalHandlers:true,exchangeGateClassPreserved:true,localShortcutScroll:shortcuts.localScroll,overflow:false});await page.close();
  }
  console.log('PASS '+JSON.stringify(results));
 }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
