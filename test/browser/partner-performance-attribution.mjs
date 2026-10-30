// Isolated synthetic member, actual form and API; no external LINE or production writes.
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {handSignFixture,partnerFields,OTHER,REWARD,mapper} from '../fixtures/hand-sign-applications.mjs';
import {handleRewardApplications} from '../../worker/reward-applications.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=process.cwd(),output=resolve('../attribution-browser');mkdirSync(output,{recursive:true});
let cleanup;const fixture=await handSignFixture({after:fn=>cleanup=fn});
fixture.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(REWARD,OTHER);
const usersBefore=fixture.sql.prepare('SELECT * FROM users ORDER BY line_id').all();
const fetcher=async url=>{assert.equal(url,'https://api.line.me/v2/profile');return Response.json({userId:OTHER});};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/v1/')){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const response=await handleRewardApplications(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),fixture.env,mapper,fetcher);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(url.pathname==='/'){
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import {openRewardApplications} from "/js/modules/reward-applications.js";window.liff={isLoggedIn:()=>true,getAccessToken:()=>"synthetic"};await openRewardApplications({base:location.origin,kind:"partner"});</script>');return;
 }
 const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+sep)||!['.js','.mjs','.css'].includes(extname(file))){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(file));
}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-action=new]').click();
 const name=page.locator('[name=performance_owner_name]'),number=page.locator('[name=performance_owner_member_number]');
 await name.waitFor();assert.equal(await name.inputValue(),'');assert.equal(await number.inputValue(),'');assert(await name.isEditable());assert(await number.isEditable());
 const fields={...partnerFields(),performance_owner_name:'合成業績人甲',performance_owner_member_number:'20261021009'};
 for(const [key,value]of Object.entries(fields)){const control=page.locator('[name='+key+']');if(key==='party_type')await control.selectOption(value);else await control.fill(value);}
 await name.scrollIntoViewIfNeeded();await page.screenshot({path:output+'/editable-mobile.png'});
 await page.locator('[data-form=application] button[type=submit]').click();await page.locator('[data-form=sign]').waitFor();
 assert((await page.locator('dialog').innerText()).includes('推薦人姓名：合成業績人甲'));
 await page.locator('[data-action=edit]').click();await name.waitFor();assert.equal(await name.inputValue(),fields.performance_owner_name);assert.equal(await number.inputValue(),fields.performance_owner_member_number);
 await name.fill('合成業績人乙');await number.fill('20261021010');
 await page.locator('[data-form=application] button[type=submit]').click();await page.locator('[data-form=sign]').waitFor();
 for(const input of await page.locator('[data-form=sign] input[type=checkbox]').all())await input.check();
 const canvas=page.locator('canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
 await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();for(let i=1;i<=16;i++)await page.mouse.move(box.x+20+i*12,box.y+20+(i%2)*45);await page.mouse.up();
 await page.locator('[data-form=sign] button[type=submit]').click();await page.getByRole('heading',{name:'申請紀錄',exact:true}).waitFor();
 assert((await page.locator('dialog').innerText()).includes('推薦人姓名：合成業績人乙'));
 const rows=fixture.sql.prepare('SELECT snapshot_json FROM partner_applications').all();assert.equal(rows.length,1);
 const snapshot=JSON.parse(rows[0].snapshot_json);assert.equal(snapshot.fields.performance_owner_name,'合成業績人乙');assert.equal(snapshot.fields.performance_owner_member_number,'20261021010');assert.equal(snapshot.referrer_uid,REWARD);
 // PDF consumes the same saved fields and snapshot labels; its renderer is covered by the unit suite.
 assert.equal(snapshot.field_labels.performance_owner_name,'推薦人姓名');
 assert.deepEqual(fixture.sql.prepare('SELECT * FROM users ORDER BY line_id').all(),usersBefore);assert.deepEqual(errors,[]);
 assert(await page.evaluate(()=>document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth+1));
 console.log('PASS mobile: editable independent attribution, preview, back-edit retention, corrected signed snapshot, CRM unchanged, no page errors');
}finally{await browser.close();await new Promise(r=>server.close(r));cleanup();}
