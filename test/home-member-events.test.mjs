import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../js/modules/member-hosted-events.js',import.meta.url),'utf8'),home=readFileSync(new URL('../js/modules/home.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/member-hosted-events.css',import.meta.url),'utf8');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const settle=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
const event=(overrides={})=>({id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',title:'範例會員活動',category:'課程',location:'範例教室',startsAt:'2099-10-08T06:00:00Z',endsAt:'2099-10-08T08:00:00Z',registrationClosesAt:'2099-10-08T06:00:00Z',status:'active',capacity:0,registrationCount:0,feeText:'150元',coverUrl:'',...overrides});
class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.className='';this._html='';this.classList={contains:name=>this.className.split(' ').includes(name)};}
  set innerHTML(v){this._html=v;this.children=[];}get innerHTML(){return this._html;}
  append(...children){for(const c of children){this.children.push(c);c.parentElement=this;}}prepend(...children){for(const c of children)c.parentElement=this;this.children.unshift(...children);}
  setAttribute(k,v){this.attributes[k]=v;}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);}
  insertBefore(child,before){child.parentElement=this;this.children.splice(this.children.indexOf(before),0,child);}
  insertAdjacentHTML(_,html){this._html+=html;}
}
function fixture(fetcher=async()=>Response.json({success:true,sessions:[event()]})){
  const page=new Element(),list=new Element(),parent=new Element(),calls=[],listeners={},docListeners={},observers=[],revoked=[];parent.append(list);
  let token='test-a',logged=true;
  const document={hidden:false,getElementById:id=>id==='page-home'?page:id==='user-activities-list'?list:id==='home-activity-filters'?parent.children.find(x=>x.id===id):null,createElement:tag=>new Element(tag),querySelectorAll:()=>list.children.filter(x=>x.dataset.homeMemberEvent),addEventListener:(k,f)=>docListeners[k]=f};
  const window={Config:{API_URL:'https://point.test'},currentUserProfile:{userId:'member-a'},userRole:'user',currentNetworkId:'admin',liff:{isLoggedIn:()=>logged,getAccessToken:()=>token},addEventListener:(k,f)=>listeners[k]=f,escapeHTML:esc,escapeJS:esc,formatDisplayTime:v=>v};
  class TestURL extends URL{static createObjectURL(){return 'blob:synthetic';}static revokeObjectURL(url){revoked.push(url);}}
  const context=vm.createContext({window,document,location:{search:''},URL:TestURL,URLSearchParams,AbortController,Response,Date,console,Set,Map,Promise,navigator:{clipboard:{writeText:async()=>{}}},setTimeout,clearTimeout,setInterval(){throw Error('Unexpected polling');},clearInterval(){},MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}},fetch:async(url,init)=>{calls.push({url,init});return fetcher(url,init);},getInitialActivityNetwork_:()=>''});
  vm.runInContext(ui,context);
  const start=home.indexOf('    function getPublicActivityId_('),end=home.indexOf('    function normalizeActivityList_(',start);
  vm.runInContext(home.slice(start,end),context);vm.runInContext("let homeActivitiesLoadState_='ready'; function homeActivityLoadMarkup_(failed){return failed?'官方活動載入失敗':'官方活動載入中';}",context);
  window.allActivities=[];
  return{window,document,page,list,parent,calls,listeners,docListeners,observers,context,revoked,setToken:v=>token=v,setLogin:v=>logged=v,cards:()=>list.children.filter(x=>x.dataset.homeMemberEvent&&x.dataset.homeMemberEvent!=='status')};
}

