// Real page markup and presentation assets; only static CSS/font CDN reads are allowed.
// Home scripts are disabled. Mall APIs use the existing isolated synthetic fixture.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join,resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),OUT=resolve(ROOT,'../full-width-browser');
mkdirSync(join(OUT,'static'),{recursive:true});
const ORIGIN='https://full-width.invalid',MEASURE=process.argv.includes('--measure');
const fixtureFlag=process.argv.includes('--fixture-only');if(!fixtureFlag)process.argv.push('--fixture-only');
const {createFixture}=await import('./shop-reference-layout.mjs');if(!fixtureFlag)process.argv.splice(process.argv.indexOf('--fixture-only'),1);
const scenarios=[...[320,390,430,1280].map(width=>({name:String(width),width,height:900,insets:{top:0,left:0,right:0,bottom:0}})),{name:'landscape-safe',width:844,height:390,insets:{top:0,left:24,right:24,bottom:20}}];
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));

async function staticAsset(route,state){
  const url=route.request().url(),key=createHash('sha256').update(url).digest('hex'),cache=join(OUT,'static',key);
  let data,type;
  if(existsSync(cache)&&existsSync(cache+'.json')){data=readFileSync(cache);type=JSON.parse(readFileSync(cache+'.json','utf8')).type;}
  else{const response=await route.fetch({timeout:25000});assert.ok(response.ok(),'static CDN asset available');data=await response.body();type=response.headers()['content-type']||'application/octet-stream';writeFileSync(cache,data);writeFileSync(cache+'.json',JSON.stringify({url,type}));}
  state.staticAssets.push(url);return route.fulfill({contentType:type,body:data});
}
async function homeFixture(browser,scenario){
  const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},serviceWorkers:'block'}),page=await context.newPage(),state={errors:[],blocked:[],writes:[],staticAssets:[]};
  page.on('pageerror',error=>state.errors.push(error.message));
  let html=readFileSync(join(ROOT,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>/src="https:\/\/cdn\.tailwindcss\.com|tailwind\.config\s*=/.test(tag)?tag:'');
  html=html.replace(/\son[a-z]+="[^"]*"/gi,'').replace('<body class="','<body class="home-page shared-front-banner-page ').replace('id="loading-screen" class="','id="loading-screen" class="hidden ').replace('id="page-home" class="hidden ','id="page-home" class="');
  html=html.replace(/(<img id="home-profile-avatar")/,'$1 src="assets/points-logo-transparent-20260916.png"');
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(!['GET','HEAD'].includes(request.method())){state.writes.push(request.url());return route.abort();}
    if(url.origin!==ORIGIN){
      if(['cdn.tailwindcss.com','fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return staticAsset(route,state);
      if(request.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'});
      if(request.resourceType()==='stylesheet')return route.fulfill({contentType:'text/css',body:''});
      state.blocked.push(request.url());return route.abort();
    }
    if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
    const file=resolve(ROOT,decodeURIComponent(url.pathname).replace(/^\/+/,''));
    if(!file.startsWith(ROOT+sep)||!existsSync(file)){state.blocked.push(url.pathname);return route.fulfill({status:404,body:'Missing fixture asset'});}
    return route.fulfill({path:file,contentType:extname(file)==='.css'?'text/css':undefined});
  });
  await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>[...document.querySelectorAll('style')].some(style=>style.textContent.includes('--tw-border-spacing-x')),{},{timeout:30000});
  await page.evaluate(()=>document.fonts.ready);
  return {context,page,state,close:()=>context.close()};
}
async function measure(f,view,scenario){
  const {page}=f;await page.setViewportSize({width:scenario.width,height:scenario.height});
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:scenario.insets});
  await settle(page);
  const selectors=view==='home'?['#app','#main','#page-home','#home-discovery-header','#home-profile-card','#home-mall-banner','#home-shop-categories','#home-primary-shortcuts','.home-teaching-row','#home-ai-services','#home-feature-section','#home-recent-activity','#home-discovery-bottom']:
    view==='explore'?['#main','#page-store-shop','.store-shop','.shop-brand','.shop-content','.shop-explore-view','.shop-explore-hero','.shop-explore-grid','.shop-bottom-nav']:
    ['#main','#page-store-shop','.store-shop','.shop-brand','.shop-content','.merchant-workbench','.mw-primary-actions','.mw-secondary-actions','.mw-tools','.mw-footer-actions','.shop-bottom-nav'];
  const result=await page.evaluate(({selectors,view,insets})=>{
    const root=view==='home'?document.getElementById('app'):document.getElementById('page-store-shop'),style=n=>getComputedStyle(n),visible=n=>{const r=n.getBoundingClientRect(),s=style(n);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.clip!=='rect(0px, 0px, 0px, 0px)'&&s.clipPath!=='inset(50%)';},rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const width=document.documentElement.clientWidth;
    const edges=selectors.map(selector=>{const n=document.querySelector(selector);return {selector,missing:!n,...(n?{visible:visible(n),...rect(n),paddingLeft:style(n).paddingLeft,paddingRight:style(n).paddingRight,maxWidth:style(n).maxWidth}:{} )};});
    const nodes=[...root.querySelectorAll('button,a[href],summary,input:not([type=hidden])')].filter(visible);
    const controls=nodes.map(n=>({name:n.id||n.dataset.do||n.textContent.trim().slice(0,45),...rect(n)}));
    const small=controls.filter(r=>r.width<43.5||r.height<43.5);
    // A full-bleed banner/strip may have a full-width hit area. Its visible
    // labels and actionable icons, rather than decorative backgrounds, stay safe.
    const content=[];
    for(const n of nodes){const r=n.getBoundingClientRect();if(r.bottom<=0||r.top>=innerHeight||r.left< -1||r.right>width+1)continue;
      const name=n.id||n.dataset.do||n.textContent.trim().slice(0,45),walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);
      for(let text=walker.nextNode();text;text=walker.nextNode())if(text.textContent.trim()&&visible(text.parentElement)){const range=document.createRange();range.selectNodeContents(text);const box=range.getBoundingClientRect();if(box.width&&box.height)content.push({name,left:box.left,right:box.right});}
      for(const icon of n.querySelectorAll('svg,img'))if(visible(icon)&&!n.matches('#home-mall-banner'))content.push({name,...rect(icon)});
    }
    const safeViolations=content.filter(r=>r.left<insets.left-.5||r.right>width-insets.right+.5);
    const probe=document.createElement('div');probe.style.cssText='position:fixed;padding-left:env(safe-area-inset-left);padding-bottom:env(safe-area-inset-bottom);visibility:hidden';document.body.append(probe);const safeComputed={left:style(probe).paddingLeft,bottom:style(probe).paddingBottom};probe.remove();
    return {width,viewport:innerWidth,documentOverflow:document.documentElement.scrollWidth>width+1,appOverflow:root.scrollWidth>root.clientWidth+1,edges,small,safeViolations,safeComputed};
  },{selectors,view,insets:scenario.insets});
  await page.screenshot({path:join(OUT,`${view}-${scenario.name}.png`),fullPage:false});
  await page.evaluate(()=>{for(const n of [document.scrollingElement,document.getElementById('main')])if(n)n.scrollTop=n.scrollHeight;});await settle(page);
  result.bottom=await page.evaluate(view=>{
    const nav=document.querySelector(view==='home'?'#home-discovery-bottom':'.shop-bottom-nav');
    const last=view==='home'?[...document.querySelector('#page-home').children].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0;}).sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0]:document.querySelector(view==='explore'?'.shop-explore-footnote':'.mw-plan-details');
    return {navTop:nav?.getBoundingClientRect().top,lastBottom:last?.getBoundingClientRect().bottom,last:last?.id||last?.className,navBottom:nav?.getBoundingClientRect().bottom,viewportHeight:innerHeight};
  },view);
  await page.screenshot({path:join(OUT,`${view}-${scenario.name}-bottom.png`),fullPage:false});
  await cdp.detach();return result;
}
function validate(result,view,scenario){
  const failures=[];
  if(result.documentOverflow)failures.push('document horizontal overflow');
  if(result.appOverflow)failures.push('app horizontal overflow');
  const safeContent=view==='explore'?['.shop-explore-hero','.shop-explore-grid']:view==='merchant'?['.mw-primary-actions','.mw-secondary-actions','.mw-tools','.mw-footer-actions']:[];
  for(const edge of result.edges){const left=safeContent.includes(edge.selector)?scenario.insets.left:0,right=result.width-(safeContent.includes(edge.selector)?scenario.insets.right:0);if(edge.missing||!edge.visible)failures.push(edge.selector+' missing or hidden');else if(Math.abs(edge.left-left)>1||Math.abs(edge.right-right)>1)failures.push(`${edge.selector} outer edge ${edge.left.toFixed(1)}..${edge.right.toFixed(1)} / ${left}..${right}`);}
  if(result.small.length)failures.push('touch targets below 44px: '+result.small.map(c=>`${c.name} ${c.width.toFixed(1)}x${c.height.toFixed(1)}`).join(', '));
  if(result.bottom.lastBottom>result.bottom.navTop+1)failures.push('last content overlaps fixed bottom navigation');
  if(Math.abs(result.bottom.navBottom-result.bottom.viewportHeight)>1)failures.push('bottom navigation does not meet viewport edge');
  if(scenario.insets.left&&result.safeViolations.length)failures.push('interactive controls enter landscape safe area: '+result.safeViolations.map(c=>c.name).join(', '));
  if(scenario.insets.left&&parseFloat(result.safeComputed.left)!==scenario.insets.left)failures.push('safe-area emulation not applied');
  return {view,scenario:scenario.name,...result,failures};
}

