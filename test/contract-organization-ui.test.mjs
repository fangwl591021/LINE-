import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const file=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('手機會員入口與後台呈現同代並排、上下連線，可收合及重查',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const [index,js,css,admin,v2]=await Promise.all(['index.html','js/modules/contract-organization.js','css/contract-organization.css','admin.html','admin-v2.html'].map(file));
  const button=index.match(/<button[^>]+id="member-organization-entry"[\s\S]*?<\/button>/)[0];
  for(const source of [admin,v2]){assert.match(source,/value="contract" selected/);assert.match(source,/ContractOrganization\.render\(body/);}
  await page.route('https://fixture.test/',r=>r.fulfill({contentType:'text/html',body:button+'<main></main>'}));
  await page.goto('https://fixture.test/');await page.addScriptTag({content:js});await page.addStyleTag({content:css});
  await page.evaluate(()=>{window.Config={WORKER_URL:'https://fixture.test'};window.liff={getAccessToken:()=>'test',getContext:()=>({userId:'self'})};});
  const n=(name,children=[])=>({name,children,hasChildren:children.length>0});
  const urls=[];
  await page.route('**/v1/partner-applications/**',route=>{
   urls.push(new URL(route.request().url()));return route.fulfill({json:{success:true,organization:{unplaced:['丙'],root:n('本人',[n('甲',[n('孫')]),{...n('乙'),status:'reported',number:'20261101003'}])}}});
  });
  await page.locator('#member-organization-entry').click();
  const boxes=page.locator('dialog .org-person');
  await boxes.filter({hasText:'本人'}).waitFor();
  assert.equal(await page.getByText('名冊推薦・待核對').count(),1);assert.equal(await page.getByText('推薦方向待核對：丙').count(),1);
  const rect=async(name)=>boxes.filter({has:page.getByText(name,{exact:true})}).boundingBox();
  const [root,a,b,grand]=await Promise.all(['本人','甲','乙','孫'].map(rect));
  assert.ok(a.y>root.y && a.y===b.y && b.x>a.x && grand.y>a.y);
  assert.equal(await page.locator('.org-chart-scroll').evaluate(s=>s.clientWidth<=390),true);
  await boxes.filter({has:page.getByText('甲',{exact:true})}).getByRole('button').click();
  assert.equal(await page.getByText('孫',{exact:true}).isVisible(),false);
  await page.locator('dialog select').selectOption('5');
  await page.waitForFunction(()=>document.querySelector('dialog .org-chart strong')?.textContent==='本人');
  assert.equal(urls.at(-1).searchParams.get('depth'),'5');assert.equal(urls.at(-1).searchParams.has('target'),false);
  await page.getByText('關閉 ×').click();await page.locator('dialog').waitFor({state:'detached'});
  await page.evaluate(()=>window.ContractOrganization.render(document.querySelector('main'),{target:'fixture',depth:2}));
  assert.equal(urls.at(-1).pathname,'/v1/partner-applications/admin/organization');
  assert.equal(urls.at(-1).searchParams.get('target'),'fixture');
 }finally{await browser.close();}
});

