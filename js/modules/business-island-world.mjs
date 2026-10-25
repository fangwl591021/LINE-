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

// Classification uses only the company/title strings already visible in the directory.
// It is presentation, never a membership, privacy, or industry-permission decision.
export function classifyMember(row = {}) {
  const summary = [clean(row.company),clean(row.title)].join(' ').toLowerCase();
  if (/餐飲|餐廳|餐館|料理|飲食|食品|咖啡|烘焙|麵包|甜點|茶飲|便當|早餐|food|cafe|café|coffee|restaurant|bakery/.test(summary)) return 'food';
  if (/旅宿|旅館|飯店|酒店|民宿|住宿|度假|hotel|hostel|lodging|resort|inn\b/.test(summary)) return 'lodging';
  if (/休閒|遊樂|旅遊|旅行|觀光|運動|健身|娛樂|戶外|露營|樂園|leisure|travel|tourism|sport|fitness/.test(summary)) return 'leisure';
  if (/製造|工業|工廠|機械|金屬|半導體|塑膠|紡織|生產|加工|manufactur|factory|industrial/.test(summary)) return 'manufacturing';
  if (/交通|運輸|物流|貨運|汽車|機車|租車|計程車|車業|航運|航空|快遞|transport|logistic|automotive|mobility/.test(summary)) return 'mobility';
  if (/零售|商店|電商|商行|百貨|超市|購物|批發|買賣|服飾|retail|shop|e-commerce|commerce|boutique/.test(summary)) return 'shopping';
  return 'services';
}

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
const randomIndex = (view, size) => {
  if (size <= 1) return 0;
  const value = new Uint32Array(1); view.crypto.getRandomValues(value);
  return Math.floor(value[0] / 4294967296 * size);
};
const shuffled = (view, rows) => {
  const copy = rows.slice();
  for (let index = copy.length-1; index > 0; index--) { const other=randomIndex(view,index+1);[copy[index],copy[other]]=[copy[other],copy[index]]; }
  return copy;
};
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
    return {x:before.x+(after.x-before.x)*ratio,y:before.y+(after.y-before.y)*ratio};
  }
  return points.at(-1);
}
const transform = point => `translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0)`;

