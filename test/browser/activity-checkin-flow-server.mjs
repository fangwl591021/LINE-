// Diagnostic only. Actual activity UI and handlers; synthetic LINE identities and memory databases.
// Loopback listener, no production credentials, writes, notifications or point providers.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {fixture as memberFixture,UIDS} from '../helpers/member-events-fixture.mjs';
import {officialFixture} from '../helpers/activity-visibility-fixture.mjs';
import qrcode from '../../js/vendor/qrcode-generator-2.0.4.mjs';
import {isRewardOnlyRole,checkRewardOnlyAction} from '../../worker/reward-only-cashier.mjs';
import {checkRedeemOnlyAction} from '../../worker/redeem-only-cashier.mjs';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const read=p=>readFileSync(resolve(root,p),'utf8');
const index=read('index.html'),home=read('js/modules/home.js'),config=read('js/config.js'),worker=read('workerbackup.js');
function slice(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);if(a<0||b<=a)throw Error('Source anchor changed: '+start);return source.slice(a,b);}
function object(name){const match=worker.match(new RegExp(`^const ${name} = \\{[\\s\\S]*?^\\};`,'m'));if(!match)throw Error('Missing '+name);return match[0];}
export function qrImage(text){const qr=qrcode(0,'M');qr.addData(text);qr.make();return qr.createDataURL(6,24);}

