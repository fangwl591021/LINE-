import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/modules/matchmake.js',import.meta.url),'utf8');
const cardmaster=readFileSync(new URL('../js/modules/cardmaster.js',import.meta.url),'utf8');
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const failed={pass:false,status:'failed',reasons:['服務說明含未提供依據的保證效果','聯絡按鈕無法確認目的地'],suggestions:['改寫成可核實的服務內容','修正聯絡連結後重新檢查'],issues:[{field:'服務項目',evidence:'保證立即見效',reason:'未提供可核實依據',suggestion:'移除保證式措辭'}]};
function node(){
 const classes=new Set();
 return {innerHTML:'',textContent:'',checked:false,value:'',dataset:{},classList:{add:(...list)=>list.forEach(x=>classes.add(x)),remove:(...list)=>list.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle(x,on){if(on===undefined)on=!classes.has(x);if(on)classes.add(x);else classes.delete(x);return on;}},contains:()=>false};
}
function setup({config={isPrivate:true,safetyReview:failed},scope='public',admin=false,readiness={pass:true,missing:[]},feedback}={}){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 for(const id of ['privacy-lock-container','matchmaker-ui','match-results','admin-tools-container','fate-privacy-toggle'])get(id);
 get('matchmaker-ui').parentNode={insertBefore:status=>nodes.set(status.id,status)};
 const card={rowId:'card-test','自訂名片設定':JSON.stringify(config),'服務項目':'提供企業資訊系統規劃及支援服務'};
 const writes=[],toasts=[];
 const window={currentUserCard:card,allCards:[card],currentPage:'matchmake',matchmakePoolScope:scope,hasAdminRights:admin,userRole:admin?'admin':'user',currentUser:{role:admin?'admin':'user'},
  escapeHTML:escape,showToast:(...args)=>toasts.push(args),fetchAPI:async(action,payload)=>{writes.push({action,payload});return {success:true};},
  getCardSafetyConfig:c=>{try{return JSON.parse(c?.['自訂名片設定']||c?.['電子名片設定']||'{}');}catch{return {};}},
  validateCardPublicReadiness:()=>readiness,
  renderCardSafetyFeedbackHtml:report=>'<section data-shared-report><ul>'+report.reasons.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul><ul>'+report.suggestions.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul>'+report.issues.map(x=>'<article>'+[x.field,x.evidence,x.reason,x.suggestion].map(escape).join(' / ')+'</article>').join('')+'</section>'
 };
 window.getCardSafetyFeedback=c=>{
  if(feedback)return feedback;
  if(!readiness.pass)return {pass:false,status:'readiness',reasons:readiness.missing.map(field=>'尚缺有效'+field),suggestions:['補齊後重新執行 AI 體檢'],issues:[]};
  const review=window.getCardSafetyConfig(c).safetyReview;
  return review?{status:review.pass?'passed':'failed',suggestions:[],issues:[],...review}:{pass:false,status:'pending',reasons:['尚未執行 AI 體檢'],suggestions:['請先編輯完成再按重新執行 AI 體檢'],issues:[]};
 };
 const document={getElementById:id=>nodes.get(id)||null,createElement:node,querySelectorAll:()=>[],addEventListener(){}};
 const context={window,document,console,localStorage:{getItem:()=>null,setItem(){}},setTimeout};
 vm.runInNewContext(source,context);
 return {window,card,get,nodes,writes,toasts,context,report:()=>get('match-status-card')};
}
test('explicit privacy choice synchronizes existing legacy flags without touching them on page entry',async()=>{
 for(const isPrivate of [true,false]){
  const s=setup({config:{isPrivate,private:isPrivate,visibility:isPrivate?'private':'public',safetyReview:{pass:true,status:'passed',reasons:[],suggestions:[],issues:[]}}});
  const before=s.card['自訂名片設定'];await s.window.initMatchmakePage();assert.equal(s.card['自訂名片設定'],before);assert.equal(s.writes.length,0);
  s.window.ensureCardCanGoPublic=async()=>true;s.get('fate-privacy-toggle').checked=isPrivate;
  await s.window.toggleFatePrivacy(isPrivate);
  const saved=JSON.parse(s.card['自訂名片設定']);assert.equal(saved.isPrivate,!isPrivate);assert.equal(saved.private,!isPrivate);assert.equal(saved.visibility,isPrivate?'public':'private');
 }
});

