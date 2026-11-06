import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const root=resolve('.'),out=resolve('../crm-plan-save-qa');mkdirSync(out,{recursive:true});
const member='U'+'a'.repeat(32),operator='U'+'b'.repeat(32),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE members(userId TEXT PRIMARY KEY,name TEXT,role TEXT)');db.prepare('INSERT INTO members VALUES(?,?,?)').run(member,'合成測試會員','user');
const slice=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+1);assert(i>=0&&j>i);return s.slice(i,j);};
const mobile=slice(readFileSync('js/modules/admin.js','utf8'),'window.changeUserRole =','window.clearAnnouncementForm =');
const desktop=file=>slice(readFileSync(file,'utf8'),'    async function updateRole(','    async function syncBoundCardsToUsers(');
const calls=[];let rejectWrite=false;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/members'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(db.prepare('SELECT * FROM members').all()));return;}
 if(url.pathname==='/role'){
  const chunks=[];for await(const c of req)chunks.push(c);const payload=JSON.parse(Buffer.concat(chunks));calls.push(payload);
  assert.equal(payload.action,'updateUserRole');assert.equal(payload.targetUserId,member);assert.equal(payload.operatorId,operator);assert(['user','reward','redeem','store'].includes(payload.newRole));
  res.setHeader('Content-Type','application/json');if(rejectWrite){res.end(JSON.stringify({success:false,error:'合成測試拒絕更新'}));return;}
  db.prepare('UPDATE members SET role=? WHERE userId=?').run(payload.newRole,member);res.end(JSON.stringify({success:true,userId:member,role:payload.newRole}));return;
 }
 if(url.pathname.startsWith('/v1/')){assert.equal(req.method,'GET');assert.equal(url.searchParams.get('target'),member);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,applications:[],next:null}));return;}
 if(url.pathname==='/'){
  const mode=url.searchParams.get('mode')||'admin.html',isMobile=mode==='mobile';
  const script=`window.Config={WORKER_URL:location.origin};window.token='synthetic';window.userRole='admin';window.currentUserProfile={userId:'${operator}'};window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.token};window.showToast=t=>document.querySelector('#toast').textContent=t;window.protected=false;window.isHardAdminUser=()=>window.protected;window.currentNetworkId='synthetic';
var ${isMobile?'allSystemUsers':'allUsersData'}=[];${isMobile?'':"var adminRole='admin',adminProfile=window.currentUserProfile;function getSafeUserRole(u){return u.role||'user';}function normalizeLineId(v){return v;}function isHardAdminAccount(){return window.protected;}function getRoleLabel(v){return v;}function showToast(t){window.showToast(t);}"}
window.fetchAPI=async(action,payload)=>{const r=await fetch('/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});return r.json();};
async function loadUsers(){${isMobile?'allSystemUsers':'allUsersData'}=await (await fetch('/members')).json();}
${isMobile?mobile:desktop(mode)}
document.querySelector('#open').onclick=async()=>{await loadUsers();await window.openRewardApplicationReview('${member}');};`;
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><button id="open">開啟測試會員</button><p id="toast"></p><script>${script}</script><script src="/js/modules/reward-applications-entry.js"></script>`);return;
 }
 const f=resolve(root,'.'+url.pathname);if(!f.startsWith(root+sep)||!['.js','.mjs','.css'].includes(extname(f))){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',f.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(f));
}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const [mode,width] of [['admin.html',1280],['admin-v2.html',390],['mobile',320]]){
 db.prepare('UPDATE members SET role=?').run('user');calls.length=0;rejectWrite=false;
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/?mode='+mode);await page.click('#open');
 await page.locator('[data-member-plan]').waitFor();assert.equal(await page.locator('[data-member-plan]').inputValue(),'user');
 await page.locator('[data-action=kind][data-kind=full]').click();await page.waitForFunction(()=>!document.querySelector('[data-action=refresh]').disabled);assert.equal(calls.length,0);
 await page.locator('[data-member-plan]').selectOption('store');await page.click('[data-action=save-plan]');await page.locator('[data-plan-status]').filter({hasText:'已儲存：雙向完整版'}).waitFor();assert.equal(db.prepare('SELECT role FROM members').get().role,'store');assert.equal(calls.length,1);
 await page.click('[data-action=close]');await page.click('#open');assert.equal(await page.locator('[data-member-plan]').inputValue(),'store');
 await page.reload();await page.click('#open');assert.equal(await page.locator('[data-member-plan]').inputValue(),'store');
 await page.screenshot({path:out+'/'+mode+'-'+width+'.png'});
 // Cancel existing reward confirmation: no write, prior saved state remains visible.
 await page.locator('[data-member-plan]').selectOption('reward');page.once('dialog',d=>d.dismiss());await page.click('[data-action=save-plan]');await page.getByRole('alert').filter({hasText:'方案尚未儲存'}).waitFor();assert.equal(calls.length,1);assert.equal(await page.locator('[data-saved-plan]').innerText(),'雙向完整版');
 rejectWrite=true;await page.locator('[data-member-plan]').selectOption('user');await page.click('[data-action=save-plan]');await page.getByRole('alert').filter({hasText:'方案尚未儲存'}).waitFor();assert.equal(db.prepare('SELECT role FROM members').get().role,'store');assert.equal(await page.locator('[data-saved-plan]').innerText(),'雙向完整版');rejectWrite=false;
 await page.click('[data-action=close]');await page.evaluate(()=>window.protected=true);await page.click('#open');assert.equal(await page.locator('[data-member-plan]').count(),0);
 await page.click('[data-action=close]');await page.evaluate(()=>{window.userRole='user';if(typeof adminRole!=='undefined')adminRole='user';});await page.click('#open');assert.equal(await page.locator('dialog').count(),0);
 assert.deepEqual(errors,[]);await page.close();console.log(JSON.stringify({mode,width,persistAfterReopen:true,persistAfterReload:true,categoryWrites:0,cancelAndFailurePreserveRole:true,protectedDenied:true,productionWrites:0}));
}}finally{await browser.close();server.close();db.close();}