export async function startActivityCheckinFixture(){
  const cleanups=[],t={after:f=>cleanups.push(f)},member=memberFixture(t),official=officialFixture(t);
  official.sql.exec("ALTER TABLE registrants ADD COLUMN nfc_checkin_time TEXT DEFAULT ''; ALTER TABLE registrants ADD COLUMN nfc_checkin_source TEXT DEFAULT ''; ALTER TABLE registrants ADD COLUMN cancelled_at TEXT DEFAULT ''; ALTER TABLE registrants ADD COLUMN payment_last5 TEXT DEFAULT '';");
  const context=vm.createContext({console,crypto,TextEncoder,URL,Date,isRewardOnlyRole,checkRewardOnlyAction,checkRedeemOnlyAction,
    fetch:async()=>{throw Error('External service prohibited');}});
  vm.runInContext([object('ACTION_POLICIES'),object('SecurityModule'),object('D1ReadModule'),'globalThis.modules={SecurityModule,D1ReadModule};'].join('\n'),context);
  const {SecurityModule:security,D1ReadModule:readModule}=context.modules;
  security.getLineUserIdFromToken=async token=>official.actors[token]?.userId||'';
  readModule.first=async(_env,q,args=[])=>official.sql.prepare(q).get(...args)||null;
  const officialCalls=[];
  async function officialApi(action,p={},who='owner-a'){
    const payload={...p,lineAccessToken:who};
    const authorization=await security.authorizeAction(action,payload,new Request('https://fixture.invalid',{method:'POST'}),official.env);
    officialCalls.push({action,who,allowed:authorization.allowed});
    if(!authorization.allowed)return {success:false,error:authorization.error};
    if(!['getPublicActivities','getActivityRegistrants','getMyActivities','toggleCheckin','redeemActivityCheckin'].includes(action))throw Error('Forbidden fixture action: '+action);
    return official.api(action,payload,who);
  }
  const events=[];
  for(const [category,owner] of [['活動','host'],['課程','other']]){
    const event=await member.create({...member.input(),title:'隔離示範'+category,category,visibility:'platform',
      startsAt:new Date(Date.now()-1800000).toISOString(),endsAt:new Date(Date.now()+7200000).toISOString(),registrationClosesAt:new Date(Date.now()+3600000).toISOString()},owner);
    events.push({id:event.id,category,owner});
    const id='FIXTURE_'+(category==='活動'?'ACTIVITY':'COURSE');
    const created=await official.create(id,'platform','owner-a',{activityName:'專區示範'+category,activityType:category,price:0});
    if(!created.success)throw Error(JSON.stringify(created));
    official.sql.prepare("INSERT INTO registrants(row_id,line_id,activity_id,activity_name,name,phone,identity,amount,payment_status,start_time,description,image_url,status) VALUES(?,?,?,?,?,'','會員',0,'免費',?,'隔離測試','','active')")
      .run('REG_'+id,'member-a',id,'專區示範'+category,'合成學員','2026-10-20 14:00');
  }
  const legacyCode=[slice(home,'    function normalizeActivityList_(', '    function getInitialActivityId_('),
    slice(home,'    window.loadMyActivities =','    function buildActivityFromRegistration_('),
    slice(home,'    let activityQrRevision_','    window.cancelMyActivityRegistration =')].join('\n');
  const legacyMarkup=slice(index,'    <div id="page-my-activities"','    <!-- ==================== 收件匣')+
    slice(index,'    <div id="page-my-act-detail"','    <!-- ==================== 建立活動')+
    slice(index,'    <div id="page-admin-activities"','    <!-- ==================== 營運統計獨立頁面')+
    slice(index,'<div id="qr-modal"','<div id="weekly-zodiac-modal"');
  let origin;
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,origin);
      if(req.method==='GET'&&url.pathname==='/'){
        const mode=url.searchParams.get('mode')==='legacy'?'legacy':'member';
        const role=url.searchParams.get('role')||(mode==='member'?'guest':'member-a');
        const uid=mode==='member'?UIDS[role]:role;
        if(!uid)throw Error('Invalid synthetic identity');
        const boot=`window.currentUserProfile={userId:${JSON.stringify(uid)},displayName:'合成學員'};window.currentUser={name:'合成學員'};
          window.Config={API_URL:location.origin};window.liff={isLoggedIn:()=>true,getAccessToken:()=>${JSON.stringify(role)}};
          window.showToast=m=>document.getElementById('fixture-status').textContent=m;
          window.escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
          window.escapeJS=v=>String(v??'').replace(/'/g,"\\'");window.formatDisplayTime=v=>String(v||'');window.appConfirm=async()=>true;
          window.fetchAPI=async(action,payload={})=>{const response=await fetch('/official-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload,who:${JSON.stringify(role)}})});const result=await response.json();return result.success?(result.data??result):{error:result.error};};
          window.goPage=p=>{document.querySelectorAll('[id^="page-"]').forEach(n=>n.classList.add('hidden'));document.getElementById('page-'+p)?.classList.remove('hidden');};
          window.closeActmasterLiffOrHome=()=>window.__fixtureClosed=true;window.loadPersonalAgenda=async()=>[];function ensurePersonalAgendaPanel_(){};`;
        res.setHeader('Content-Type','text/html;charset=utf-8');
        res.end(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
          <title>活動課程核銷隔離驗收</title><link rel="stylesheet" href="/css/member-hosted-events.css"><link rel="stylesheet" href="/css/activity-checkin.css"><style>
          .hidden,[hidden]{display:none!important}body{font-family:system-ui;margin:0;padding:12px;color:#153746}button{padding:12px;border:1px solid #bed5cf;border-radius:12px;background:#eef8f5;margin:4px}#fixture-badge{background:#fff3cd;padding:8px;font-size:12px}#fixture-status{padding:12px}#qr-modal{position:fixed;inset:0;background:#ffffffee;z-index:100}#qr-modal>div{padding:24px}#qr-code-img{width:270px;height:270px}.material-symbols-outlined{display:none}#my-activities-list>div{border:1px solid #ddd;padding:12px}#admin-activities-list img{width:200px}#admin-checkin-list>div{border-bottom:1px solid #ddd;padding:16px}#qr-loading{display:none}nav{display:flex;flex-wrap:wrap}</style>
          <script src="/js/config.js"></script></head><body><div id="fixture-badge">隔離測試：合成活動／學員；不異動正式報名與點數。</div><div id="fixture-status" role="status"></div>
          ${mode==='member'?'<button onclick="openMemberEvents()">會員活動</button>':legacyMarkup}
          <script>${boot}</script><script src="/js/modules/activity-checkin.js"></script>${mode==='member'?'<script src="/js/modules/member-hosted-events.js"></script>':'<script src="/fixture-legacy.js"></script><script src="/js/modules/admin.js"></script><script>goPage("my-activities");loadMyActivities();</script>'}</body></html>`);return;
      }
      if(req.method==='GET'&&url.pathname==='/fixture-legacy.js'){res.setHeader('Content-Type','text/javascript');res.end(legacyCode);return;}
      if(req.method==='GET'&&/^\/(?:js\/|css\/)/.test(url.pathname)){
        const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
        res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(path));return;
      }
      if(url.pathname.startsWith('/v1/member-events')){
        const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks).toString();
        const result=await member.api(url.pathname.slice('/v1/member-events'.length)+url.search,{member:String(req.headers.authorization||'').replace('Bearer ',''),method:req.method,...(body?{data:JSON.parse(body)}:{})});
        const {httpStatus,...data}=result;res.writeHead(httpStatus,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;
      }
      if(req.method==='POST'&&url.pathname==='/official-api'){
        const chunks=[];for await(const c of req)chunks.push(c);const {action,payload,who}=JSON.parse(Buffer.concat(chunks));
        const result=await officialApi(action,payload,who);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
      }
      res.writeHead(404);res.end();
    }catch(error){console.error('[activity fixture]',error.message);res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,error:error.message}));}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  return {origin,member,official,officialApi,officialCalls,events,qrImage,async close(){await new Promise(r=>server.close(r));cleanups.forEach(f=>f());}};
}