test('private failed card displays complete saved reasons, evidence and repair actions without writing on entry',async()=>{
 const s=setup();const original=s.card['自訂名片設定'];await s.window.initMatchmakePage();
 const html=s.report().innerHTML;
 for(const text of [...failed.reasons,...failed.suggestions,'保證立即見效','未提供可核實依據','data-shared-report','window.focusMyECardSection?.()','window.toggleFatePrivacy(true)'])assert.ok(html.includes(text),text);
 assert.equal(s.report().classList.contains('hidden'),false);assert.equal(s.get('privacy-lock-container').classList.contains('hidden'),true);
 assert.equal(s.get('matchmaker-ui').classList.contains('hidden'),true);assert.equal(s.get('fate-privacy-toggle').checked,false);
 assert.equal(s.card['自訂名片設定'],original);assert.equal(s.writes.length,0);
});
test('pending review and incomplete readiness show actionable guidance without an automatic AI review',async()=>{
 for(const options of [{config:{isPrivate:true}},{readiness:{pass:false,missing:['圖片','按鈕']}}]){
  const s=setup(options);s.window.ensureCardCanGoPublic=()=>{throw Error('must not run on entry');};await s.window.initMatchmakePage();
  assert.match(s.report().innerHTML,/AI 體檢/);assert.match(s.report().innerHTML,/編輯名片/);assert.match(s.report().innerHTML,/重新執行 AI 體檢/);
  assert.equal(s.report().classList.contains('hidden'),false);assert.equal(s.writes.length,0);
 }
});
test('private passed card remains privacy locked, public passed card remains available',async()=>{
 for(const isPrivate of [true,false]){
  const s=setup({config:{isPrivate,safetyReview:{pass:true,status:'passed',reasons:[],suggestions:[],issues:[]}}});await s.window.initMatchmakePage();
  assert.equal(s.get('privacy-lock-container').classList.contains('hidden'),!isPrivate);
  assert.equal(s.get('matchmaker-ui').classList.contains('hidden'),isPrivate);assert.equal(s.writes.length,0);
 }
});
test('own pool and admin privileges remain available despite saved review failures',async()=>{
 for(const options of [{scope:'own'},{admin:true}]){
  const s=setup(options);await s.window.initMatchmakePage();assert.equal(s.get('matchmaker-ui').classList.contains('hidden'),false);assert.equal(s.get('privacy-lock-container').classList.contains('hidden'),true);assert.equal(s.writes.length,0);
  if(options.admin){assert.equal(s.report().classList.contains('hidden'),false);assert.match(s.report().innerHTML,/未提供依據/);}
 }
});
test('failed explicit review shows the latest saved report, never publishes',async()=>{
 const s=setup({config:{isPrivate:true}});
 s.window.ensureCardCanGoPublic=async card=>{card['自訂名片設定']=JSON.stringify({isPrivate:true,safetyReview:failed});return false;};
 await s.window.toggleFatePrivacy(true);
 assert.equal(s.writes.length,0);assert.equal(s.get('fate-privacy-toggle').checked,false);assert.match(s.report().innerHTML,/服務說明含未提供依據/);assert.match(s.report().innerHTML,/修正聯絡連結/);
});
test('successful review re-reads latest canonical config and preserves saved report and concurrent fields',async()=>{
 const s=setup({config:{isPrivate:true,oldSetting:1}});
 const latest={isPrivate:true,oldSetting:1,newSetting:'retain-me',safetyReview:{pass:true,status:'passed',reasons:['已確認'],suggestions:[],issues:[],reviewedAt:'test-time'}};
 s.window.ensureCardCanGoPublic=async card=>{card['自訂名片設定']=JSON.stringify(latest);return true;};
 await s.window.toggleFatePrivacy(true);
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].action,'updateCard');
 const saved=JSON.parse(s.writes[0].payload.data['自訂名片設定']);assert.deepEqual(saved,{...latest,isPrivate:false});assert.equal(s.get('matchmaker-ui').classList.contains('hidden'),false);
});
test('a thrown review or unchanged template produces durable explanation and no publish write',async()=>{
 for(const template of [false,true]){
  const s=setup({config:{isPrivate:true}});
  if(template)s.card['服務項目']='請填寫公司/店家介紹\n請填寫公司/店家服務項目\n請填寫公司/店家特色\n請填寫優惠資訊\n建議 4-5 行，每行 16 字內';
  s.window.ensureCardCanGoPublic=async()=>{throw Error('體檢服務暫時無法連線');};
  await s.window.toggleFatePrivacy(true);assert.equal(s.writes.length,0);assert.equal(s.report().classList.contains('hidden'),false);
  assert.match(s.report().innerHTML,template?/預設模板/:/AI 服務或網路暫時無法完成檢查/);
 }
});
test('report from another card or a stale async review cannot overwrite current card UI or publish it',async()=>{
 const s=setup();s.window.renderMatchmakeSafetyFeedback(failed,{rowId:'another-card'});assert.equal(s.nodes.has('match-status-card'),false);
 s.window.ensureCardCanGoPublic=async()=>{s.window.currentUserCard={rowId:'new-card','自訂名片設定':'{}'};return true;};
 await s.window.toggleFatePrivacy(true);assert.equal(s.writes.length,0);
});
test('fallback saved feedback is escaped when the shared renderer has not loaded',async()=>{
 const s=setup({config:{isPrivate:true,safetyReview:{pass:false,reasons:['<img src=x onerror=alert(1)>'],suggestions:['<script>bad</script>']}}});
 delete s.window.getCardSafetyFeedback;delete s.window.renderCardSafetyFeedbackHtml;delete s.window.getCardSafetyConfig;
 await s.window.initMatchmakePage();assert.match(s.report().innerHTML,/&lt;img/);assert.match(s.report().innerHTML,/&lt;script&gt;/);assert.doesNotMatch(s.report().innerHTML,/<img src=x|<script>/);assert.equal(s.writes.length,0);
});
test('edit action navigates to the actual settings page before expanding the card editor',async()=>{
 const s=setup(),events=[];await s.window.initMatchmakePage();
 s.window.goPage=page=>events.push(['go',page]);s.window.focusMyECardSection=()=>events.push(['focus']);
 const handler=s.report().innerHTML.match(/onclick="([^"]+)"[^>]*>編輯名片/)[1];
 vm.runInNewContext(handler,{window:s.window});assert.deepEqual(events,[['go','admin-settings'],['focus']]);
});
test('service error preserves persisted public state and its transient explanation without exposing raw provider errors',async()=>{
 for(const throws of [false,true]){
  const s=setup({config:{isPrivate:false,safetyReview:{pass:true,status:'passed',reasons:[],suggestions:[],issues:[]}}});await s.window.initMatchmakePage();const original=s.card['自訂名片設定'];
  const error={pass:false,status:'error',reasons:['AI 服務暫時無法使用，不代表內容不合格。'],suggestions:['請稍後重新檢查；原公開設定不變。'],issues:[]};
  s.window.ensureCardCanGoPublic=async card=>{
   if(throws)throw Error('provider-test-secret-key: do not display');
   s.window.getCardSafetyFeedback=()=>error;s.window.renderMatchmakeSafetyFeedback(error,card);return false;
  };
  await s.window.toggleFatePrivacy(true);
  assert.equal(s.card['自訂名片設定'],original);assert.equal(s.writes.length,0);assert.equal(s.get('fate-privacy-toggle').checked,true);
  assert.equal(s.get('matchmaker-ui').classList.contains('hidden'),false);assert.equal(s.report().classList.contains('hidden'),false);
  assert.match(s.report().innerHTML,/不代表名片?內容不合格|不代表內容不合格/);assert.doesNotMatch(s.report().innerHTML,/provider-test-secret-key/);
 }
});
test('rapid retry during an unfinished review cannot duplicate AI checks or publish writes',async()=>{
 const s=setup();let release,checks=0;s.window.ensureCardCanGoPublic=()=>{checks++;return new Promise(resolve=>{release=resolve;});};
 const first=s.window.toggleFatePrivacy(true);await s.window.toggleFatePrivacy(true);assert.equal(checks,1);assert.equal(s.writes.length,0);
 s.card['自訂名片設定']=JSON.stringify({isPrivate:true,safetyReview:{pass:true,status:'passed',reasons:[],suggestions:[],issues:[]}});release(true);await first;
 assert.equal(s.writes.length,1);
 s.window.ensureCardCanGoPublic=async()=>false;await s.window.toggleFatePrivacy(true);assert.equal(s.writes.length,1);
});
test('actual cardmaster callback retains service errors and latest failed details in the match panel',async()=>{
 for(const unavailable of [false,true]){
  const s=setup({config:{isPrivate:false,title:'測試服務',desc:'提供企業資訊系統規劃及支援服務',imgUrl:'https://example.test/card.jpg',buttons:[{l:'聯絡',u:'https://example.test/contact'}],safetyReview:{pass:true,status:'passed',reasons:[],suggestions:[],issues:[]}}});
  vm.runInNewContext(cardmaster,s.context);await s.window.initMatchmakePage();const original=s.card['自訂名片設定'];
  s.window.fetchAPI=async(action,payload)=>{
   s.writes.push({action,payload});
   if(action==='reviewCardSafety')return unavailable?{success:false,errorCode:'AI_REVIEW_UNAVAILABLE'}:{success:true,data:failed};
   return {success:true};
  };
  await s.window.toggleFatePrivacy(true);
  assert.equal(s.report().classList.contains('hidden'),false);
  if(unavailable){
   assert.equal(s.writes.length,1);assert.equal(s.card['自訂名片設定'],original);assert.equal(s.get('fate-privacy-toggle').checked,true);
   assert.match(s.report().innerHTML,/不代表名片內容不合格/);assert.doesNotMatch(s.report().innerHTML,/尚未完成 AI 體檢，並非已判定不合格/);
  }else{
   assert.equal(s.writes.length,2);const saved=JSON.parse(s.card['自訂名片設定']);assert.equal(saved.isPrivate,true);assert.equal(saved.safetyReview.pass,false);
   assert.match(s.report().innerHTML,/保證立即見效/);assert.match(s.report().innerHTML,/移除保證式措辭/);
   const calls=s.writes.length;await s.window.initMatchmakePage();assert.equal(s.writes.length,calls);assert.match(s.report().innerHTML,/保證立即見效/);
  }
 }
});
test('privacy save requires explicit success and restores the last confirmed state on failure',async()=>{
 for(const isPrivate of [true,false])for(const reply of [undefined,{}, {success:false,error:'provider-secret-do-not-display'}, {success:'true'},'throws']){
  const s=setup({config:{isPrivate,safetyReview:{pass:true,status:'passed',reasons:[],suggestions:[],issues:[]}}});await s.window.initMatchmakePage();const original=s.card['自訂名片設定'];
  s.window.ensureCardCanGoPublic=async()=>true;s.window.fetchAPI=async()=>{if(reply==='throws')throw Error('provider-secret-do-not-display');return reply;};
  if(!isPrivate)s.get('fate-privacy-toggle').checked=false;
  await s.window.toggleFatePrivacy(isPrivate);
  assert.equal(s.card['自訂名片設定'],original);assert.equal(s.get('fate-privacy-toggle').checked,!isPrivate);
  assert.equal(s.get('matchmaker-ui').classList.contains('hidden'),isPrivate);
  assert.equal(s.report().classList.contains('hidden'),false);assert.match(s.report().innerHTML,/尚未確認儲存成功/);
  assert.equal(s.toasts.some(([message])=>/已公開名片|已切換為私人模式/.test(message)),false);
  assert.doesNotMatch(s.report().innerHTML+JSON.stringify(s.toasts),/provider-secret-do-not-display/);
 }
});
test('successful privacy save for an earlier card does not update the newly active card',async()=>{
 const s=setup({config:{isPrivate:true,safetyReview:{pass:true,status:'passed',reasons:[],suggestions:[],issues:[]}}});
 s.window.ensureCardCanGoPublic=async()=>true;const replacement={rowId:'new-card','自訂名片設定':'{"isPrivate":true}'};
 s.window.fetchAPI=async()=>{s.window.currentUserCard=replacement;return {success:true};};
 await s.window.toggleFatePrivacy(true);assert.equal(replacement['自訂名片設定'],'{"isPrivate":true}');assert.equal(s.toasts.some(([message])=>/已公開名片/.test(message)),false);
});
