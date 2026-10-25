// The island scene is a view/controller over the existing authorized member directory.
// It never fetches member data, opens cards/chats, or writes application data.
const clean = value => String(value ?? '').trim();
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const CATEGORIES = Object.freeze([
  { id:'food', label:'餐飲美食島', caption:'咖啡香與好食光，從一餐聊出新合作。' },
  { id:'lodging', label:'旅宿度假島', caption:'水岸旅宿與度假泳池，遇見款待旅人的夥伴。' },
  { id:'leisure', label:'休閒遊樂島', caption:'走進遊樂園與綠地，一起發現生活的靈感。' },
  { id:'shopping', label:'購物商圈島', caption:'逛逛特色小店，交流品牌與零售的新點子。' },
  { id:'mobility', label:'交通運輸島', caption:'碼頭與車站串起人脈，讓合作順利啟程。' },
  { id:'services', label:'專業服務島', caption:'在交流廣場認識不同專長，找到互補的夥伴。' },
  { id:'manufacturing', label:'製造產業島', caption:'從工坊到產業聚落，串接技術、供應與創新。' }
].map(Object.freeze));

// Public presentation metadata is authoritative when present. Ambiguous tourism /
// transport classification is split using only the public company/title summary.
export function classifyMember(row = {}) {
  if(CATEGORIES.some(item=>item.id===row.islandCategory))return row.islandCategory;
  const summary=[clean(row.company),clean(row.title)].join(' ').toLowerCase(),industry=clean(row.industry);
  const lodging=/旅宿|旅館|飯店|酒店|民宿|住宿|度假|hotel|hostel|lodging|resort|inn\b/;
  const mobility=/交通|運輸|物流|貨運|汽車|機車|租車|計程車|車業|航運|航空|快遞|transport|logistic|automotive|mobility/;
  const primary={'餐飲食品':'food','零售電商':'shopping','直銷／社群電商':'shopping','製造批發貿易':'manufacturing','健康醫療':'services','美容美業':'services','金融保險':'services','房地產居家':'services','工商專業服務':'services','教育培訓':'services','科技資訊':'services','行銷設計媒體':'services','社團協會公益':'services'};
  if(primary[industry])return primary[industry];
  if(industry==='旅遊交通服務')return lodging.test(summary) ? 'lodging' : mobility.test(summary) ? 'mobility' : 'leisure';
  if(/餐飲|餐廳|餐館|料理|飲食|食品|咖啡|烘焙|麵包|甜點|茶飲|便當|早餐|food|cafe|café|coffee|restaurant|bakery/.test(summary))return 'food';
  if(lodging.test(summary))return 'lodging';
  if(mobility.test(summary))return 'mobility';
  if(/休閒|遊樂|旅遊|旅行|觀光|運動|健身|娛樂|戶外|露營|樂園|leisure|travel|tourism|sport|fitness/.test(summary))return 'leisure';
  if(/製造|工業|工廠|機械|金屬|半導體|塑膠|紡織|生產|加工|manufactur|factory|industrial/.test(summary))return 'manufacturing';
  if(/零售|商店|電商|商行|百貨|超市|購物|批發|買賣|服飾|retail|shop|e-commerce|commerce|boutique/.test(summary))return 'shopping';
  return 'services';
}
export const RING_STOPS=Object.freeze([[22,80],[37,86],[55,86],[73,80],[84,68],[87,52],[78,37],[61,29],[43,29],[26,37],[15,52],[15,68]].map(Object.freeze));
export const LOOP_SIZE=RING_STOPS.length;

export const DICE_ROTATIONS = Object.freeze({
  1:'rotateX(0deg) rotateY(0deg)', 2:'rotateX(90deg) rotateY(0deg)',
  3:'rotateX(0deg) rotateY(-90deg)', 4:'rotateX(0deg) rotateY(90deg)',
  5:'rotateX(-90deg) rotateY(0deg)', 6:'rotateX(0deg) rotateY(180deg)'
});
const die = (index, value) => `<span class="bi-3d-dice-scene"><span class="bi-3d-die" data-die="${index}" data-value="${value}" style="transform:${DICE_ROTATIONS[value]}" aria-hidden="true">${[['front',1],['back',6],['right',3],['left',4],['top',5],['bottom',2]].map(([side,count]) => `<span class="bi-3d-face ${side} bi-face-${count}">${'<span class="bi-dot"></span>'.repeat(count)}</span>`).join('')}</span></span>`;
export function diceMarkup(dice1 = 1, dice2 = 1) {
  const first = Number.isInteger(dice1) && dice1 >= 1 && dice1 <= 6 ? dice1 : 1;
  const second = Number.isInteger(dice2) && dice2 >= 1 && dice2 <= 6 ? dice2 : 1;
  return `<span class="bi-3d-dice-box" data-dice1="${first}" data-dice2="${second}" data-total="${first+second}" data-rolling="false" role="img" aria-label="${first} 加 ${second} 等於 ${first+second} 點">${die(1,first)}${die(2,second)}</span><span class="bi-dice-total">${first} + ${second} = ${first+second} 點</span>`;
}
const walker = () => '<span class="bi-walker-shadow"></span><span class="bi-walker-head"></span><span class="bi-walker-body"></span><span class="bi-walker-arm is-left"></span><span class="bi-walker-arm is-right"></span><span class="bi-walker-leg is-left"></span><span class="bi-walker-leg is-right"></span>';
const uniqueRows = rows => [...new Map((Array.isArray(rows) ? rows : []).filter(row => row && typeof row.handle === 'string' && row.handle).map(row => [row.handle,row])).values()];
const distance = (left,right) => Math.hypot(right.x-left.x,right.y-left.y);
function routeMetrics(points) {
  let length=0;
  return {points:points.map((point,index) => {if(index)length+=distance(points[index-1],point);return {...point,distance:length};}),length};
}
function pointAt(route, at) {
  const points=route.points;
  if(at<=0)return points[0];
  for(let index=1;index<points.length;index++)if(at<=points[index].distance){
    const before=points[index-1],after=points[index],ratio=(at-before.distance)/(after.distance-before.distance||1);
    return {x:before.x+(after.x-before.x)*ratio,y:before.y+(after.y-before.y)*ratio,phase:after.phase||'walking'};
  }
  return points.at(-1);
}
const transform = point => `translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0)`;

