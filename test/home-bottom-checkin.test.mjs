import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/home-discovery-20261110.css',import.meta.url),'utf8');
const auth=readFileSync(new URL('../js/auth.js',import.meta.url),'utf8');
const start=auth.indexOf('window.claimDailyPointCheckin = async function(btn) {');
const end=auth.indexOf('window.renderCardCoolReviewPage =',start);
assert.ok(start>=0&&end>start,'the existing daily check-in implementation exists');
const checkinCode=auth.slice(start,end);

function fixture(handler,loggedIn=true){
 const events=[], status={textContent:''}, label={textContent:'簽到贈點'};
 const original='<span class="home-bottom-checkin-badge"><span>redeem</span><span class="home-quick-label">簽到贈點</span><small>每日 10 點</small></span>';
 const classes=new Set();
 const button={disabled:false,innerHTML:original,querySelector:s=>s==='.home-quick-label'?label:null,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};
 const window={currentUserProfile:loggedIn?{userId:'member'}:null,location:{search:''},fetchAPI:handler,
  resolvePointUserIdForCurrentProfile:()=> 'wallet',showToast:(...args)=>events.push(args),
  showPointAwardCelebration:(...args)=>events.push(args),loadPointsWallet:async()=>events.push('wallet-refreshed'),refreshPointBalanceBadge:async()=>events.push('badge-refreshed')};
 vm.runInNewContext(checkinCode,{window,document:{getElementById:()=>status},URLSearchParams,Number,Promise,setTimeout:fn=>{fn();return 1;}});
 return {window,button,label,status,events,classes,original};
}

test('home centre button keeps the established daily check-in action and readable circular label',()=>{
 const match=html.match(/<button\b[^>]*\bid="home-bottom-checkin"[^>]*>[\s\S]*?<\/button>/);
 assert.ok(match,'the home-only bottom check-in button exists');
 assert.match(match[0],/onclick="window\.claimDailyPointCheckin\(this\)"/);
 assert.match(match[0],/class="home-quick-label">簽到贈點/);
 assert.match(match[0],/每日 10 點/);
 assert.match(css,/#home-discovery-bottom \.home-bottom-checkin-badge/);
});

test('check-in button disables during the existing request and restores its icon and label after success',async()=>{
 let finish, calls=0;
 const f=fixture((action,payload,authenticated)=>{calls++;assert.equal(action,'dailyPointCheckin');assert.equal(authenticated,true);assert.equal(payload.userId,'member');assert.equal(payload.pointUserId,'wallet');assert.equal(payload.pt_uid,'wallet');return new Promise(resolve=>{finish=resolve;});});
 const run=f.window.claimDailyPointCheckin(f.button);
 assert.equal(f.button.disabled,true);assert.equal(f.label.textContent,'處理中');assert.equal(f.classes.has('opacity-70'),true);
 // Native disabled buttons do not deliver a second click while the request is pending.
 if(!f.button.disabled)void f.window.claimDailyPointCheckin(f.button);
 assert.equal(calls,1);
 finish({success:true,data:{awarded:true,points:10,balance:10}});await run;
 assert.equal(f.button.disabled,false);assert.equal(f.button.innerHTML,f.original);assert.equal(f.classes.has('opacity-70'),false);
 assert.ok(f.events.some(item=>Array.isArray(item)&&item[0]===10&&item[1]==='daily-checkin'));
 assert.ok(f.events.includes('wallet-refreshed')&&f.events.includes('badge-refreshed'));
});

test('already checked, login required, and failures do not break the bottom control or retry',async()=>{
 let attempts=0;
 const f=fixture(async()=>{attempts++;if(attempts===1)throw Error('暫時無法連線');return {success:true,data:{alreadyChecked:true}};});
 await f.window.claimDailyPointCheckin(f.button);
 assert.equal(f.button.disabled,false);assert.equal(f.button.innerHTML,f.original);assert.match(f.status.textContent,/暫時無法連線/);
 await f.window.claimDailyPointCheckin(f.button);
 assert.equal(attempts,2);assert.match(f.status.textContent,/今天已領取過贈點/);assert.equal(f.button.innerHTML,f.original);
 let called=false;const anon=fixture(async()=>{called=true;},false);
 await anon.window.claimDailyPointCheckin(anon.button);
 assert.equal(called,false);assert.match(anon.events[0][0],/請先登入/);
});
