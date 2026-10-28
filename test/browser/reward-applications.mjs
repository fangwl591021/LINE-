import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {rewardFixture,ADMIN,OTHER,mapper} from '../fixtures/reward-unit-directory.mjs';
import {handleRewardApplications} from '../../worker/reward-applications.mjs';
import {seedHandSignTemplate,partnerFields,fullFields} from '../fixtures/hand-sign-applications.mjs';
import {sha256Text} from '../../worker/hand-sign-application-definition.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/[\\/]$/,'');
const kind=['reward','discount','partner','full'].includes(process.env.APPLICATION_TEST_KIND)?process.env.APPLICATION_TEST_KIND:'reward',discount=kind==='discount',extended=['partner','full'].includes(kind);
const names={reward:'贈點單位',discount:'特約折抵店家',partner:'共創夥伴115.10契約',full:'雙向完整版'};
const output=resolve(process.env.REWARD_TEST_OUTPUT||'../contract-review/'+kind+'-application-tests');mkdirSync(output,{recursive:true});
const s=rewardFixture();s.sql.exec("ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT '';ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT '';"+['0068_reward_applications.sql','0069_discount_applications.sql','0077_hand_sign_contracts.sql','0078_application_admin_notifications.sql'].map(f=>readFileSync(join(root,'migrations',f),'utf8')).join('\n'));
for(const candidate of ['partner','full']){
 const terms=await seedHandSignTemplate(s.sql,candidate);
 terms.paragraphs=Array.from({length:candidate==='partner'?102:36},(_,i)=>`合成條款段落${String(i+1).padStart(3,'0')}：這是隔離測試內容，不是正式契約。申請資料與簽名須完整核對，不得自動改變任何帳號、付款或獎金資格。完整條文應保留於簽署畫面及下載副本，供申請人與有權管理員核對。`);
 const json=JSON.stringify(terms);s.sql.prepare('UPDATE signing_application_templates SET terms_json=?,content_sha256=? WHERE kind=?').run(json,await sha256Text(json),candidate);
}
const count=()=>s.sql.prepare('SELECT count(*) n FROM '+kind+'_applications').get().n;
const auth=async(url,opts)=>{assert.equal(url,'https://api.line.me/v2/profile');return Response.json({userId:opts.headers.Authorization==='Bearer admin'?ADMIN:OTHER});};
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>合成申請測試</title><button id="start">合作申請／我的合約</button><script type="module">import {openRewardApplications} from '/js/modules/reward-applications.js';window.testToken='user';window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken};document.querySelector('#start').onclick=()=>openRewardApplications({base:location.origin,admin:window.testToken==='admin'});</script></html>`;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/v1/')){const chunks=[];for await(const c of req)chunks.push(c);const response=await handleRewardApplications(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),s.env,mapper,auth);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 const file=resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+sep)||!['.js','.mjs','.css'].includes(extname(file))){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(file));
 }catch(error){res.writeHead(500);res.end(String(error));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const width of [390,320,1280]){
  const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const newApplication=async()=>{await page.click('#start');if(kind!=='reward')await page.getByRole('button',{name:names[kind],exact:true}).click();const tabs=page.locator('.ra-kind-tabs button');await tabs.first().waitFor();assert.equal(await tabs.count(),4);const boxes=await tabs.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width};}));assert.equal(boxes[0].y,boxes[1].y);assert.equal(boxes[2].y,boxes[3].y);assert(boxes[1].x>boxes[0].x&&boxes[2].y>boxes[0].y);await page.getByRole('button',{name:kind==='partner'?'＋ 簽署共創夥伴契約':'＋ '+names[kind]+'申請',exact:true}).click();};
  await page.goto(origin);await newApplication();
  if(width===390){await page.getByRole('button',{name:'關閉 ×',exact:true}).click();assert.equal(count(),0);await newApplication();}
  await page.locator('[name=unit_name]').fill('合成申請測試單位 '+width);await page.locator('[name=applicant_name]').fill('合成申請人');await page.locator('[name=phone]').fill('0912345678');
  if(extended){
   const data=kind==='partner'?partnerFields():fullFields();
   for(const [name,value]of Object.entries(data)){const field=page.locator('[name="'+name+'"]');if(await field.getAttribute('readonly')!==null){assert.equal(await field.inputValue(),'');continue;}if(await field.evaluate(node=>node.tagName)==='SELECT')await field.selectOption(value);else await field.fill(value);}
   if(kind==='partner'){assert.equal(await page.locator('[name=representative_name]').getAttribute('required'),'');assert.equal(await page.locator('[name=referrer_name]').getAttribute('readonly'),'');}
  }
  if(discount){await page.locator('[name=services]').fill('提供生活用品、居家設備與專業維修服務，協助消費者依實際需求選購，並說明商品使用與售後服務。');await page.locator('[name=assisted_partner]').fill('合成協助者');}
  for(const [name,value]of extended?[]:discount?[['business_types','實體店面'],['business_types','專業服務']]:[['unit_types','企業'],['recipients','員工'],['scenarios','員工福利']])await page.locator(`[name=${name}][value="${value}"]`).check();
  await page.getByRole('button',{name:'下一步：預覽完整申請書'}).click();await page.getByRole('heading',{name:'2／3 閱讀並手寫簽名'}).waitFor();
  assert.equal(count(),[390,320,1280].indexOf(width));
  if(discount){await page.getByRole('heading',{name:'點數通｜特約折抵店家申請書',exact:true}).waitFor();assert.equal(await page.getByText('特約折抵店家至少提供 10% 購物金折抵，折抵範圍 10%～50%，特殊活動自行訂定。',{exact:true}).count(),1);}
  if(extended){assert.equal(await page.locator('[aria-label="本次簽署制度確認"]').count(),1);assert.equal(await page.locator('.ra-copy').filter({hasText:'合成條款段落'+(kind==='partner'?'102':'036')+'：'}).count(),1);}
  for(const name of ['electronic','terms','authority',...(discount?['discount','publication']:kind==='partner'?['policy']:kind==='full'?['fees','discount','separate_partner']:[])])await page.locator('[name='+name+']').check();
  const canvas=page.locator('canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
  await page.mouse.move(box.x+25,box.y+30);await page.mouse.down();for(let i=0;i<14;i++)await page.mouse.move(box.x+25+i*(box.width-50)/14,box.y+30+(i%2)*Math.min(65,box.height-50));await page.mouse.up();
  if(width===320){let dropped=false;await page.route('**/v1/'+kind+'-applications/submit',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort();}else await route.continue();});}
  await page.getByRole('button',{name:'確認簽署並送出申請'}).click();
  if(width===320){await page.getByRole('button',{name:'用原簽署內容重試送出'}).waitFor();assert.equal(count(),2);await page.getByRole('button',{name:'用原簽署內容重試送出'}).click();}
  await page.getByRole('heading',{name:'申請紀錄',exact:true}).waitFor();
  assert.equal(count(),[390,320,1280].indexOf(width)+1);
  assert.ok(await page.evaluate(()=>{const d=document.querySelector('dialog');return d.scrollWidth<=d.clientWidth+1;}));
  if(width===390){await page.evaluate(()=>{window.pdfLines=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.pdfLines.push(String(text));return original.call(this,text,...args);};});const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'下載已簽申請書 PDF',exact:true}).click();const download=await downloadPromise;await download.saveAs(join(output,'signed-application-synthetic.pdf'));if(extended){const lines=await page.evaluate(()=>window.pdfLines.join('\n'));assert.match(lines,/原始範本 SHA-256/);assert.match(lines,/本次條款內容 SHA-256/);assert.match(lines,/合成測試補充說明/);for(let i=1;i<=(kind==='partner'?102:36);i++)assert(lines.includes('合成條款段落'+String(i).padStart(3,'0')+'：'));const pdf=readFileSync(join(output,'signed-application-synthetic.pdf')).toString('latin1');assert(Number(pdf.match(/\/Count (\d+)/)?.[1])>=3);}await page.screenshot({path:join(output,'member-390.png')});}
  await page.getByRole('button',{name:'關閉 ×',exact:true}).click();await page.evaluate(()=>window.testToken='admin');await page.click('#start');if(kind!=='reward')await page.getByRole('button',{name:names[kind],exact:true}).click();await page.getByRole('button',{name:'查看申請／下載 PDF'}).first().click();
  if(await page.locator('[name=note]').count()){await page.locator('[name=note]').fill('合成審核測試，未開通任何正式權限');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'確認審核通過',exact:true}).click();await page.getByText('審核通過・開通另行處理。申請簽署完成不代表權限已開通。').waitFor();}
  if(width===1280){await page.evaluate(()=>window.testToken='user');await page.locator('dialog').waitFor({state:'detached'});}
  assert.deepEqual(errors,[]);await context.close();console.log('PASS '+kind+' mobile form/signature/PDF/review width='+width);
 }
 assert.equal(s.sql.prepare("SELECT role FROM users WHERE line_id=?").get(OTHER).role,'user');
 for(const other of ['reward','discount','partner','full'].filter(value=>value!==kind))assert.equal(s.sql.prepare('SELECT count(*) n FROM '+other+'_applications').get().n,0);
 writeFileSync(join(output,'result.json'),JSON.stringify({success:true,kind,widths:[390,320,1280],applications:count(),productionWrites:0},null,2));
}finally{await browser.close();server.close();s.sql.close();}
