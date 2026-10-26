const MEDIA = 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/people-island/';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = value => typeof value === 'string' ? value.trim() : '';
const stages = new Set(['join','register','card','review','ready']);
const labels = {join:'加入點數通・探索人脈島',register:'完成註冊，準備交流',card:'上傳我的名片',review:'查看名片與審核',ready:'進入人脈島開始交流'};
const explanations = {
  join:'先加入點數通官方帳號，就能進島參觀。',
  register:'已加入點數通，現在可以參觀。完成會員註冊與本人名片審核後，即可開始交流。',
  card:'已完成註冊。建議上傳自己的名片，建立專長與服務介紹；也可以自行填寫。',
  review:'現在可以參觀。請確認本人名片資料並完成 AI 審核，通過後即可開始交流。',
  ready:'本人名片已通過審核，可以進入人脈島開始交流。'
};
let activeController;
let autoShareConsumed = false;
let autoEditConsumed = false;
let myCardModuleRequest;

async function loadIslandMyCardModule() {
  if (window.MyCardModule?.createIslandCardFromProfile && window.MyCardModule?.selectIslandCardUpload) return window.MyCardModule;
  if (!myCardModuleRequest) myCardModuleRequest=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=new URL('mycard.js?v=8.99&island=2',import.meta.url).href;
    script.onload=()=>window.MyCardModule?.createIslandCardFromProfile?resolve(window.MyCardModule):reject(Error('名片設定尚未載入，請重試。'));
    script.onerror=()=>reject(Error('名片設定載入失敗，請重試。'));document.head.append(script);
  }).catch(error=>{myCardModuleRequest=null;throw error;});
  return myCardModuleRequest;
}

function cardChoicePair() {
  const pair=document.createElement('div');pair.className='pic-card-choices';pair.hidden=true;
  pair.innerHTML='<button type="button" class="pic-primary" data-pic-create="upload">上傳名片</button><button type="button" data-pic-create="line">用 LINE 生成<span class="pic-choice-note">需填寫個資</span></button>';
  return pair;
}

export function islandEntryParams(input) {
  const source = input || window.readActmasterInitialParams?.() || new URLSearchParams(location.search);
  const params = new URLSearchParams();
  for (const key of ['ref','net']) {
    const value = source.get(key) || source.get(key === 'ref' ? 'r' : 'n') || '';
    if (value && value.length <= 180 && !/[\u0000-\u0020\u007f]/.test(value)) params.set(key, value);
  }
  return params;
}

export function islandLiffUrl(input, additions = { peopleIslandCard:'1' }) {
  const id = text(window.DEFAULT_LIFF_ID || window.Config?.DEFAULT_LIFF_ID || '1660923784-vViMTZ1y');
  if (!/^\d+-[\w-]+$/.test(id)) throw Error('LINE 入口設定暫時無法使用');
  const url = new URL('https://liff.line.me/' + id);
  const params = islandEntryParams(input);
  for (const [key,value] of Object.entries(additions)) if (value) params.set(key,String(value));
  url.search = params.toString();
  return url.href;
}

function stylesheet(file, marker) {
  if (document.querySelector(`link[data-${marker}]`)) return Promise.resolve();
  return new Promise((resolve,reject) => {
    const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../'+file,import.meta.url).href;link.dataset[marker.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]='';
    const timeout=setTimeout(()=>{link.remove();reject(Error('人脈島畫面載入逾時，請重試'));},8000);
    link.onload=()=>{clearTimeout(timeout);resolve();};link.onerror=()=>{clearTimeout(timeout);link.remove();reject(Error('人脈島畫面載入失敗，請重試'));};document.head.append(link);
  });
}