const browser=await playwright.chromium.launch({channel:'chrome',headless:true}),results=[];
try{
  for(const scenario of scenarios){
    for(const view of ['home','explore','merchant']){
      const f=view==='home'?await homeFixture(browser,scenario):await createFixture(browser,{width:scenario.width,role:view==='merchant'?'store':'user'});
      try{
        if(view==='explore')await f.page.locator('.shop-explore-card').first().waitFor();
        if(view==='merchant')await f.page.locator('[data-merchant-name]').filter({hasText:'合成測試本人店家'}).waitFor();
        const result=validate(await measure(f,view,scenario),view,scenario);results.push(result);
        assert.deepEqual(f.state.errors,[],'no runtime errors');assert.deepEqual(f.state.blocked,[],'no unknown requests');assert.deepEqual(f.state.writes,[],'zero writes');
        console.log(JSON.stringify({view,scenario:scenario.name,failures:result.failures,edges:result.edges.map(e=>({selector:e.selector,left:e.left,right:e.right})),safe:result.safeComputed}));
      }finally{await f.close();}
    }
  }
}finally{await browser.close();}
writeFileSync(join(OUT,'report.json'),JSON.stringify({mode:MEASURE?'measure':'assert',results,productionRequests:0,apiWrites:0},null,2));
if(!MEASURE)assert.deepEqual(results.filter(result=>result.failures.length).map(({view,scenario,failures})=>({view,scenario,failures})),[],'all full-width geometry checks pass');
console.log(JSON.stringify({passed:results.every(result=>!result.failures.length),measured:results.length,report:join(OUT,'report.json')}));