export function createIslandWorld({host,asset,avatar,onMember,onCategory,onSail,isCurrent=()=>true,diceHost,profile} = {}) {
  if (!host?.ownerDocument || typeof asset !== 'function' || typeof avatar !== 'function') throw Error('交流島場景缺少必要設定');
  const doc=host.ownerDocument,view=doc.defaultView;
  const world=doc.createElement('div');world.className='bi-world';world.dataset.rolling='false';world.dataset.paused=String(!!doc.hidden);
  world.innerHTML=CATEGORIES.map((category,index) => `<section class="bi-world-island" data-island="${category.id}" data-visible="false" style="--bi-island-index:${index}" aria-labelledby="bi-world-${category.id}-title"><h3 class="bi-world-title" id="bi-world-${category.id}-title"><button type="button" class="bi-world-category" data-category="${category.id}">${esc(category.label)}</button></h3><p class="bi-world-caption">${esc(category.caption)}</p><img class="bi-world-art" src="${esc(asset(`assets/business-island/${category.id}-v1.webp`))}" alt="${esc(category.label)}的立體島嶼場景" loading="${index ? 'lazy' : 'eager'}" decoding="async"><svg class="bi-ring-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${[...RING_STOPS,RING_STOPS[0]].map(point=>point.join(',')).join(' ')}" /></svg><div class="bi-ring-stations" aria-hidden="true">${RING_STOPS.map(([x,y],station)=>`<span class="bi-ring-stop" data-station="${station}" style="left:${x}%;top:${y}%">${station+1}</span>`).join('')}</div><div class="bi-world-members"></div><div class="bi-island-member-bank"><p class="bi-island-member-summary" role="status"></p><button type="button" class="bi-island-members-more" data-bi-members-more="${category.id}" hidden>更多本島會員</button><button type="button" class="bi-island-sail" data-bi-sail="${category.id}">搭船前往${esc(category.label)}</button></div><span class="bi-pool" aria-hidden="true"><span class="bi-pool-water"></span><span class="bi-swimmer"></span><span class="bi-swimmer"></span><span class="bi-pool-ripple"></span><span class="bi-pool-ripple"></span></span><span class="bi-world-boat" aria-hidden="true"><span class="bi-boat-hull"></span><span class="bi-boat-cabin"></span><span class="bi-boat-wake"></span></span>${[0,1,2].map((_,person) => `<span class="bi-walker" style="--bi-walker-index:${person}" aria-hidden="true">${walker()}</span>`).join('')}</section>`).join('');
  const player=doc.createElement('span');player.className='bi-world-player';player.dataset.moving='false';player.dataset.step='0';player.dataset.total='0';player.dataset.travel='walking';player.dataset.phase='idle';world.dataset.phase='idle';player.setAttribute('aria-label','我的探索位置');
  player.innerHTML=`<span class="bi-player-shadow"></span><span class="bi-player-person">${walker()}${profile ? `<span class="bi-player-avatar">${avatar(profile)}</span>` : ''}</span><span class="bi-player-ferry" aria-hidden="true"><span class="bi-ferry-hull"></span><span class="bi-ferry-cabin"></span><span class="bi-ferry-wake"></span></span><span class="bi-player-label">我</span>`;
  world.append(player);host.replaceChildren(world);
  const ownsDice=!diceHost;
  if(!diceHost){diceHost=doc.createElement('div');diceHost.className='bi-world-dice';host.prepend(diceHost);}
  diceHost.innerHTML=diceMarkup();
  const diceBox=diceHost.querySelector('.bi-3d-dice-box'),diceTotal=diceHost.querySelector('.bi-dice-total'),dice=[...diceHost.querySelectorAll('.bi-3d-die')];
  const sections=[...world.querySelectorAll('.bi-world-island')],timers=new Map(),animations=new Set();
  const main=host.closest('#main');
  let generation=0,destroyed=false,paused=!!doc.hidden,rowsCache=[],selectedHandle='',arrivalHandle='',position=0,currentCategory='food',ringPosition=0,memberPages=new Map(),stationVisits=Object.create(null),playerPoint,worldSize={width:0,height:0},pendingState=null,frameId=null,frameFinish=null,phaseListener=null,phaseDetails=null,phaseValid=null;
  const current=(ticket,valid=()=>true) => !destroyed && !paused && !doc.hidden && ticket===generation && isCurrent() && valid();
  const reduced=()=>view.matchMedia?.('(prefers-reduced-motion:reduce)').matches;
  const offsetOf=element => {const rect=element.getBoundingClientRect(),base=world.getBoundingClientRect();return {x:rect.left-base.left,y:rect.top-base.top,width:rect.width,height:rect.height};};
  const ringPoint=(category,station)=>{const section=sections.find(item=>item.dataset.island===category),rect=offsetOf(section),bank=offsetOf(section.querySelector('.bi-world-members')),[x,y]=RING_STOPS[station];return {x:bank.x+bank.width*x/100-22,y:rect.y+rect.height*y/100-34};};
  const dock=index=>{const rect=offsetOf(sections[index]);return {x:Math.max(0,rect.x+rect.width*.18-22),y:rect.y+rect.height*.91-34};};
  const membersFor=(category,source=rowsCache)=>uniqueRows(source).filter(row=>classifyMember(row)===category).sort((left,right)=>left.handle.localeCompare(right.handle));
  function syncLocation(){
    for(const element of [world,player]){element.dataset.currentCategory=currentCategory;element.dataset.station=String(ringPosition);element.dataset.loopSize=String(LOOP_SIZE);}
    const busy=world.dataset.rolling==='true',afloat=player.dataset.travel==='sailing'||player.dataset.travel==='boarding';
    for(const section of sections){const here=section.dataset.island===currentCategory;section.dataset.current=String(here);const sail=section.querySelector('[data-bi-sail]');sail.disabled=busy||(here&&!afloat);sail.textContent=here&&!afloat?'目前所在島':'搭船前往'+CATEGORIES.find(item=>item.id===section.dataset.island).label;section.querySelector('[data-bi-members-more]').disabled=busy;for(const stop of section.querySelectorAll('.bi-ring-stop'))stop.dataset.current=String(here&&Number(stop.dataset.station)===ringPosition);}
  }
  function measureWorld() {
    const width=world.clientWidth,height=world.clientHeight;
    if(width>0&&height>0){
      if(playerPoint&&worldSize.width>0&&worldSize.height>0&&(width!==worldSize.width||height!==worldSize.height)){playerPoint={x:playerPoint.x/worldSize.width*width,y:playerPoint.y/worldSize.height*height};player.style.transform=transform(playerPoint);}
      worldSize={width,height};
    }
    return worldSize;
  }
  measureWorld();playerPoint=worldSize.width ? ringPoint(currentCategory,ringPosition) : {x:0,y:0};player.style.transform=transform(playerPoint);syncLocation();
  function wait(milliseconds,ticket,valid) {
    if(!current(ticket,valid))return Promise.resolve(false);
    return new Promise(resolve => {const id=view.setTimeout(()=>{timers.delete(id);resolve(current(ticket,valid));},milliseconds);timers.set(id,resolve);});
  }
  function stopMotion() {
    if(frameId!==null){view.cancelAnimationFrame(frameId);frameId=null;}
    if(frameFinish){const finish=frameFinish;frameFinish=null;finish(false);}
    if(animations.size){
      try {const matrix=new view.DOMMatrixReadOnly(view.getComputedStyle(player).transform);playerPoint={x:matrix.m41,y:matrix.m42};player.style.transform=transform(playerPoint);} catch {}
    }
    for(const [id,resolve] of timers){view.clearTimeout(id);resolve(false);}timers.clear();
    for(const animation of animations)animation.cancel();animations.clear();
    dice.forEach(cube=>cube.classList.remove('rolling'));diceBox.dataset.rolling='false';world.dataset.rolling='false';player.dataset.moving='false';
    if(main?.isConnected&&typeof main.scrollTo==='function')main.scrollTo({top:main.scrollTop,behavior:'auto'});
    syncLocation();
  }
  function setPhase(phase,emit=true) {
    const changed=player.dataset.phase!==phase;world.dataset.phase=phase;player.dataset.phase=phase;
    if(phase==='boarding')player.dataset.travel='boarding';
    else if(phase==='sailing'||phase==='docking')player.dataset.travel='sailing';
    else if(phase==='walking'||phase==='arrived')player.dataset.travel='walking';
    if(changed&&emit&&phaseListener&&phaseDetails){try{phaseListener({...phaseDetails,phase});}catch{/* Optional feedback must never stop navigation. */}}
  }
  function cancel() {
    const wasRolling=world.dataset.rolling==='true',notify=wasRolling&&current(generation,phaseValid||(()=>true));
    generation++;stopMotion();if(wasRolling)setPhase('cancelled',notify);phaseListener=null;phaseDetails=null;phaseValid=null;
  }
  function bindPictures() {
    for(const image of world.querySelectorAll('img[data-bi-avatar]:not([data-bound])')){
      image.dataset.bound='';const initial=image.previousElementSibling;
      const loaded=()=>{if(initial)initial.hidden=true;image.hidden=false;};
      const failed=()=>{if(initial)initial.hidden=false;image.remove();};
      image.addEventListener('load',loaded,{once:true});image.addEventListener('error',failed,{once:true});
      if(image.complete){if(image.naturalWidth>0)loaded();else failed();}
    }
  }
  bindPictures();
  function paintMembers(ensure='') {
    for(const section of sections){
      const category=section.dataset.island,group=membersFor(category),pages=Math.max(1,Math.ceil(group.length/LOOP_SIZE));
      let page=Math.min(memberPages.get(category)||0,pages-1);
      const ensuredIndex=ensure ? group.findIndex(row=>row.handle===ensure) : -1;if(ensuredIndex>=0)page=Math.floor(ensuredIndex/LOOP_SIZE);
      memberPages.set(category,page);
      section.querySelector('.bi-world-members').innerHTML=group.slice(page*LOOP_SIZE,(page+1)*LOOP_SIZE).map((row,index)=>{const station=index,[x,y]=RING_STOPS[station];return `<button type="button" class="bi-pin" data-bi-member="${esc(row.handle)}" data-station="${station}" style="left:${x}%;top:${y}%" aria-label="查看公開會員 ${esc(row.name||'會員')}" aria-pressed="${row.handle===selectedHandle}">${avatar(row)}<span>${esc(row.name||'會員')}</span></button>`;}).join('');
      section.dataset.memberCount=String(group.length);section.dataset.page=String(page+1);section.dataset.pages=String(pages);
      section.querySelector('.bi-island-member-summary').textContent=group.length ? `${group.length} 位公開會員 · 第 ${page+1} / ${pages} 批` : '目前沒有公開會員，仍可繞島探索。';
      section.querySelector('[data-bi-members-more]').hidden=pages<=1;
    }
    bindPictures();syncLocation();
  }
  function renderMembers(rows,{selected=''}={}) {
    if(destroyed)return;
    measureWorld();const changed=selectedHandle!==clean(selected);rowsCache=uniqueRows(rows);selectedHandle=clean(selected);
    if(arrivalHandle&&!rowsCache.some(row=>row.handle===arrivalHandle))clearArrival();
    paintMembers(changed?selectedHandle:'');
  }
  function clearArrival() {
    world.querySelectorAll('.bi-world-arrival').forEach(element=>element.remove());arrivalHandle='';
  }
  function showArrival(handle) {
    if(destroyed||paused||!isCurrent())return false;
    const row=rowsCache.find(item=>item.handle===handle);if(!row)return false;
    clearArrival();arrivalHandle=row.handle;selectedHandle=row.handle;paintMembers(row.handle);
    const section=sections.find(element=>element.dataset.island===classifyMember(row));
    const aside=doc.createElement('aside');aside.className='bi-world-arrival';aside.setAttribute('aria-label','目前遇見的會員');aside.dataset.station=String(membersFor(classifyMember(row)).findIndex(item=>item.handle===handle)%LOOP_SIZE);
    aside.innerHTML=`${avatar(row)}<div class="bi-world-arrival-copy"><h4>${esc(row.name||'會員')}</h4><p>${esc([row.company,row.title].filter(Boolean).join(' · '))}</p></div><div class="bi-world-arrival-actions"><button type="button" data-bi-action="card" data-bi-handle="${esc(row.handle)}">查看公開名片</button><button type="button" data-bi-action="chat" data-bi-handle="${esc(row.handle)}"${row.canChat===false ? ' disabled' : ''}>${row.canChat===false ? '未開放新聯絡' : '開始交流'}</button></div>`;
    section.insertBefore(aside,section.querySelector('.bi-pool'));bindPictures();return true;
  }
  function showEmptyArrival(category,station){
    clearArrival();const section=sections.find(item=>item.dataset.island===category),aside=doc.createElement('aside');aside.className='bi-world-arrival';aside.dataset.empty='true';aside.dataset.station=String(station);aside.setAttribute('aria-label','環島停站');aside.innerHTML=`<div class="bi-world-arrival-copy"><h4>第 ${station+1} 站</h4><p>這一站目前沒有公開會員，繼續繞島或點選其他公開會員交流。</p></div>`;section.insertBefore(aside,section.querySelector('.bi-pool'));
  }
  function snapshot() {
    if(pendingState)return {...pendingState,point:{...pendingState.point},pages:{...pendingState.pages},visits:{...pendingState.visits}};
    const {width:measuredWidth,height:measuredHeight}=measureWorld(),width=measuredWidth||1,height=measuredHeight||1;
    return {position,currentCategory,ringPosition,pages:Object.fromEntries(memberPages),visits:{...stationVisits},dice1:Number(dice[0].dataset.value),dice2:Number(dice[1].dataset.value),step:Number(player.dataset.step)||0,total:Number(player.dataset.total)||0,targetHandle:player.dataset.target||'',point:{x:Math.max(0,Math.min(1,playerPoint.x/width)),y:Math.max(0,Math.min(1,playerPoint.y/height))},travel:player.dataset.travel||'walking',direction:player.dataset.direction||'south',phase:player.dataset.phase||'idle',fromCategory:player.dataset.fromCategory||'food',category:player.dataset.category||'food',duration:Number(player.dataset.duration)||0,distance:Number(player.dataset.distance)||0,speed:Number(player.dataset.speed)||0};
  }
  function restore(state) {
    if(destroyed||!state||typeof state!=='object'||!isCurrent())return false;
    const {dice1,dice2,step,total,targetHandle,point}=state;
    const inferredIndex=Number.isFinite(point?.y)?Math.max(0,Math.min(CATEGORIES.length-1,Math.floor(point.y*CATEGORIES.length))):0,savedCategory=state.currentCategory??CATEGORIES[inferredIndex].id;
    let nearestStation=0,bestDistance=Infinity;
    if(Number.isFinite(point?.x)&&Number.isFinite(point?.y)&&CATEGORIES.some(item=>item.id===savedCategory)){for(let station=0;station<LOOP_SIZE;station++){const candidate=world.clientWidth>0&&world.clientHeight>0?ringPoint(savedCategory,station):{x:RING_STOPS[station][0]/100,y:(CATEGORIES.findIndex(item=>item.id===savedCategory)+RING_STOPS[station][1]/100)/CATEGORIES.length},actual=world.clientWidth>0&&world.clientHeight>0?{x:point.x*world.clientWidth,y:point.y*world.clientHeight}:point,delta=distance(candidate,actual);if(delta<bestDistance){bestDistance=delta;nearestStation=station;}}}
    const savedStation=state.ringPosition??nearestStation,pages=state.pages??{},visits=state.visits??{};
    const travel=state.travel??'walking',direction=state.direction??'south',phase=state.phase??'idle',fromCategory=state.fromCategory??'food',category=state.category??'food',duration=state.duration??0,routeDistance=state.distance??0,speed=state.speed??0;
    if(!CATEGORIES.some(item=>item.id===savedCategory)||!Number.isInteger(savedStation)||savedStation<0||savedStation>=LOOP_SIZE||!pages||typeof pages!=='object'||Array.isArray(pages)||Object.entries(pages).some(([key,value])=>!CATEGORIES.some(item=>item.id===key)||!Number.isSafeInteger(value)||value<0)||!visits||typeof visits!=='object'||Array.isArray(visits)||Object.keys(visits).length>84||Object.entries(visits).some(([key,value])=>!CATEGORIES.some(item=>key.startsWith(item.id+':')&&/^\d+$/.test(key.slice(item.id.length+1))&&Number(key.slice(item.id.length+1))<LOOP_SIZE)||!Number.isSafeInteger(value)||value<0)||!Number.isSafeInteger(state.position)||state.position<0||![dice1,dice2].every(value=>Number.isInteger(value)&&value>=1&&value<=6)||!Number.isInteger(total)||total<0||total>12||!Number.isInteger(step)||step<0||step>total||typeof targetHandle!=='string'||targetHandle.length>180||!point||![point.x,point.y].every(value=>Number.isFinite(value)&&value>=0&&value<=1)||!['walking','boarding','sailing','stopped'].includes(travel)||!['north','south'].includes(direction)||!['idle','dice','boarding','sailing','docking','walking','arrived','cancelled'].includes(phase)||![fromCategory,category].every(id=>CATEGORIES.some(item=>item.id===id))||![duration,routeDistance,speed].every(value=>Number.isFinite(value)&&value>=0)||duration>300000||routeDistance>100000||speed>1000)return false;
    cancel();position=state.position;currentCategory=savedCategory;ringPosition=savedStation;memberPages=new Map(Object.entries(pages));stationVisits=Object.assign(Object.create(null),visits);measureWorld();
    dice.forEach((cube,index)=>{const value=index ? dice2 : dice1;cube.dataset.value=String(value);cube.style.transform=DICE_ROTATIONS[value];});
    diceBox.dataset.dice1=String(dice1);diceBox.dataset.dice2=String(dice2);diceBox.dataset.total=String(dice1+dice2);diceBox.setAttribute('aria-label',`${dice1} 加 ${dice2} 等於 ${dice1+dice2} 點`);diceTotal.textContent=`${dice1} + ${dice2} = ${dice1+dice2} 點`;
    player.dataset.step=String(step);player.dataset.total=String(total);player.dataset.target=targetHandle;player.dataset.travel=travel;player.dataset.direction=direction;player.dataset.phase=phase;player.dataset.fromCategory=fromCategory;player.dataset.category=category;world.dataset.phase=phase;
    for(const [key,value] of Object.entries({duration,distance:routeDistance,speed})){player.dataset[key]=String(value);world.dataset[key]=String(value);}
    if(rowsCache.some(row=>row.handle===targetHandle))paintMembers(targetHandle);syncLocation();
    if(world.clientWidth<=0||world.clientHeight<=0){pendingState={position:state.position,currentCategory,ringPosition,pages:{...pages},visits:{...visits},dice1,dice2,step,total,targetHandle,point:{x:point.x,y:point.y},travel,direction,phase,fromCategory,category,duration,distance:routeDistance,speed};return true;}
    pendingState=null;
    playerPoint={x:Math.max(0,Math.min(Math.max(0,world.clientWidth-44),point.x*world.clientWidth)),y:Math.max(0,Math.min(Math.max(0,world.clientHeight-68),point.y*world.clientHeight))};
    player.style.transform=transform(playerPoint);syncLocation();return true;
  }
  // One camera update per animation frame; it follows the actual interpolated vessel,
  // never a future step endpoint. A bounded catch-up prevents an initial camera jump.
  function follow(point,frameMilliseconds=16,instant=false) {
    if(!main||!main.isConnected)return;
    const worldTop=world.getBoundingClientRect().top-main.getBoundingClientRect().top+main.scrollTop;
    const desired=Math.max(0,Math.min(main.scrollHeight-main.clientHeight,worldTop+point.y-main.clientHeight*.43));
    const delta=desired-main.scrollTop,limit=500*Math.min(64,Math.max(0,frameMilliseconds))/1000;
    const top=instant ? desired : main.scrollTop+Math.sign(delta)*Math.min(Math.abs(delta),limit);
    main.scrollTo({top,behavior:'auto'});
  }
  function islandAt(point) {
    const centerY=point.y+34;
    const found=sections.findIndex(section=>{const rect=offsetOf(section);return centerY>=rect.y&&centerY<rect.y+rect.height;});
    return found>=0 ? found : Math.max(0,Math.min(sections.length-1,Math.floor(centerY/(world.clientHeight/sections.length||1))));
  }
  function voyageRoute(targetPoint,targetCategory) {
    const fromIndex=islandAt(playerPoint),targetIndex=CATEGORIES.findIndex(item=>item.id===targetCategory);
    const alreadyAfloat=player.dataset.travel==='sailing'||player.dataset.travel==='boarding';
    const crossIsland=fromIndex!==targetIndex||alreadyAfloat;
    const points=[{...playerPoint,phase:alreadyAfloat ? 'sailing' : 'walking'}];
    if(crossIsland){
      const departure=dock(fromIndex),arrival=dock(targetIndex),channelX=Math.max(24,world.clientWidth*.09-22);
      if(!alreadyAfloat){points.push({...departure,phase:'walking'},{x:channelX,y:departure.y,phase:'boarding'});}
      else points.push({x:channelX,y:playerPoint.y,phase:'sailing'});
      points.push({x:channelX,y:arrival.y,phase:'sailing'},{...arrival,phase:'docking'},{...targetPoint,phase:'walking'});
    }else{
      if(distance(playerPoint,targetPoint)<70)points.push({x:Math.min(world.clientWidth-44,Math.max(0,targetPoint.x+80)),y:Math.max(0,targetPoint.y-65),phase:'walking'});
      points.push({...targetPoint,phase:'walking'});
    }
    return {...routeMetrics(points),crossIsland,fromCategory:CATEGORIES[fromIndex].id};
  }
  function animateVoyage(route,duration,total,ticket,valid,onStep,stepInfo,onCompleteStep=()=>{}) {
    return new Promise(resolve=>{
      let started=null,previousFrame=null,lastStep=0,settled=false;
      const finish=okay=>{if(settled)return;settled=true;if(frameId!==null)view.cancelAnimationFrame(frameId);frameId=null;frameFinish=null;resolve(okay);};
      frameFinish=finish;
      const frame=now=>{
        frameId=null;
        if(!current(ticket,valid)){finish(false);return;}
        if(started===null)started=now;
        const elapsed=Math.min(duration,Math.max(0,now-started)),progress=Math.min(1,elapsed/duration),frameMilliseconds=previousFrame===null ? 0 : now-previousFrame;
        let completed=Math.min(total,Math.floor(progress*total+1e-8)),point;
        if(route.stopTimes){completed=route.stopTimes.filter(time=>time<=elapsed+1e-6).length;const segment=Math.min(completed,total-1),before=route.points[segment],after=route.points[segment+1],startTime=segment?route.stopTimes[segment-1]:0,ratio=Math.min(1,(elapsed-startTime)/(route.stopTimes[segment]-startTime||1));point={x:before.x+(after.x-before.x)*ratio,y:before.y+(after.y-before.y)*ratio,phase:'walking'};}
        else point=pointAt(route,route.length*progress);
        previousFrame=now;playerPoint={x:point.x,y:point.y};player.style.transform=transform(playerPoint);player.dataset.progress=progress.toFixed(5);setPhase(point.phase||'walking');
        if(!current(ticket,valid)){finish(false);return;}
        follow(playerPoint,frameMilliseconds);
        while(lastStep<completed){if(!current(ticket,valid)){finish(false);return;}lastStep++;onCompleteStep(lastStep);player.dataset.step=String(lastStep);onStep(stepInfo(lastStep));}
        if(!current(ticket,valid)){finish(false);return;}
        if(progress>=1)finish(true);else frameId=view.requestAnimationFrame(frame);
      };
      frameId=view.requestAnimationFrame(frame);
    });
  }
  function journeyInfo(info,onPhase,valid){
    phaseListener=onPhase;phaseDetails=info;phaseValid=valid;
    for(const [key,value] of Object.entries({duration:info.duration.toFixed(2),distance:info.distance.toFixed(2),speed:info.speed.toFixed(2),mode:info.mode})){player.dataset[key]=String(value);world.dataset[key]=String(value);}
    player.dataset.fromCategory=info.fromCategory;player.dataset.category=info.category;world.dataset.rolling='true';player.dataset.step='0';player.dataset.total=String(info.total);player.dataset.progress='0';syncLocation();
  }
  function finishJourney(ticket){
    if(ticket===generation){if(player.dataset.phase!=='arrived')setPhase('cancelled',false);world.dataset.rolling='false';player.dataset.moving='false';diceBox.dataset.rolling='false';dice.forEach(cube=>cube.classList.remove('rolling'));phaseListener=null;phaseDetails=null;phaseValid=null;syncLocation();}
  }
  function prepareJourney(valid){
    if(destroyed||paused||doc.hidden||world.dataset.rolling==='true'||!isCurrent()||!valid()||world.clientWidth<=0||world.clientHeight<=0)return false;
    measureWorld();if(pendingState){const saved=pendingState;pendingState=null;if(!restore(saved))return false;}return true;
  }
  async function roll({dice1,dice2,rows,valid=()=>true,onStep=()=>{},onPhase=()=>{}}={}) {
    if(!Number.isInteger(dice1)||dice1<1||dice1>6||!Number.isInteger(dice2)||dice2<1||dice2>6)throw Error('骰子點數必須介於1至6');
    if(!prepareJourney(valid))return null;
    if(player.dataset.travel==='sailing'||player.dataset.travel==='boarding')throw Error('目前停在航道，請先明確搭船靠岸後再擲骰。');
    clearArrival();cancel();const ticket=generation,total=dice1+dice2,category=currentCategory,startStation=ringPosition,stations=Array.from({length:total},(_,step)=>(startStation+step+1)%LOOP_SIZE);
    const group=membersFor(category),allowed=new Set(uniqueRows(rows===undefined?rowsCache:rows).map(row=>row.handle)),station=stations.at(-1),candidates=group.filter((row,index)=>index%LOOP_SIZE===station&&allowed.has(row.handle)),visitKey=category+':'+station,visit=stationVisits[visitKey]||0,target=candidates[visit%candidates.length];
    const points=[{...playerPoint,phase:'walking'},...stations.map(index=>({...ringPoint(category,index),phase:'walking'}))],route=routeMetrics(points);let duration=0;
    route.stopTimes=points.slice(1).map((point,index)=>{duration+=Math.max(650,distance(points[index],point)/180*1000);return duration;});
    const info={mode:'walk',total,dice1,dice2,handle:target?.handle||'',category,fromCategory:category,duration,distance:route.length,speed:route.length/duration*1000,loopSize:LOOP_SIZE,station},stepInfo=step=>({...info,step,station:ringPosition});
    journeyInfo(info,onPhase,valid);player.dataset.target=target?.handle||'';diceBox.dataset.rolling='true';diceBox.dataset.dice1=String(dice1);diceBox.dataset.dice2=String(dice2);diceBox.dataset.total=String(total);diceTotal.textContent='擲骰中…';setPhase('dice');
    const completeStep=step=>{ringPosition=stations[step-1];position++;syncLocation();};
    try {
      if(!current(ticket,valid))return null;
      dice.forEach(cube=>{cube.style.transition='none';cube.style.transform=DICE_ROTATIONS[1];cube.dataset.value='1';void cube.offsetWidth;cube.classList.add('rolling');});
      if(!reduced()&&!await wait(1100,ticket,valid))return null;
      if(!current(ticket,valid))return null;
      dice.forEach((cube,index)=>{const value=index?dice2:dice1;cube.classList.remove('rolling');cube.dataset.value=String(value);cube.style.transform=DICE_ROTATIONS[value];});diceBox.dataset.rolling='false';diceBox.setAttribute('aria-label',`${dice1} 加 ${dice2} 等於 ${total} 點`);diceTotal.textContent=`${dice1} + ${dice2} = ${total} 點`;
      player.dataset.moving='true';setPhase('walking');onStep(stepInfo(0));
      if(reduced()){
        playerPoint=points.at(-1);player.style.transform=transform(playerPoint);player.dataset.progress='1';follow(playerPoint,0,true);for(let step=1;step<=total;step++){if(!current(ticket,valid))return null;completeStep(step);player.dataset.step=String(step);onStep(stepInfo(step));}
      }else if(!await animateVoyage(route,duration,total,ticket,valid,onStep,stepInfo,completeStep))return null;
      if(!current(ticket,valid))return null;
      if(target){stationVisits[visitKey]=visit+1;selectedHandle=target.handle;paintMembers(target.handle);}else{selectedHandle='';paintMembers();showEmptyArrival(category,station);}
      setPhase('arrived');return {...info,handle:target?.handle||'',empty:!target,steps:total,position,ringPosition,currentCategory};
    }finally{finishJourney(ticket);}
  }
  async function sailTo(category,{valid=()=>true,onPhase=()=>{},onStep=()=>{}}={}){
    if(!CATEGORIES.some(item=>item.id===category))throw Error('請選擇有效的目的島嶼');
    if(!prepareJourney(valid))return null;
    const afloat=player.dataset.travel==='sailing'||player.dataset.travel==='boarding';
    if(category===currentCategory&&!afloat)return {mode:'sail',category,currentCategory,ringPosition,noop:true,total:0,steps:0,duration:0,distance:0,speed:0};
    clearArrival();cancel();const ticket=generation,targetPoint=ringPoint(category,0),route=voyageRoute(targetPoint,category),total=Math.max(1,Math.abs(CATEGORIES.findIndex(item=>item.id===category)-CATEGORIES.findIndex(item=>item.id===route.fromCategory))),targetSpeed=world.clientWidth>700?240:200,duration=Math.max(1300,route.length/targetSpeed*1000),info={mode:'sail',handle:'',category,fromCategory:currentCategory,total,duration,distance:route.length,speed:route.length/duration*1000},stepInfo=step=>({...info,step});
    journeyInfo(info,onPhase,valid);player.dataset.target='';player.dataset.direction=targetPoint.y>=playerPoint.y?'south':'north';player.dataset.targetSpeed=String(targetSpeed);world.dataset.targetSpeed=String(targetSpeed);player.dataset.moving='true';setPhase(route.points[0].phase||'walking');onStep(stepInfo(0));
    try {
      if(reduced()){
        if(!current(ticket,valid))return null;playerPoint=targetPoint;player.style.transform=transform(playerPoint);player.dataset.step=String(total);player.dataset.progress='1';follow(playerPoint,0,true);onStep(stepInfo(total));
      }else if(!await animateVoyage(route,duration,total,ticket,valid,onStep,stepInfo))return null;
      if(!current(ticket,valid))return null;currentCategory=category;ringPosition=0;syncLocation();setPhase('arrived');
      return {...info,steps:total,currentCategory,ringPosition};
    }finally{finishJourney(ticket);}
  }
  const click=event=>{
    const button=event.target.closest('button');if(!button||!world.contains(button)||destroyed||paused||!isCurrent())return;
    if(button.dataset.biSail){event.stopPropagation();if(world.dataset.rolling!=='true')onSail?.(button.dataset.biSail);}
    else if(button.dataset.biMembersMore){event.stopPropagation();if(world.dataset.rolling==='true')return;const category=button.dataset.biMembersMore,pages=Math.max(1,Math.ceil(membersFor(category).length/LOOP_SIZE));memberPages.set(category,((memberPages.get(category)||0)+1)%pages);clearArrival();paintMembers();}
    else if(button.dataset.biMember){event.stopPropagation();onMember?.(button.dataset.biMember);}
    else if(button.dataset.category){event.stopPropagation();onCategory?.(button.dataset.category);}
  };
  world.addEventListener('click',click);
  const observer=typeof view.IntersectionObserver==='function' ? new view.IntersectionObserver(entries=>{for(const entry of entries)entry.target.dataset.visible=String(entry.isIntersecting&&!paused&&!destroyed);},{root:main||null,rootMargin:'100px 0px',threshold:0}) : null;
  if(observer)sections.forEach(section=>observer.observe(section));else sections.forEach(section=>section.dataset.visible='true');
  function pause(value) {
    if(destroyed)return;paused=!!value;world.dataset.paused=String(paused);
    if(paused)cancel();
    else {measureWorld();if(pendingState&&world.clientWidth>0&&world.clientHeight>0){const saved=pendingState;pendingState=null;restore(saved);}const viewport=main?.getBoundingClientRect()||{top:0,bottom:view.innerHeight};for(const section of sections){const rect=section.getBoundingClientRect();section.dataset.visible=String(rect.bottom>=viewport.top-100&&rect.top<=viewport.bottom+100);}}
  }
  const visibility=()=>pause(doc.hidden);doc.addEventListener('visibilitychange',visibility);
  const resize=()=>{if(world.dataset.rolling==='true')cancel();measureWorld();};view.addEventListener('resize',resize);
  function destroy() {if(destroyed)return;clearArrival();cancel();destroyed=true;observer?.disconnect();doc.removeEventListener('visibilitychange',visibility);view.removeEventListener('resize',resize);world.removeEventListener('click',click);world.remove();if(ownsDice)diceHost.remove();else diceHost.replaceChildren();}
  return {renderMembers,showArrival,clearArrival,snapshot,restore,roll,sailTo,currentIsland:()=>currentCategory,cancel,destroy,pause,categories:CATEGORIES};
}