function imageUrl(value) {
  try {const url=new URL(typeof value==='string'&&value.length<=2048?value:'');return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
function avatar(row) {
  const url=imageUrl(row.avatarUrl||row.pictureUrl);
  return `<span class="bi-avatar pic-avatar" aria-hidden="true"><span>${esc(text(row.name||row.displayName).slice(0,1)||'會')}</span>${url?`<img data-bi-avatar data-pic-avatar src="${esc(url)}" referrerpolicy="no-referrer" alt="" hidden>`:''}</span>`;
}
function bindImages(root) {
  for (const image of root.querySelectorAll('img[data-pic-avatar]:not([data-bound])')) {
    image.dataset.bound='';const initial=image.previousElementSibling;
    const loaded=()=>{initial.hidden=true;image.hidden=false;},failed=()=>{initial.hidden=false;image.remove();};
    image.addEventListener('load',loaded,{once:true});image.addEventListener('error',failed,{once:true});
    if(image.complete){if(image.naturalWidth)loaded();else failed();}
  }
}

export async function mountPeopleIslandCard({ params, embedded=false } = {}) {
  activeController?.destroy();
  const incomingParams=params||window.readActmasterInitialParams?.()||new URLSearchParams(location.search);
  const shareOnOpen=embedded&&incomingParams.get('islandShare')==='1';
  const editOnOpen=embedded&&incomingParams.get('islandVideoEdit')==='1';
  params=islandEntryParams(incomingParams);
  const root=document.getElementById('page-business-island');
  if(!root)throw Error('人脈島入口尚未準備好，請重新開啟');
  if(embedded)window.goPage?.('business-island',true);
  await stylesheet('css/people-island-card.css?v=2','people-island-card');
  let world,rows=[],next='',stage='',generation=0,flight,copyFlight,textEditor,editing=false,closed=false,suspended=false,loading=false,session='',owner='';
  const current=()=>!closed&&!suspended&&!document.hidden&&shell.isConnected&&root.contains(shell)&&(!embedded||window.currentPage==='business-island')&&session===token()&&owner===text(window.currentUserProfile?.userId);
  const token=()=>{try{return window.liff?.isLoggedIn?.()?text(window.liff.getAccessToken?.()):'';}catch{return '';}};
  root.innerHTML=`<article class="pic-shell"><section class="pic-intro"><p class="pic-eyebrow">點數通 × 人脈島</p><h1>讓名片走進人脈</h1><p class="pic-lead">探索不同產業，認識新的合作夥伴。<br>先來參觀，再讓大家認識你的專長。</p><video class="pic-video" controls playsinline preload="metadata" poster="${MEDIA}video-card-v3.jpg" aria-label="人脈島介紹影片，含繁體中文字幕"><source src="${MEDIA}video-card-v3.mp4" type="video/mp4">您的裝置無法播放此影片，仍可點下方按鈕參觀人脈島。</video><div class="pic-actions"><button class="pic-primary" type="button" data-pic-primary>${labels.join}</button><button type="button" data-pic-share>分享人脈島影音名片</button></div><p class="pic-note">加入後可參觀；完成註冊及本人名片 AI 審核後開啟交流。</p><a data-pic-home href="${esc(islandLiffUrl(params,{}))}">回到點數通首頁</a></section><p class="pic-status" data-pic-status role="status" aria-live="polite"></p><div class="pic-actions"><button type="button" data-pic-retry hidden>重新確認</button><a class="pic-button" data-pic-add href="${esc(window.POINT_OA_URL||'https://lin.ee/sDW7u4T')}" target="_blank" rel="noopener noreferrer" hidden>加入點數通官方帳號</a></div><section class="pic-visit" data-pic-visit hidden><div class="pic-visit-head"><div><h2>歡迎來到人脈島</h2><p class="pic-warning" data-pic-explanation></p><p class="pic-note">想讓別人認識你的專長？上傳自己的名片，也可以自行填寫。</p></div><div class="pic-actions"><button type="button" class="pic-primary" data-pic-setup></button><button type="button" data-pic-roll>擲骰探索</button></div></div><div class="pic-selected" data-pic-selected hidden></div><div class="pic-scene"><div data-pic-dice></div><div class="bi-stage pic-stage" data-pic-stage></div></div><p class="pic-note" data-pic-count></p><div class="pic-roster" data-pic-roster></div><div class="pic-actions"><button type="button" data-pic-more hidden>更多公開會員</button></div></section></article>`;
  const shell=root.querySelector('.pic-shell');
  const $=selector=>shell.querySelector(selector);
  const topChoice=cardChoicePair(),visitChoice=cardChoicePair(),shareRow=document.createElement('div');
  $('[data-pic-primary]').parentElement.append(topChoice);$('[data-pic-setup]').parentElement.append(visitChoice);
  shareRow.className='pic-actions pic-share-row';$('[data-pic-primary]').parentElement.after(shareRow);shareRow.append($('[data-pic-share]'));
  const editRow=document.createElement('div');editRow.className='pic-actions pic-share-row';
  editRow.innerHTML='<button type="button" data-pic-edit-video>編輯我的影音名片・標題與說明</button>';
  shareRow.after(editRow);
  function showCardChoices(){const shown=stage==='card'||stage==='review';topChoice.hidden=!shown;visitChoice.hidden=!shown;$('[data-pic-primary]').hidden=shown;$('[data-pic-setup]').hidden=shown;}
  function status(message){$('[data-pic-status]').textContent=message;}
  function clearVisitor(){world?.destroy();world=null;rows=[];next='';$('[data-pic-roster]').replaceChildren();$('[data-pic-visit]').hidden=true;$('[data-pic-selected]').hidden=true;}
  function invalidate(){generation++;flight?.abort();flight=null;copyFlight?.abort();copyFlight=null;textEditor?.close();textEditor=null;loading=false;clearVisitor();}
  function safeError(error){return error?.name==='AbortError'?'連線暫停，請重新確認。':error?.message||'目前無法確認資格，請稍後重試。';}
  async function request(path,ticket) {
    const base=new URL(window.Config?.WORKER_URL||window.WORKER_URL||'');
    if(base.protocol!=='https:'||!session)throw Error('請重新進入 LINE 登入後再試。');
    const controller=new AbortController();flight=controller;
    const timeout=setTimeout(()=>controller.abort(),8000);
    try {
      const response=await fetch(new URL('v1/island-entry/'+path,base.href.replace(/\/?$/,'/')),{headers:{Authorization:'Bearer '+session},signal:controller.signal,cache:'no-store'});
      if(!current()||ticket!==generation)return null;
      const data=await response.json().catch(()=>null);
      if(!response.ok||data?.success!==true)throw Error(text(data?.error)||'人脈島暫時無法讀取，請重試。');
      return data;
    } finally {clearTimeout(timeout);if(flight===controller)flight=null;}
  }
  function showSummary(handle){
    if(!current())return;const row=rows.find(item=>item.handle===handle);if(!row)return;
    const box=$('[data-pic-selected]');box.hidden=false;box.innerHTML=`<strong>${esc(row.name||'會員')}</strong><p>${esc([row.company,row.title].filter(Boolean).join(' · '))}</p><p class="pic-note">目前為參觀模式。${stage==='ready'?'按「進入人脈島開始交流」即可聯絡。':'完成註冊及本人名片審核後，就能開始交流。'}</p><button type="button" data-pic-close-summary>關閉介紹</button>`;
  }
  function renderRoster(){
    $('[data-pic-roster]').innerHTML=rows.map(row=>`<button type="button" data-pic-member="${esc(row.handle)}">${avatar(row)}<span class="pic-person-copy"><strong>${esc(row.name||'會員')}</strong><small>${esc([row.company,row.title].filter(Boolean).join(' · '))}</small></span></button>`).join('');
    bindImages(root);$('[data-pic-count]').textContent=`目前載入 ${rows.length} 位公開會員，點選人物可看介紹。`;$('[data-pic-more]').hidden=!next;world?.renderMembers(rows.map(row=>({...row,canChat:false,onlineKnown:false})));
  }
  async function loadMembers(ticket,append=false){
    const data=await request('members'+(append&&next?'?after='+encodeURIComponent(next):''),ticket);if(!data||!current()||ticket!==generation)return;
    if(!Array.isArray(data.items)||typeof data.next!=='string')throw Error('公開名冊資料暫時無法讀取，請重試。');
    const incoming=data.items.filter(row=>row&&typeof row.handle==='string'&&row.handle.length<=180).map(row=>({handle:row.handle,name:text(row.name).slice(0,80),company:text(row.company).slice(0,100),title:text(row.title).slice(0,80),industry:text(row.industry).slice(0,80),avatarUrl:imageUrl(row.avatarUrl)}));
    rows=[...new Map((append?[...rows,...incoming]:incoming).map(row=>[row.handle,row])).values()];next=data.next;renderRoster();
  }
  async function visitor(ticket){
    await stylesheet('css/business-island.css?v=10','people-island-scene');
    const scene=await import('./business-island-world.mjs?v=9');if(!current()||ticket!==generation)return;
    $('[data-pic-visit]').hidden=false;$('[data-pic-explanation]').textContent=explanations[stage];$('[data-pic-setup]').textContent=labels[stage];
    world=scene.createIslandWorld({host:$('[data-pic-stage]'),diceHost:$('[data-pic-dice]'),asset:name=>new URL('../../'+name,import.meta.url).href,avatar,profile:window.currentUserProfile,isCurrent:current,onMember:showSummary,onCategory:()=>{},onSail:async category=>{
      if(!current()||loading)return;loading=true;try{await world?.sailTo(category,{valid:current});}catch(error){if(current())status(safeError(error));}finally{loading=false;}
    }});
    await loadMembers(ticket);if(current())status('已加入點數通，可以自由參觀。');
  }
  async function check(){
    if(closed||suspended||document.hidden)return;
    invalidate();session=token();owner=text(window.currentUserProfile?.userId);const ticket=generation;
    stage='';$('[data-pic-retry]').hidden=true;$('[data-pic-add]').hidden=true;$('[data-pic-primary]').disabled=true;status('正在確認加入及名片資格…');
    try{
      const data=await request('status',ticket);if(!data||!current()||ticket!==generation)return;
      if(!stages.has(data.stage))throw Error('資格狀態暫時無法確認，請重試。');
      stage=data.stage;$('[data-pic-primary]').textContent=labels[stage];showCardChoices();status(explanations[stage]);
      if(stage==='join'){$('[data-pic-add]').hidden=false;$('[data-pic-retry]').textContent='已加入，重新確認';$('[data-pic-retry]').hidden=false;}
      else await visitor(ticket);
    }catch(error){if(ticket===generation&&!closed){status(safeError(error));$('[data-pic-retry]').hidden=false;}}
    finally{if(ticket===generation&&!closed)$('[data-pic-primary]').disabled=false;}
  }
  async function primary(){
    if(!embedded){location.href=islandLiffUrl(params);return;}
    if(!stage){await check();return;}
    if(stage==='join'){
      try{if(typeof window.liff?.requestFriendship==='function')await window.liff.requestFriendship();else window.open(window.POINT_OA_URL||'https://lin.ee/sDW7u4T','_blank','noopener,noreferrer');}catch{window.open(window.POINT_OA_URL||'https://lin.ee/sDW7u4T','_blank','noopener,noreferrer');}
      await check();return;
    }
    location.href=islandLiffUrl(params,{peopleIsland:'1',...(stage==='register'?{islandSetup:'register'}:stage!=='ready'?{islandSetup:'card'}:{})});
  }
  async function copyRequest(method,ticket,data){
    if(!current()||ticket!==generation)throw Error('登入或頁面已變更，請重新開啟。');
    const base=new URL(window.Config?.WORKER_URL||window.WORKER_URL||'');
    if(base.protocol!=='https:')throw Error('人脈島設定服務暫時無法使用。');
    const controller=new AbortController();copyFlight=controller;
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(new URL('v1/island-video-card',base.href.replace(/\/?$/,'/')),{method,headers:{Authorization:'Bearer '+session,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store',signal:controller.signal});
      const result=await response.json();
      if(!current()||ticket!==generation)throw Error('登入或頁面已變更，未套用過期結果。');
      if(!response.ok||result?.success!==true)throw Error(text(result?.error)||'影音名片儲存失敗，草稿仍保留。');
      const card=result.card;
      if(!card||typeof card.title!=='string'||typeof card.desc!=='string'||!Number.isSafeInteger(card.revision))throw Error('影音名片資料不完整，請重新開啟。');
      return card;
    }finally{clearTimeout(timeout);if(copyFlight===controller)copyFlight=null;}
  }
  function displayCopy(card){
    $('.pic-intro h1').textContent=card.title;
    $('.pic-lead').textContent=card.desc;$('.pic-lead').style.whiteSpace='pre-line';
  }
  async function editVideoText(){
    if(!embedded){location.href=islandLiffUrl(params,{peopleIslandCard:'1',islandVideoEdit:'1'});return;}
    if(editing||textEditor)return;
    const ticket=generation,button=$('[data-pic-edit-video]');editing=true;button.disabled=true;
    try{
      let copy=await copyRequest('GET',ticket);
      const module=await loadIslandMyCardModule();
      if(!current()||ticket!==generation)return;
      if(typeof module?.openVideoCardTextEditor!=='function')throw Error('請重新整理頁面，載入新版影片名片編輯器。');
      displayCopy(copy);let attempt;
      textEditor=await module.openVideoCardTextEditor({
        title:copy.title,desc:copy.desc,videoUrl:MEDIA+'video-card-v3.mp4',thumbnailUrl:MEDIA+'video-card-v3.jpg',
        buttons:[{l:labels.join},{l:'分享好友'}],isCurrent:()=>current()&&ticket===generation,
        onSave:async draft=>{
          if(!current()||ticket!==generation)throw Error('登入身分已變更，請重新開啟。');
          const facts=JSON.stringify({title:draft.title,desc:draft.desc,revision:copy.revision});
          if(attempt?.facts!==facts)attempt={facts,requestKey:crypto.randomUUID()};
          copy=await copyRequest('PUT',ticket,{...JSON.parse(facts),requestKey:attempt.requestKey});
          displayCopy(copy);status('我的人脈島影音名片已儲存；重新輸入「人脈島」或分享會使用新版文案。');
          return true;
        },
        onShare:share,onClose:()=>{textEditor=null;}
      });
    }catch(error){if(!closed&&ticket===generation)status(safeError(error));}
    finally{editing=false;if(button.isConnected)button.disabled=false;}
  }
  async function share(){
    if(!embedded){location.href=islandLiffUrl(params,{peopleIslandCard:'1',islandShare:'1'});return;}
    const button=$('[data-pic-share]');button.disabled=true;
    try{
      if(typeof window.liff?.shareTargetPicker!=='function'||window.liff.isApiAvailable?.('shareTargetPicker')!==true)throw Error('請在支援分享的 LINE 中開啟影音名片。');
      const ticket=generation;
      const personal=await request('share-link',ticket);
      if(!personal||!current()||ticket!==generation)return;
      if(typeof personal.entryUrl!=='string'||!personal.entryUrl.trim())throw Error('專屬分享連結暫時無法取得，請重試。');
      const module=await import('./people-island-flex.mjs?v=5');if(!current()||ticket!==generation)return;
      const message=module.buildPeopleIslandVideoFlex({entryUrl:personal.entryUrl,...(personal.card?{title:personal.card.title,desc:personal.card.desc}:{})});
      const result=await window.liff.shareTargetPicker([message]);
      if(current())status(result?.status==='success'?'影音名片已分享。':'分享視窗已關閉，未確認送出。');
    }catch(error){if(!closed)status(safeError(error));}finally{if(button.isConnected)button.disabled=false;}
  }
  function click(event){
    const button=event.target.closest('button');if(!button||!root.contains(button))return;
    if(['upload','line'].includes(button.dataset.picCreate)){location.href=islandLiffUrl(params,{peopleIsland:'1',islandSetup:button.dataset.picCreate});}
    else if(button.hasAttribute('data-pic-primary')||button.hasAttribute('data-pic-setup'))void primary();
    else if(button.hasAttribute('data-pic-retry'))void check();
    else if(button.hasAttribute('data-pic-share'))void share();
    else if(button.hasAttribute('data-pic-edit-video'))void editVideoText();
    else if(button.dataset.picMember)showSummary(button.dataset.picMember);
    else if(button.hasAttribute('data-pic-close-summary'))$('[data-pic-selected]').hidden=true;
    else if(button.hasAttribute('data-pic-more')&&!loading){loading=true;button.disabled=true;loadMembers(generation,true).catch(error=>{if(current())status(safeError(error));}).finally(()=>{loading=false;if(button.isConnected)button.disabled=false;});}
    else if(button.hasAttribute('data-pic-roll')&&world&&current()&&!loading){loading=true;button.disabled=true;const dice=new Uint32Array(2);crypto.getRandomValues(dice);world.roll({dice1:1+dice[0]%6,dice2:1+dice[1]%6,rows,valid:current}).then(result=>{if(result?.handle)showSummary(result.handle);}).catch(error=>{if(current())status(safeError(error));}).finally(()=>{loading=false;if(button.isConnected)button.disabled=false;});}
  }
  const visibility=()=>{if(document.hidden){generation++;flight?.abort();copyFlight?.abort();textEditor?.close();textEditor=null;world?.pause(true);}else if(embedded)void check();};
  const pagehide=()=>{suspended=true;invalidate();root.querySelector('video')?.pause();};
  const pageshow=event=>{if(event.persisted){suspended=false;if(embedded)void check();}};
  const sessionCheck=()=>{if(!closed&&(!shell.isConnected||!root.contains(shell)||(embedded&&window.currentPage!=='business-island'))){destroy();return;}if(embedded&&!closed&&!suspended&&(token()!==session||owner!==text(window.currentUserProfile?.userId))){invalidate();stage='';status('登入身分已變更，請重新確認。');$('[data-pic-retry]').hidden=false;}};
  const timer=embedded?setInterval(sessionCheck,1000):null;
  function destroy(){if(closed)return;closed=true;invalidate();clearInterval(timer);root.removeEventListener('click',click);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',pageshow);}
  root.addEventListener('click',click);document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',pageshow);
  activeController={destroy,check};
  if(embedded){
    const identityToken=token(),profile=await window.liff.getProfile();if(identityToken!==token()){status('登入身分已變更，請重新開啟。');return activeController;}window.currentUserProfile=profile;
    if(params.get('ref')&&typeof window.writeFirstReferral==='function')window.writeFirstReferral(text(profile.userId),params.get('ref'),params.get('net')||'admin');
    if(!closed)await check();
    if(editOnOpen&&!autoEditConsumed&&current()){
      autoEditConsumed=true;await editVideoText();
    }
    if(shareOnOpen&&!autoShareConsumed&&current()){
      autoShareConsumed=true;
      await share();
    }
  }
  return activeController;
}

export async function routePeopleIslandSetup({params,checkRes,refId='',netId='admin'}={}) {
  if(params?.get('peopleIsland')!=='1')return false;
  const valid=checkRes&&!checkRes.error&&checkRes.success!==false&&typeof checkRes.isRegistered==='boolean'&&(!checkRes.isRegistered||(checkRes.info&&typeof checkRes.info==='object'&&!Array.isArray(checkRes.info)));
  if(!valid){await mountPeopleIslandCard({params,embedded:true});return true;}
  if(checkRes.isRegistered)window.applyRegisteredUserSession?.(checkRes.info,{skipHome:true});
  else window.applyUnregisteredHomeSession?.({referrerId:refId,networkId:netId,skipHome:true});
  const setup=params.get('islandSetup');
  if(!setup){
    const token=window.liff?.getAccessToken?.(),owner=text(window.currentUserProfile?.userId),page=window.currentPage,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(new URL('v1/island-entry/status',window.Config?.WORKER_URL||window.WORKER_URL),{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});const state=await response.json().catch(()=>null);
      if(token!==window.liff?.getAccessToken?.()||owner!==text(window.currentUserProfile?.userId)||page!==window.currentPage||document.hidden)return true;
      if(response.ok&&state?.success===true&&state.stage==='ready'&&typeof window.openBusinessIsland==='function'){await window.openBusinessIsland();return true;}
    }catch{}finally{clearTimeout(timeout);}
    await mountPeopleIslandCard({params,embedded:true});return true;
  }
  await stylesheet('css/people-island-card.css?v=2','people-island-card');
  const method=setup==='line'?'line':setup==='upload'?'upload':'';
  let cardModule;
  if(method&&checkRes.isRegistered)cardModule=await loadIslandMyCardModule();
  window.goPage?.(checkRes.isRegistered?'admin-settings':'register');
  if(checkRes.isRegistered&&method){
    const details=document.getElementById(method==='line'?'details-profile-registration':'details-my-ecard');
    if(details){
      details.open=true;details.querySelector('[data-pic-creation-panel]')?.remove();
      const panel=document.createElement('section');panel.className='pic-creation-panel';panel.dataset.picCreationPanel='';
      panel.innerHTML=method==='line'?'<p>請確認真實姓名、手機與個資同意，再用 LINE 資料建立私人名片草稿。已有本人名片時會開啟原名片，不會重做或覆蓋。</p><button type="button" data-pic-confirm-line>確認個資並用 LINE 生成</button><p data-pic-creation-status role="status"></p>':'<p>新名片會使用原本的名片辨識流程。已有本人名片時，只在您選擇圖片後更新圖片草稿，也可直接編輯原名片。</p><button type="button" data-pic-select-upload>選擇名片圖片</button><button type="button" data-pic-edit-existing>編輯現有名片</button><p data-pic-creation-status role="status"></p>';
      if(method==='upload')details.querySelector('summary')?.after(panel);else details.append(panel);
      const privacy=document.getElementById('profile-privacy-agree');if(method==='line'&&privacy)privacy.checked=false;
      if(method==='upload'){
        const buttons=[...panel.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);
        const prepareActor={uid:text(window.currentUserProfile?.userId),token:window.liff?.getAccessToken?.()||''};
        await cardModule.prepareIslandCardUpload({isCurrent:()=>panel.isConnected&&window.currentPage==='admin-settings'&&prepareActor.uid===text(window.currentUserProfile?.userId)&&prepareActor.token===(window.liff?.getAccessToken?.()||'')});
        buttons.forEach(button=>button.disabled=false);
      }
      let busy=false;const capture=()=>({uid:text(window.currentUserProfile?.userId),token:window.liff?.getAccessToken?.()||''});
      panel.addEventListener('click',async event=>{
        const button=event.target.closest('button');if(!button||!panel.contains(button)||busy)return;
        const actor=capture(),current=()=>actor.uid&&actor.token&&actor.uid===capture().uid&&actor.token===capture().token&&panel.isConnected&&window.currentPage==='admin-settings';
        if(!current())return;busy=true;button.disabled=true;const status=panel.querySelector('[data-pic-creation-status]');status.textContent='';
        try{
          if(button.hasAttribute('data-pic-confirm-line')){
            const saved=await window.saveProfileRegistration?.({currentTarget:button},{island:true,isCurrent:current});
            if(saved!==true||!current()){if(current())status.textContent='請確認個資已成功儲存，再按一次生成。';return;}
            await cardModule.createIslandCardFromProfile({currentTarget:button},{isCurrent:current});
          }else await cardModule.selectIslandCardUpload({currentTarget:button},{isCurrent:current,editOnly:button.hasAttribute('data-pic-edit-existing')});
        }catch(error){if(current())status.textContent=error?.message||'名片操作尚未完成，請重試。';}
        finally{busy=false;if(button.isConnected)button.disabled=false;}
      });
      (method==='upload'?panel:details).scrollIntoView({block:'start',behavior:'smooth'});
    }
  }else if(checkRes.isRegistered){window.focusMyECardSection?.();window.showToast?.('上傳自己的名片或自行填寫，確認資料後完成 AI 審核。');}
  document.body.classList.add('people-island-setup');document.querySelector('[data-pic-return]')?.remove();
  const button=document.createElement('button');button.type='button';button.className='pic-setup-return';button.dataset.picReturn='';button.textContent='返回人脈島・確認審核進度';button.addEventListener('click',()=>{location.href=islandLiffUrl(params);});document.body.append(button);
  return true;
}