test('homepage uses the real authenticated sessions and shows cards without opening a modal or copying official data',async()=>{
  const f=fixture();assert.equal(f.calls.length,0);await f.window.loadHomeMemberEvents();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://point.test/v1/member-events/overview');assert.equal(f.calls[0].init.headers.Authorization,'Bearer test-a');assert.equal(f.calls[0].init.cache,'no-store');
  assert.equal(f.cards().length,1);assert.match(f.cards()[0].innerHTML,/會員活動 · 課程/);assert.match(f.cards()[0].innerHTML,/範例會員活動/);assert.match(f.cards()[0].innerHTML,/範例教室/);assert.match(f.cards()[0].innerHTML,/150元/);
  assert.equal(f.window.allActivities.length,0);assert.match(f.parent.children[0].innerHTML,/課程/);
  const opened=[];f.window.openMemberEvents=(...args)=>opened.push(args);const buttons=f.cards()[0].children.at(-1).children;assert.deepEqual(buttons.map(x=>x.textContent),['詳細','分享','報名']);buttons[0].onclick();buttons[2].onclick();assert.deepEqual(opened,[['catalog',event().id],['catalog',event().id]]);assert.equal(f.calls.length,1,'opening detail does not itself register');
});
test('official and member cards share the visible grid and filters but not network or registration ownership',async()=>{
  const f=fixture();f.window.allActivities=[{activityId:'ACT_original',activityName:'官方例會',activityType:'合作商業交流',networkId:'admin',status:'上架'}];await f.window.loadHomeMemberEvents();
  assert.match(f.list.innerHTML,/官方例會/);assert.equal(f.cards().length,1);assert.match(f.parent.children[0].innerHTML,/合作商業交流/);assert.match(f.parent.children[0].innerHTML,/課程/);
  f.window.setHomeActivityFilter('課程');assert.doesNotMatch(f.list.innerHTML,/官方例會/);assert.equal(f.cards().length,1);
  f.window.setHomeActivityFilter('合作商業交流');assert.match(f.list.innerHTML,/官方例會/);assert.equal(f.cards().length,0);assert.equal(f.window.allActivities.length,1);
});
test('duplicate reads coalesce, cancelled/ended/duplicate events are excluded and untrusted text is escaped',async()=>{
  let resolve;const f=fixture(()=>new Promise(r=>resolve=r));const a=f.window.loadHomeMemberEvents(),b=f.window.loadHomeMemberEvents();assert.equal(f.calls.length,1);
  resolve(Response.json({success:true,sessions:[event({title:'<img onerror=evil>',location:'<script>evil</script>',category:'<b>課程</b>'}),event({status:'cancelled'}),event({endsAt:'2020-01-01T00:00:00Z'}),event({id:'invalid'})]}));await Promise.all([a,b]);
  assert.equal(f.cards().length,1);assert.match(f.cards()[0].innerHTML,/&lt;img/);assert.doesNotMatch(f.cards()[0].innerHTML,/<script>|<img/);assert.match(f.parent.children[0].innerHTML,/&lt;b&gt;/);
});
test('failed/empty/member and official loading states are separate and retries do not hide the successful source',async()=>{
  let fail=true;const f=fixture(async()=>Response.json(fail?{success:false,error:'offline'}:{success:true,sessions:[]}));f.window.allActivities=[{activityId:'ACT_original',title:'官方例會',networkId:'admin',status:'上架'}];await f.window.loadHomeMemberEvents();assert.match(f.list.innerHTML,/官方例會/);assert.equal(f.cards().length,0);assert.match(f.list.children[0].textContent,/載入失敗/);assert.equal(f.list.children[0].children[0].textContent,'重試會員活動');
  fail=false;await f.list.children[0].children[0].onclick();assert.match(f.list.innerHTML,/官方例會/);assert.equal(f.list.children.length,0);
  const good=fixture();vm.runInContext("homeActivitiesLoadState_='failed'",good.context);await good.window.loadHomeMemberEvents();assert.match(good.list.innerHTML,/官方活動載入失敗/);assert.equal(good.cards().length,1);
});
test('anonymous, account/token changes and late previous-account reads cannot expose old cards',async()=>{
  const anonymous=fixture();anonymous.setLogin(false);await anonymous.window.loadHomeMemberEvents();assert.equal(anonymous.calls.length,0);assert.equal(anonymous.cards().length,0);
  for(const change of [f=>f.window.currentUserProfile.userId='member-b',f=>f.setToken('test-b')]){
    const releases=[],f=fixture(()=>new Promise(r=>releases.push(r)));const old=f.window.loadHomeMemberEvents();change(f);const current=f.window.loadHomeMemberEvents();assert.equal(f.calls.length,2);assert.ok(f.calls[0].init.signal.aborted);
    releases[1](Response.json({success:true,sessions:[event({title:'目前帳號活動'})]}));await current;releases[0](Response.json({success:true,sessions:[event({title:'舊帳號活動'})]}));await old;assert.equal(f.cards().length,1);assert.match(f.cards()[0].innerHTML,/目前帳號活動/);assert.doesNotMatch(f.cards()[0].innerHTML,/舊帳號活動/);
  }
  const f=fixture();await f.window.loadHomeMemberEvents();f.setLogin(false);f.window.renderHomeActivities();assert.equal(f.cards().length,0);
});
test('leaving/hiding cancels late requests and returning reloads; successful saves force a fresh projection',async()=>{
  let resolve;const f=fixture(()=>new Promise(r=>resolve=r)),pending=f.window.loadHomeMemberEvents();f.page.className='hidden';f.observers[0]();assert.ok(f.calls[0].init.signal.aborted);resolve(Response.json({success:true,sessions:[event()]}));await pending;assert.equal(f.cards().length,0);
  f.page.className='';f.observers[0]();assert.equal(f.calls.length,2);resolve(Response.json({success:true,sessions:[event()]}));await settle();assert.equal(f.cards().length,1);
  f.document.hidden=true;f.docListeners.visibilitychange();assert.equal(f.cards().length,0);f.document.hidden=false;f.docListeners.visibilitychange();assert.equal(f.calls.length,3);resolve(Response.json({success:true,sessions:[event()]}));await settle();
  const old=f.window.loadHomeMemberEvents(),oldRelease=resolve,forced=f.window.loadHomeMemberEvents({force:true});assert.ok(f.calls[3].init.signal.aborted);resolve(Response.json({success:true,sessions:[]}));await forced;oldRelease(Response.json({success:true,sessions:[event()]}));await old;assert.equal(f.cards().length,0);f.listeners.pagehide();
  assert.match(ui,/cancel-event[\s\S]*?loadHomeMemberEvents\(\{force:true\}\)/);assert.match(ui,/const result=await api\(eventId[\s\S]*?loadHomeMemberEvents\(\{force:true\}\)/);
});
test('protected thumbnail uses bearer/no-store blob and releases it on departure; full/deadline buttons do not post',async()=>{
  assert.match(css,/\.me-home-card \.me-thumbnail\{[^}]*height:180px;min-height:180px/);assert.match(css,/\.me-home-card \[hidden\]\{display:none!important\}/);
  const media='https://point.test/v1/member-events/'+event().id+'/media/bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb.jpg';
  const f=fixture(async url=>url.endsWith('/overview')?Response.json({success:true,sessions:[event({coverUrl:media,capacity:1,registrationCount:1})]}):new Response('fake-image',{headers:{'Content-Type':'image/jpeg'}}));await f.window.loadHomeMemberEvents();await settle();
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].init.headers.Authorization,'Bearer test-a');assert.equal(f.calls[1].init.redirect,'error');assert.equal(f.cards()[0].children[0].children[0].src,'blob:synthetic');assert.equal(f.cards()[0].children.at(-1).children.at(-1).disabled,true);
  f.listeners.pagehide();assert.ok(f.revoked.includes('blob:synthetic'));assert.equal(f.cards().length,0);
});