export function createIslandWorld({host,asset,avatar,onMember,onCategory,isCurrent=()=>true,diceHost,profile} = {}) {
  if (!host?.ownerDocument || typeof asset !== 'function' || typeof avatar !== 'function') throw Error('交流島場景缺少必要設定');
  const doc=host.ownerDocument,view=doc.defaultView;
  const world=doc.createElement('div');world.className='bi-world';world.dataset.rolling='false';world.dataset.paused=String(!!doc.hidden);
  world.innerHTML=CATEGORIES.map((category,index) => `<section class="bi-world-island" data-island="${category.id}" data-visible="false" style="--bi-island-index:${index}" aria-labelledby="bi-world-${category.id}-title"><h3 class="bi-world-title" id="bi-world-${category.id}-title"><button type="button" class="bi-world-category" data-category="${category.id}">${esc(category.label)}</button></h3><p class="bi-world-caption">${esc(category.caption)}</p><img class="bi-world-art" src="${esc(asset(`assets/business-island/${category.id}-v1.webp`))}" alt="${esc(category.label)}的立體島嶼場景" loading="${index ? 'lazy' : 'eager'}" decoding="async"><div class="bi-world-members"></div><span class="bi-pool" aria-hidden="true"><span class="bi-pool-water"></span><span class="bi-swimmer"></span><span class="bi-swimmer"></span><span class="bi-pool-ripple"></span><span class="bi-pool-ripple"></span></span><span class="bi-world-boat" aria-hidden="true"><span class="bi-boat-hull"></span><span class="bi-boat-cabin"></span><span class="bi-boat-wake"></span></span>${[0,1,2].map((_,person) => `<span class="bi-walker" style="--bi-walker-index:${person}" aria-hidden="true">${walker()}</span>`).join('')}</section>`).join('');
  const player=doc.createElement('span');player.className='bi-world-player';player.dataset.moving='false';player.dataset.step='0';player.dataset.total='0';player.setAttribute('aria-label','我的探索位置');
  player.innerHTML=`<span class="bi-player-shadow"></span><span class="bi-player-person">${walker()}${profile ? `<span class="bi-player-avatar">${avatar(profile)}</span>` : ''}</span><span class="bi-player-label">我</span>`;
  world.append(player);host.replaceChildren(world);
  const ownsDice=!diceHost;
  if(!diceHost){diceHost=doc.createElement('div');diceHost.className='bi-world-dice';host.prepend(diceHost);}
  diceHost.innerHTML=diceMarkup();
  const diceBox=diceHost.querySelector('.bi-3d-dice-box'),diceTotal=diceHost.querySelector('.bi-dice-total'),dice=[...diceHost.querySelectorAll('.bi-3d-die')];
  const sections=[...world.querySelectorAll('.bi-world-island')],timers=new Map(),animations=new Set();
  const main=host.closest('#main');
  let generation=0,destroyed=false,paused=!!doc.hidden,rowsCache=[],selectedHandle='',arrivalHandle='',position=0,playerPoint,worldSize={width:0,height:0},pendingState=null;
  const current=(ticket,valid=()=>true) => !destroyed && !paused && !doc.hidden && ticket===generation && isCurrent() && valid();
  const reduced=()=>view.matchMedia?.('(prefers-reduced-motion:reduce)').matches;
  const offsetOf=element => {const rect=element.getBoundingClientRect(),base=world.getBoundingClientRect();return {x:rect.left-base.left,y:rect.top-base.top,width:rect.width,height:rect.height};};
  const dock=index => {const rect=offsetOf(sections[index]);return {x:Math.max(0,rect.x+rect.width*(index%2 ? .82 : .18)-22),y:rect.y+rect.height*.84-34};};
  function measureWorld() {
    const width=world.clientWidth,height=world.clientHeight;
    if(width>0&&height>0){
      if(playerPoint&&worldSize.width>0&&worldSize.height>0&&(width!==worldSize.width||height!==worldSize.height)){playerPoint={x:playerPoint.x/worldSize.width*width,y:playerPoint.y/worldSize.height*height};player.style.transform=transform(playerPoint);}
      worldSize={width,height};
    }
    return worldSize;
  }
  measureWorld();playerPoint=worldSize.width ? dock(0) : {x:0,y:0};player.style.transform=transform(playerPoint);
  function wait(milliseconds,ticket,valid) {
    if(!current(ticket,valid))return Promise.resolve(false);
    return new Promise(resolve => {const id=view.setTimeout(()=>{timers.delete(id);resolve(current(ticket,valid));},milliseconds);timers.set(id,resolve);});
  }
  function stopMotion() {
    if(animations.size){
      try {const matrix=new view.DOMMatrixReadOnly(view.getComputedStyle(player).transform);playerPoint={x:matrix.m41,y:matrix.m42};player.style.transform=transform(playerPoint);} catch {}
    }
    for(const [id,resolve] of timers){view.clearTimeout(id);resolve(false);}timers.clear();
    for(const animation of animations)animation.cancel();animations.clear();
    dice.forEach(cube=>cube.classList.remove('rolling'));diceBox.dataset.rolling='false';world.dataset.rolling='false';player.dataset.moving='false';
    if(main?.isConnected&&typeof main.scrollTo==='function')main.scrollTo({top:main.scrollTop,behavior:'auto'});
  }
  function cancel() {generation++;stopMotion();}
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
      const category=section.dataset.island;
      const group=rowsCache.filter(row=>classifyMember(row)===category);
      const chosen=[...group.filter(row=>row.handle===ensure),...group.filter(row=>row.handle===selectedHandle&&row.handle!==ensure)];
      const visible=[...chosen,...group.filter(row=>!chosen.includes(row))].slice(0,6);
      section.querySelector('.bi-world-members').innerHTML=visible.map((row,index)=>`<button type="button" class="bi-pin" data-bi-member="${esc(row.handle)}" style="left:${[22,50,78][index%3]}%;top:${index<3 ? 55 : 78}%" aria-label="查看會員 ${esc(row.name||'會員')}" aria-pressed="${row.handle===selectedHandle}">${avatar(row)}<span>${esc(row.name||'會員')}</span></button>`).join('');
      section.dataset.memberCount=String(group.length);
    }
    bindPictures();
  }
  function renderMembers(rows,{selected=''}={}) {
    if(destroyed)return;
    measureWorld();rowsCache=uniqueRows(rows);selectedHandle=clean(selected);
    if(arrivalHandle&&!rowsCache.some(row=>row.handle===arrivalHandle))clearArrival();
    paintMembers();
  }
  function clearArrival() {
    world.querySelectorAll('.bi-world-arrival').forEach(element=>element.remove());arrivalHandle='';
  }
  function showArrival(handle) {
    if(destroyed||paused||!isCurrent())return false;
    const row=rowsCache.find(item=>item.handle===handle);if(!row)return false;
    clearArrival();arrivalHandle=row.handle;selectedHandle=row.handle;paintMembers(row.handle);
    const section=sections.find(element=>element.dataset.island===classifyMember(row));
    const aside=doc.createElement('aside');aside.className='bi-world-arrival';aside.setAttribute('aria-label','目前遇見的會員');
    aside.innerHTML=`${avatar(row)}<div class="bi-world-arrival-copy"><h4>${esc(row.name||'會員')}</h4><p>${esc([row.company,row.title].filter(Boolean).join(' · '))}</p></div><div class="bi-world-arrival-actions"><button type="button" data-bi-action="card" data-bi-handle="${esc(row.handle)}">查看公開名片</button><button type="button" data-bi-action="chat" data-bi-handle="${esc(row.handle)}">開始交流</button></div>`;
    section.insertBefore(aside,section.querySelector('.bi-pool'));bindPictures();return true;
  }
  function snapshot() {
    if(pendingState)return {...pendingState,point:{...pendingState.point}};
    const {width:measuredWidth,height:measuredHeight}=measureWorld(),width=measuredWidth||1,height=measuredHeight||1;
    return {position,dice1:Number(dice[0].dataset.value),dice2:Number(dice[1].dataset.value),step:Number(player.dataset.step)||0,total:Number(player.dataset.total)||0,targetHandle:player.dataset.target||'',point:{x:Math.max(0,Math.min(1,playerPoint.x/width)),y:Math.max(0,Math.min(1,playerPoint.y/height))}};
  }
  function restore(state) {
    if(destroyed||!state||typeof state!=='object'||!isCurrent())return false;
    const {dice1,dice2,step,total,targetHandle,point}=state;
    if(!Number.isSafeInteger(state.position)||state.position<0||![dice1,dice2].every(value=>Number.isInteger(value)&&value>=1&&value<=6)||!Number.isInteger(total)||total<0||total>12||!Number.isInteger(step)||step<0||step>total||typeof targetHandle!=='string'||targetHandle.length>180||!point||![point.x,point.y].every(value=>Number.isFinite(value)&&value>=0&&value<=1))return false;
    cancel();position=state.position;measureWorld();
    dice.forEach((cube,index)=>{const value=index ? dice2 : dice1;cube.dataset.value=String(value);cube.style.transform=DICE_ROTATIONS[value];});
    diceBox.dataset.dice1=String(dice1);diceBox.dataset.dice2=String(dice2);diceBox.dataset.total=String(dice1+dice2);diceBox.setAttribute('aria-label',`${dice1} 加 ${dice2} 等於 ${dice1+dice2} 點`);diceTotal.textContent=`${dice1} + ${dice2} = ${dice1+dice2} 點`;
    player.dataset.step=String(step);player.dataset.total=String(total);player.dataset.target=targetHandle;
    if(rowsCache.some(row=>row.handle===targetHandle))paintMembers(targetHandle);
    if(world.clientWidth<=0||world.clientHeight<=0){pendingState={position:state.position,dice1,dice2,step,total,targetHandle,point:{x:point.x,y:point.y}};return true;}
    pendingState=null;
    playerPoint={x:Math.max(0,Math.min(Math.max(0,world.clientWidth-44),point.x*world.clientWidth)),y:Math.max(0,Math.min(Math.max(0,world.clientHeight-68),point.y*world.clientHeight))};
    player.style.transform=transform(playerPoint);return true;
  }
  function follow(point,instant=false) {
    if(!main||!main.isConnected)return;
    const worldTop=world.getBoundingClientRect().top-main.getBoundingClientRect().top+main.scrollTop;
    const top=Math.max(0,Math.min(main.scrollHeight-main.clientHeight,worldTop+point.y-main.clientHeight*.43));
    main.scrollTo({top,behavior:instant ? 'auto' : 'smooth'});
  }
  function routeTo(targetPoint) {
    const points=[playerPoint],forward=targetPoint.y>=playerPoint.y;
    const between=sections.map((_,index)=>dock(index)).filter(point=>forward ? point.y>playerPoint.y+1&&point.y<targetPoint.y-1 : point.y<playerPoint.y-1&&point.y>targetPoint.y+1).sort((a,b)=>forward ? a.y-b.y : b.y-a.y);
    points.push(...between);
    if(distance(playerPoint,targetPoint)<70)points.push({x:Math.min(world.clientWidth-44,Math.max(0,targetPoint.x+80)),y:Math.max(0,targetPoint.y-65)});
    points.push(targetPoint);return routeMetrics(points);
  }
  async function roll({dice1,dice2,rows,lastHandle='',valid=()=>true,onStep=()=>{}}={}) {
    if(!Number.isInteger(dice1)||dice1<1||dice1>6||!Number.isInteger(dice2)||dice2<1||dice2>6)throw Error('骰子點數必須介於1至6');
    if(destroyed||paused||doc.hidden||!isCurrent()||!valid())return null;
    const pool=uniqueRows(rows),candidates=pool.length>1 ? pool.filter(row=>row.handle!==lastHandle) : pool;
    if(!candidates.length)return null;
    if(world.clientWidth<=0||world.clientHeight<=0)return null;
    measureWorld();if(pendingState){const saved=pendingState;pendingState=null;if(!restore(saved))return null;}
    clearArrival();cancel();const ticket=generation,total=dice1+dice2,deck=shuffled(view,candidates),target=deck[(position+total)%deck.length];
    if(!rowsCache.some(row=>row.handle===target.handle))rowsCache.push(target);
    paintMembers(target.handle);
    const pin=[...world.querySelectorAll('.bi-pin')].find(element=>element.dataset.biMember===target.handle);
    if(!pin)return null;
    const pinRect=offsetOf(pin),targetPoint={x:Math.max(0,Math.min(world.clientWidth-44,pinRect.x+pinRect.width/2-44)),y:Math.max(0,pinRect.y+pinRect.height/2-34)};
    const route=routeTo(targetPoint),category=classifyMember(target),stepInfo=step=>({step,total,dice1,dice2,handle:target.handle,category});
    world.dataset.rolling='true';diceBox.dataset.rolling='true';diceBox.dataset.dice1=String(dice1);diceBox.dataset.dice2=String(dice2);diceBox.dataset.total=String(total);
    player.dataset.step='0';player.dataset.total=String(total);player.dataset.target=target.handle;
    diceTotal.textContent='擲骰中…';
    try {
      dice.forEach(cube=>{cube.style.transition='none';cube.style.transform=DICE_ROTATIONS[1];cube.dataset.value='1';void cube.offsetWidth;cube.classList.add('rolling');});
      if(!reduced()&&!await wait(1100,ticket,valid))return null;
      if(!current(ticket,valid))return null;
      dice.forEach((cube,index)=>{const value=index ? dice2 : dice1;cube.classList.remove('rolling');cube.dataset.value=String(value);cube.style.transform=DICE_ROTATIONS[value];});
      diceBox.dataset.rolling='false';diceBox.setAttribute('aria-label',`${dice1} 加 ${dice2} 等於 ${total} 點`);diceTotal.textContent=`${dice1} + ${dice2} = ${total} 點`;
      player.dataset.moving='true';onStep(stepInfo(0));
      if(reduced()){
        if(!current(ticket,valid))return null;
        playerPoint=targetPoint;player.style.transform=transform(playerPoint);player.dataset.step=String(total);follow(playerPoint,true);onStep(stepInfo(total));
      }else{
        for(let step=1;step<=total;step++){
          if(!current(ticket,valid))return null;
          const start=route.length*(step-1)/total,end=route.length*step/total,frames=[{...pointAt(route,start),distance:start},...route.points.filter(point=>point.distance>start&&point.distance<end),{...pointAt(route,end),distance:end}];
          const point=frames.at(-1);let animation;
          player.style.transform=transform(point);
          if(typeof player.animate==='function'){
            animation=player.animate(frames.map(frame=>({transform:transform(frame),offset:(frame.distance-start)/(end-start||1)})),{duration:650,easing:'linear'});animations.add(animation);
          }
          follow(point);
          if(!await wait(650,ticket,valid))return null;
          if(animation){animation.cancel();animations.delete(animation);}
          if(!current(ticket,valid))return null;
          playerPoint={x:point.x,y:point.y};player.dataset.step=String(step);onStep(stepInfo(step));
        }
      }
      if(!current(ticket,valid))return null;
      position+=total;selectedHandle=target.handle;paintMembers(target.handle);
      return {handle:target.handle,dice1,dice2,total,steps:total};
    }finally{
      if(ticket===generation){world.dataset.rolling='false';player.dataset.moving='false';diceBox.dataset.rolling='false';dice.forEach(cube=>cube.classList.remove('rolling'));}
    }
  }
  const click=event=>{
    const button=event.target.closest('button');if(!button||!world.contains(button)||destroyed||paused||!isCurrent())return;
    if(button.dataset.biMember){event.stopPropagation();onMember?.(button.dataset.biMember);}
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
  function destroy() {if(destroyed)return;clearArrival();cancel();destroyed=true;observer?.disconnect();doc.removeEventListener('visibilitychange',visibility);world.removeEventListener('click',click);world.remove();if(ownsDice)diceHost.remove();else diceHost.replaceChildren();}
  return {renderMembers,showArrival,clearArrival,snapshot,restore,roll,cancel,destroy,pause,categories:CATEGORIES};
}
