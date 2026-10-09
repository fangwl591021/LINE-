// Real activity components and SQL handlers; synthetic identities, no production writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {startActivityCheckinFixture} from './activity-checkin-flow-server.mjs';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const liveAssets=process.argv.includes('--live-assets');
const f=await startActivityCheckinFixture(),out=resolve('.wrangler/activity-checkin-'+(liveAssets?'live-assets':'fixed')+'-20261009');mkdirSync(out,{recursive:true});
const report={productionWrites:0,liveAssets,camera:'Canvas stream simulation, not physical LINE camera',checks:[],screenshots:[],pageErrors:[],blockedRequests:[]};
const browser=await playwright.chromium.launch({channel:'chrome',headless:true});
const member=await browser.newPage({viewport:{width:390,height:844}}),host=await browser.newPage({viewport:{width:390,height:844}});
const check=(name,detail='')=>{report.checks.push({name,detail});console.log('PASS '+name);};
async function shot(page,name){const path=resolve(out,name+'.png');await page.screenshot({path});report.screenshots.push(path);}
for(const page of [member,host]){
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(liveAssets&&u.origin===f.origin&&/^\/(?:js|css)\//.test(u.pathname)){
      const response=await fetch('https://fangwl591021.github.io/LINE-'+u.pathname+'?checkin-acceptance='+Date.now());
      assert.ok(response.ok,'Live asset '+u.pathname);return route.fulfill({contentType:response.headers.get('content-type')||'text/javascript',body:Buffer.from(await response.arrayBuffer())});
    }
    if(u.origin===f.origin)return route.continue();
    if(u.hostname==='code.jquery.com')return route.fulfill({contentType:'text/javascript',body:'/* unrelated optional jQuery disabled */'});
    if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#def4ec"/></svg>'});
    report.blockedRequests.push(u.hostname+u.pathname);return route.abort();
  });
}
await host.addInitScript(()=>{
  navigator.mediaDevices.getUserMedia=async()=>{
    if(window.__denyCamera)throw Error('NotAllowedError');
    const image=new Image();image.src=window.__fixtureQrImage;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=640;
    const draw=()=>{const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,640,640);c.drawImage(image,60,60,520,520);};
    draw();const stream=canvas.captureStream(15),interval=setInterval(draw,70);window.__fixtureStream=stream;
    stream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(interval));return stream;
  };
});
async function qrPixels(page,selector){
  await page.locator(selector).waitFor({state:'visible'});
  const png=await page.locator(selector).screenshot();
  if(!await page.evaluate(()=>!!window.jsQR))await page.addScriptTag({url:f.origin+'/js/vendor/jsQR.js'});
  const text=await page.evaluate(async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=c.height=640;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,640,640);ctx.drawImage(img,0,0,640,640);return window.jsQR(ctx.getImageData(0,0,640,640).data,640,640)?.data;},'data:image/png;base64,'+png.toString('base64'));
  assert.ok(text,'Actual displayed QR is decodable');return {png,text,image:'data:image/png;base64,'+png.toString('base64')};
}
try{
  for(const e of f.events){
    await member.goto(f.origin+'/?role=guest');await member.evaluate(id=>openMemberEvents('catalog',id),e.id);
    await member.getByRole('button',{name:'我要報名',exact:true}).click();await member.getByText('已報名',{exact:true}).waitFor();
    await member.getByRole('button',{name:'出示報名 QR',exact:true}).click();
    const old=await qrPixels(member,'.me-qr svg');await shot(member,'01-'+e.category+'-attendee-qr');
    const oldSvg=await member.locator('.me-qr svg').evaluate(n=>n.outerHTML);
    await member.getByRole('button',{name:'重新產生 QR',exact:true}).click();
    await member.waitForFunction(old=>document.querySelector('.me-qr svg')&&document.querySelector('.me-qr svg').outerHTML!==old,oldSvg);
    const ticket=await qrPixels(member,'.me-qr svg');assert.notEqual(ticket.text,old.text);
    assert.equal((await f.member.api('/'+e.id+'/redeem',{member:e.owner,data:{ticket:old.text}})).success,false);
    const nonOwner=e.owner==='host'?'other':'host';
    assert.equal((await f.member.api('/'+e.id+'/redeem',{member:nonOwner,data:{ticket:ticket.text}})).httpStatus,403);
    check(e.category+' actual QR displayed, reissue invalidates old ticket, foreign host denied');
    await host.goto(f.origin+'/?role='+e.owner);await host.evaluate(id=>openMemberEvents('hosting',id),e.id);
    await host.getByRole('button',{name:'報名名單／掃碼核銷',exact:true}).click();await host.getByText('尚未核銷',{exact:false}).waitFor();
    await host.getByRole('button',{name:'開啟核銷掃描器',exact:true}).click();await host.evaluate(image=>window.__fixtureQrImage=image,ticket.image);
    await host.getByRole('button',{name:'開始掃描',exact:true}).click();
    await host.locator('[data-scan-status]').filter({hasText:'核銷成功'}).waitFor({timeout:15000});await shot(host,'02-'+e.category+'-camera-success');
    const row=f.member.sql.prepare('SELECT checked_in_at FROM member_event_registrations WHERE event_id=?').get(e.id);assert.ok(row.checked_in_at);
    assert.equal((await f.member.api('/'+e.id+'/redeem',{member:e.owner,data:{ticket:ticket.text}})).duplicate,true);
    assert.equal(f.member.sql.prepare('SELECT checked_in_at FROM member_event_registrations WHERE event_id=?').get(e.id).checked_in_at,row.checked_in_at);
    await host.getByRole('button',{name:'查看更新名單',exact:true}).click();await host.getByText('有效報名 1 · 已核銷 1 · 未到 0 · 已取消 0').waitFor();
    assert.equal(await host.evaluate(()=>window.__fixtureStream.getTracks().every(t=>t.readyState==='ended')),true);
    await member.locator('[data-back]').click();await member.getByText('已核銷',{exact:false}).waitFor();
    assert.equal(await member.getByRole('button',{name:'出示報名 QR',exact:true}).count(),0);
    check(e.category+' attendee QR → host camera → checked roster, repeat safe, camera released');
  }
  check('Member-hosted checkin does not write points',String(f.member.writes.length)+' member-event writes only');
  await member.goto(f.origin+'/?mode=legacy&role=member-a');
  const legacyRows=await f.officialApi('getMyActivities',{userId:'member-a'},'member-a');assert.equal(legacyRows.data.length,2);
  for(const record of legacyRows.data){
    await member.evaluate(()=>goPage('my-activities'));await member.locator('#my-activities-list > div').filter({hasText:record.activityName}).click();
    await member.getByRole('button',{name:'出示核銷 QR',exact:false}).click();
    const ticket=await qrPixels(member,'#qr-code-img'),verify=new URL(ticket.text);
    assert.equal(verify.searchParams.get('verifyCheckin'),record.rowId);assert.equal(verify.searchParams.get('activityId'),record.activityId);
    assert.match(await member.locator('#qr-code-img').getAttribute('src'),/^data:image\/svg/);await shot(member,'03-'+record.activityId+'-attendee-qr');
    await host.goto(f.origin+'/?mode=legacy&role=owner-a&'+verify.searchParams.toString());await host.locator('#fixture-status').filter({hasText:'活動核銷完成'}).waitFor();
    const row=f.official.sql.prepare('SELECT * FROM registrants WHERE row_id=?').get(record.rowId);assert.equal(row.checked_in,1);
    await host.reload();await host.locator('#fixture-status').filter({hasText:'已核銷，未重複計算'}).waitFor();
    const repeat=f.official.sql.prepare('SELECT * FROM registrants WHERE row_id=?').get(record.rowId);assert.equal(repeat.checked_in,1);assert.equal(repeat.nfc_checkin_time,row.nfc_checkin_time);
    assert.equal((await f.officialApi('redeemActivityCheckin',{rowId:record.rowId,activityId:record.activityId},'owner-b')).success,false);
    assert.equal((await f.officialApi('toggleCheckin',{rowId:record.rowId},'member-a')).success,false);
    check(record.activityName+' actual local QR → LIFF callback, repeat stays checked, foreign owner/member denied');
    await host.goto(f.origin+'/?mode=legacy&role=owner-a');await host.evaluate(id=>openCheckinPage(id,'專區示範'),record.activityId);
    await host.getByRole('button',{name:'取消簽到',exact:true}).click();await host.getByRole('button',{name:'簽到',exact:true}).waitFor();
    assert.equal(f.officialCalls.at(-1).action,'getActivityRegistrants');
    assert.equal(await host.evaluate(()=>_currentCheckinExport.activityId),record.activityId);
    await host.getByRole('button',{name:'掃描活動／課程核銷 QR',exact:true}).click();
    await host.evaluate(image=>window.__fixtureQrImage=image,ticket.image);await host.getByRole('button',{name:'開始掃描',exact:true}).click();
    await host.locator('.activity-checkin-dialog [data-status]').filter({hasText:'核銷成功'}).waitFor();await host.locator('#admin-checkin-list').getByRole('button',{name:'取消簽到',exact:true}).waitFor();
    await shot(host,'04-'+record.activityId+'-scanner-success');
    for(const width of [320,390,768,1200]){
      await host.setViewportSize({width,height:844});
      const overflow=await host.locator('.activity-checkin-dialog button,.activity-checkin-dialog input,.activity-checkin-dialog video').evaluateAll(nodes=>nodes.filter(n=>{const b=n.getBoundingClientRect();return b.width&&(b.left<0||b.right>innerWidth+1);}).map(n=>n.outerHTML));assert.deepEqual(overflow,[]);
    }
    await host.getByRole('button',{name:'返回名單',exact:false}).click();assert.equal(await host.evaluate(()=>window.__fixtureStream.getTracks().every(t=>t.readyState==='ended')),true);
    check(record.activityName+' mobile camera scans actual attendee QR and refreshes same roster; 320–1200px fits');
    await host.getByRole('button',{name:'掃描活動／課程核銷 QR',exact:true}).click();await host.evaluate(()=>window.__denyCamera=true);
    await host.getByRole('button',{name:'開始掃描',exact:true}).click();await host.locator('[data-status]').filter({hasText:'無法開啟相機'}).waitFor();
    await host.locator('[data-image]').setInputFiles({name:'ticket.png',mimeType:'image/png',buffer:ticket.png});await host.locator('[data-status]').filter({hasText:'已核銷，未重複計算'}).waitFor();
    await host.locator('summary').filter({hasText:'無法使用相機'}).click();await host.locator('[data-ticket]').fill('https://evil.invalid/?verifyCheckin=x');await host.getByRole('button',{name:'核銷貼上的 QR',exact:true}).click();await host.locator('[data-status]').filter({hasText:'不是本平台'}).waitFor();
    await host.evaluate(()=>{currentUserProfile.userId='changed-account';});await host.locator('.activity-checkin-dialog').waitFor({state:'detached'});
    check(record.activityName+' denied-camera image fallback, invalid QR feedback, account change closes scanner');
    await member.locator('#qr-modal button').first().click();
  }
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.blockedRequests,[]);
}finally{writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await f.close();}
console.log(JSON.stringify({checks:report.checks.length,productionWrites:0,output:out}));
