// Real directory/editor UI + actual new Worker handler, isolated SQLite/providers only.
const {createServer}=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const {rewardFixture,REWARD}=await import('../fixtures/reward-unit-directory.mjs');
  const f=rewardFixture(),requests=[];let origin,failList=false;
  for(let n=1;n<=4;n++){const uid='U'+String(n).padStart(32,'0');f.sql.prepare("INSERT INTO users(row_id,line_id,role) VALUES(?,?,'reward')").run(uid,uid);f.sql.prepare("INSERT INTO reward_unit_publications(id,target_uid,name,description,reward_terms,status,version,updated_at) VALUES(?,?,?,?,?,'active',1,'now')").run('00000000-0000-4000-8000-'+String(n).padStart(12,'0'),uid,'合成合作單位'+n,'這是合成公司介紹，不是真實商家。','參加合成活動，核對資格後才贈點。');}
  const allowed=new Set(['js/modules/store-shop.js','js/modules/store-points-home.js','js/modules/reward-units.js','js/modules/reward-unit-editor.js','css/store-shop.css','css/reward-unit-editor.css','assets/points-logo-transparent-20260916.png']);
  const server=createServer(async(req,res)=>{try{
    const url=new URL(req.url,origin),file=url.pathname.slice(1);requests.push({method:req.method,path:url.pathname,auth:!!req.headers.authorization});
    if(url.pathname==='/'){
      const editor=url.searchParams.has('editor');res.setHeader('Content-Type','text/html;charset=utf-8');
      res.end('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>贈點單位・隔離驗收</title><link rel="stylesheet" href="/css/store-shop.css"><link rel="stylesheet" href="/css/reward-unit-editor.css"><body style="margin:0">'+(editor?'<button id="open" onclick="openRewardUnitEditor(\''+REWARD+'\')">CRM 贈點單位上架</button>':'<main id="public-store-shop" data-worker="'+origin+'"></main>')+'<script>window.Config={WORKER_URL:location.origin};window.userRole="admin";window.currentPage="store-shop";window.liff={isLoggedIn:()=>true,getAccessToken:()=>"admin"};window.goPage=p=>window.currentPage=p;window.showToast=()=>{};</script><script src="/js/modules/'+(editor?'reward-unit-editor.js':'store-shop.js')+'"></script></body></html>');return;
    }
    if(allowed.has(file)){res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png');res.end(fs.readFileSync(file));return;}
    if(url.pathname.startsWith('/v1/reward-units')){
      if(failList&&url.pathname==='/v1/reward-units'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,error:'合成斷線測試'}));return;}
      const chunks=[];for await(const c of req)chunks.push(c);const response=await f.fetch(new Request(url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(url.pathname==='/v1/store-shop'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,shops:[],next:''}));return;}
    res.writeHead(404);res.end();
  }catch(error){console.error(error);res.writeHead(500);res.end('Fixture error');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true}),out=path.join(os.tmpdir(),'reward-unit-directory-qa-20261020');fs.mkdirSync(out,{recursive:true});
  try{
    const results=[];
    for(const width of [320,390,1280]){
      const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
      await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      await page.goto(origin+'/?editor=1');await page.locator('#open').click();const dialog=page.locator('dialog');await dialog.locator('form').waitFor();
      const before=f.sql.prepare('SELECT count(*) n FROM reward_unit_publication_audit').get().n;await dialog.locator('[data-close]').first().click();assert.equal(f.sql.prepare('SELECT count(*) n FROM reward_unit_publication_audit').get().n,before);
      await page.locator('#open').click();await dialog.locator('form').waitFor();
      await dialog.locator('[name=name]').fill('合成公開單位 '+width);await dialog.locator('[name=description]').fill('此為合成驗收用公司，提供生活體驗與合作方案。');await dialog.locator('[name=phone]').fill('02-2345-6789');await dialog.locator('[name=address]').fill('新北市合成路1號');await dialog.locator('[name=reward_terms]').fill('參加指定合成活動，經單位核對資格後贈點。');await dialog.locator('[name=status]').selectOption('active');
      await dialog.getByRole('button',{name:'確認儲存',exact:true}).click();assert.match(await dialog.locator('[data-result]').innerText(),/勾選公開確認/);assert.equal(f.sql.prepare('SELECT count(*) n FROM reward_unit_publication_audit').get().n,before);
      await dialog.locator('[name=confirmed_public]').check();await dialog.getByRole('button',{name:'確認儲存',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-result]')?.textContent.includes('已儲存並公開'));
      assert.equal(f.sql.prepare('SELECT count(*) n FROM reward_unit_publication_audit').get().n,before+1);await page.screenshot({path:path.join(out,'editor-'+width+'.png'),fullPage:true});await dialog.locator('[data-close]').first().click();
      const writes=f.sql.prepare('SELECT total_changes() n').get().n;
      await page.goto(origin);await page.locator('[data-home-reward-units] article').first().waitFor();assert.equal(await page.locator('[data-home-reward-units] article').count(),3);
      const position=await page.evaluate(()=>({reward:document.querySelector('.points-reward-units').getBoundingClientRect().top,shop:[...document.querySelectorAll('.points-section-title')].find(n=>n.textContent.includes('探索好店')).getBoundingClientRect().top}));assert.ok(position.reward<position.shop);
      assert.ok((await page.locator('.reward-unit-strip').evaluate(e=>e.scrollWidth>=e.clientWidth)));
      await page.screenshot({path:path.join(out,'home-'+width+'.png'),fullPage:true});await page.locator('[data-do=reward-units]').click();await page.locator('[data-unit-search]').waitFor();
      assert.equal(await page.locator('.reward-unit-list article').count(),5);await page.locator('[data-unit-search] input').fill('合成公開單位 '+width);await page.locator('[data-unit-search] button').click();await page.waitForFunction(()=>document.querySelectorAll('.reward-unit-list article').length===1);
      await page.locator('[data-unit-action=detail]').click();await page.locator('.reward-unit-detail').waitFor();assert.match(await page.locator('.reward-unit-detail').innerText(),/新北市合成路1號/);assert.equal(await page.getByRole('link',{name:'撥打電話'}).getAttribute('href'),'tel:0223456789');assert.equal(await page.locator('[data-do=point-reward],[data-do=member-qr]').count(),0);
      await page.screenshot({path:path.join(out,'detail-'+width+'.png'),fullPage:true});await page.locator('[data-unit-action=back]').click();await page.locator('[data-unit-search]').waitFor();await page.locator('[data-unit-search] input').fill('不存在的合成單位');await page.locator('[data-unit-search] button').click();await page.getByText('目前尚無核准公開的贈點單位。',{exact:true}).waitFor();
      await page.locator('[data-unit-action=back]').click();await page.locator('[data-home-reward-units]').waitFor();assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,writes);
      failList=true;await page.locator('[data-do=reward-units]').click();await page.getByText('合成斷線測試',{exact:true}).waitFor();failList=false;await page.locator('[data-unit-action=retry]').click();await page.locator('[data-unit-search]').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'document has no horizontal overflow');assert.deepEqual(errors,[]);results.push({width,cancelWrites:0,explicitConfirmation:true,reviewedSave:true,threeHorizontalCards:true,listSearchDetailBack:true,emptyAndRetry:true,publicWrites:0,jsErrors:0});await page.close();
    }
    assert.ok(requests.filter(r=>r.path==='/v1/reward-units').every(r=>!r.auth));assert.equal(requests.some(r=>/wallet|store-commerce|cashier|qr/.test(r.path)),false);
    console.log(JSON.stringify({passed:true,results,out,productionWrites:0,providers:'synthetic'}));
  }finally{await browser.close();await new Promise(r=>server.close(r));f.sql.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
