// Local synthetic identities and wallet only. Never sends a real point action.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const files=new Set(['/js/modules/home-discovery-20261110.js','/js/modules/store-wallet-popup.js','/js/vendor/qrcode-generator-2.0.4.mjs','/css/store-shop.css']);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end('<!doctype html><meta charset="utf-8"><button id="open" onclick="openHomeMemberQr()">我的 QR</button><script src="/js/modules/home-discovery-20261110.js"></script>');}
 if(!files.has(url.pathname)){res.writeHead(404);return res.end();}
 const type=url.pathname.endsWith('.css')?'text/css':'text/javascript';
 res.writeHead(200,{'content-type':type});res.end(fs.readFileSync(path.join(root,url.pathname.slice(1))));
});
const until=(page,expr)=>page.waitForFunction(expr,{timeout:6000});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(()=>{
   window.currentPage='home';window.currentUserProfile={userId:'U'+'a'.repeat(32)};window.testToken='token-a';window.logged=true;
   window.liff={isLoggedIn:()=>window.logged,getAccessToken:()=>window.testToken};window.calls=[];
   window.fetchAPI=async(action,payload)=>{window.calls.push({action,payload});return {success:true,data:{source:'mother',balance:88,queriedLineUserId:'U'+'b'.repeat(32)}};};
  });
  for(const role of ['user','store','admin']){
   await page.evaluate(r=>window.userRole=r,role);await page.click('#open');await until(page,()=>document.querySelector('.store-wallet-popup [data-status]')?.textContent==='請店家掃描此 QR 碼');
   assert.equal(await page.locator('.store-wallet-popup [data-status]').textContent(),'請店家掃描此 QR 碼');
   assert.equal(await page.evaluate(async()=>{const {default:qrcode}=await import('/js/vendor/qrcode-generator-2.0.4.mjs');const qr=qrcode(0,'M');qr.addData('U'+'b'.repeat(32),'Byte');qr.make();const expected=document.createElement('div');expected.innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});return document.querySelector('.store-wallet-popup svg').outerHTML===expected.firstElementChild.outerHTML;}),true,'QR uses the mother-confirmed wallet identity');
   assert.equal(await page.evaluate(()=>window.currentPage),'home');
   await page.locator('.store-wallet-popup [data-close]').click();
  }
  assert.ok((await page.evaluate(()=>window.calls)).every(c=>c.action==='queryPointBalanceFast'));
  // A failed balance lookup for a new account must never render a QR or invent zero.
  await page.evaluate(()=>{window.currentUserProfile={userId:'U'+'c'.repeat(32)};window.fetchAPI=async()=>({success:false});});
  await page.click('#open');await until(page,()=>document.querySelector('.store-wallet-popup [data-retry]')?.hidden===false);
  assert.equal(await page.locator('.store-wallet-popup svg').count(),0);
  assert.doesNotMatch(await page.locator('.store-wallet-popup [data-balance]').textContent(),/0 點/);
  await page.locator('.store-wallet-popup [data-close]').click();
  // Account and token changes, and leaving home, must close and remove the QR.
  for(const change of ['account','token','navigation']){
   await page.evaluate(kind=>{
    window.currentPage='home';window.currentUserProfile={userId:'U'+({account:'d',token:'e',navigation:'f'}[kind]).repeat(32)};
    window.fetchAPI=async()=>({success:true,data:{source:'mother',balance:1,queriedLineUserId:'U'+'b'.repeat(32)}});
   },change);
   await page.click('#open');await until(page,()=>document.querySelector('.store-wallet-popup svg'));
   await page.evaluate(kind=>{if(kind==='account')window.currentUserProfile={userId:'U'+'1'.repeat(32)};else if(kind==='token')window.testToken='token-b';else window.currentPage='card';},change);
   await until(page,()=>!document.querySelector('.store-wallet-popup'));
  }
  console.log('PASS local synthetic QR: roles, confirmed wallet, failure, account/token/navigation isolation');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
