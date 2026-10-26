import { NAV } from './business-island-land.mjs?v=1';
// The island scene is a view/controller over the existing authorized public member directory.
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

// Local artwork only; categories cannot provide arbitrary image paths.
export const VESSELS = Object.freeze({
  food:'food-fishing.svg',
  lodging:'lodging-yacht.svg',
  leisure:'leisure-sailboat.svg',
  shopping:'shopping-market.svg',
  mobility:'mobility-catamaran.svg',
  services:'services-launch.svg',
  manufacturing:'manufacturing-tug.svg'
});

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

  return {points:points.map((point,index) => {
if(index)length+=distance(points[index-1],point);
return {...point,distance:length};
}),length};

}
function pointAt(route, at) {

  const points=route.points;

  if(at<=0)return points[0];

  for(let index=1;
index<points.length;
index++)if(at<=points[index].distance){

    const before=points[index-1],after=points[index],ratio=(at-before.distance)/(after.distance-before.distance||1);

    return {x:before.x+(after.x-before.x)*ratio,y:before.y+(after.y-before.y)*ratio,phase:after.phase||'walking'};

  }
  return points.at(-1);

}
const transform = point => `translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0)`;

// Invisible pedestrian navigation over each asset's open paving. Coordinates are
// normalized foot points in the square artwork, never in the surrounding sea.
export const LAND_WAYPOINTS=Object.freeze(Object.fromEntries(Object.entries(NAV).map(([id,nav])=>[id,Object.freeze(nav.points.map(([x,y])=>Object.freeze({x,y})))])));

const corridor=(a,b,width=.018)=>{
const length=Math.hypot(b.x-a.x,b.y-a.y)||1,dx=-(b.y-a.y)/length*width,dy=(b.x-a.x)/length*width;
return[{x:a.x+dx,y:a.y+dy},{x:b.x+dx,y:b.y+dy},{x:b.x-dx,y:b.y-dy},{x:a.x-dx,y:a.y-dy}];
};

const pointBox=({x,y},radius)=>[{x:x-radius,y:y-radius},{x:x+radius,y:y-radius},{x:x+radius,y:y+radius},{x:x-radius,y:y+radius}];
export const LAND_POLYGONS=Object.freeze(Object.fromEntries(Object.entries(NAV).map(([id,nav])=>{
  const width=nav.corridorWidth??.018,radius=nav.pointRadius??width;
  const polygons=[...nav.edges.map(([a,b])=>corridor(LAND_WAYPOINTS[id][a],LAND_WAYPOINTS[id][b],width)),
    ...(nav.zones||[]).map(polygon=>polygon.map(([x,y])=>({x,y}))),...LAND_WAYPOINTS[id].map(point=>pointBox(point,radius))];
  return [id,Object.freeze(polygons.map(polygon=>Object.freeze(polygon.map(Object.freeze))))];
})));

function inside(point,polygon){
let yes=false;
for(let i=0,j=polygon.length-1;
i<polygon.length;
j=i++){
const a=polygon[i],b=polygon[j];
if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
}return yes;
}
export function isWalkable(category,point){
return !!point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&(LAND_POLYGONS[category]||[]).some(polygon=>inside(point,polygon));
}
const HERO_X=22,HERO_Y=59,NPC_X=22,NPC_Y=52;

const isOnline=row=>row.onlineKnown===true&&row.online===true;

const pageSize=()=>globalThis.innerWidth<=700?8:12;

// Visual wandering is independent of the dice/authentication random source.
const random=()=>Math.random();

const pick=items=>items[Math.min(items.length-1,Math.floor(random()*items.length))];

const interpolate=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

function nearestLand(category,point){
let best=LAND_WAYPOINTS[category][0],score=Infinity;
for(const[a,b]of NAV[category].edges){
const start=LAND_WAYPOINTS[category][a],end=LAND_WAYPOINTS[category][b],dx=end.x-start.x,dy=end.y-start.y,t=Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy)/(dx*dx+dy*dy||1))),candidate=interpolate(start,end,t),d=distance(point,candidate);
if(d<score){
score=d;
best=candidate;
}}return{...best};
}
const straightWalk=(category,a,b)=>Array.from({length:21},(_,i)=>interpolate(a,b,i/20)).every(point=>isWalkable(category,point));

function landPath(category,start,end){
start=isWalkable(category,start)?start:nearestLand(category,start);
end=isWalkable(category,end)?end:nearestLand(category,end);
if(straightWalk(category,start,end))return[{...start},{...end}];
const nodes=[...LAND_WAYPOINTS[category],start,end],first=nodes.length-2,last=nodes.length-1,links=nodes.map(()=>[]),link=(a,b)=>{
links[a].push(b);
links[b].push(a);
};
NAV[category].edges.forEach(([a,b])=>link(a,b));
for(let index=0;
index<first;
index++){
if(straightWalk(category,start,nodes[index]))link(first,index);
if(straightWalk(category,end,nodes[index]))link(last,index);
}const costs=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),visited=new Set();
costs[first]=0;
while(visited.size<nodes.length){
let current=-1;
for(let index=0;
index<nodes.length;
index++)if(!visited.has(index)&&(current<0||costs[index]<costs[current]))current=index;
if(current<0||!Number.isFinite(costs[current]))break;
if(current===last)break;
visited.add(current);
for(const next of links[current]){
const cost=costs[current]+distance(nodes[current],nodes[next]);
if(cost<costs[next]){
costs[next]=cost;
previous[next]=current;
}}}if(!Number.isFinite(costs[last]))return[{...start},{...start}];
const route=[];
for(let index=last;
index!==-1;
index=previous[index]){
route.unshift({...nodes[index]});
if(index===first)break;
}return route;
}

// Residents use the same safe roads with fewer visibility probes. The hero keeps
// its original path selection above; only NPCs use these cached graph links.
const NPC_GRAPH=Object.fromEntries(Object.entries(NAV).map(([category,nav])=>{
  const links=nav.points.map(()=>[]),points=LAND_WAYPOINTS[category];
  for(const [a,b] of nav.edges){
    const length=distance(points[a],points[b]);
    links[a].push({index:b,length});links[b].push({index:a,length});
  }
  return [category,links];
}));
function npcStraightWalk(category,start,end){
  // Check at half an artwork pixel so a shortcut cannot bridge narrow gaps.
  const steps=Math.max(1,Math.ceil(distance(start,end)*900*2));
  for(let step=0;step<=steps;step++)if(!isWalkable(category,interpolate(start,end,step/steps)))return false;
  return true;
}
function npcLandPath(category,start,end){
  start=isWalkable(category,start)?start:nearestLand(category,start);
  end=isWalkable(category,end)?end:nearestLand(category,end);
  if(npcStraightWalk(category,start,end))return [{...start},{...end}];
  const points=LAND_WAYPOINTS[category],links=NPC_GRAPH[category];
  const connect=point=>points.map((node,index)=>({index,length:distance(point,node)})).sort((a,b)=>a.length-b.length)
    .find(candidate=>candidate.length<1e-10||npcStraightWalk(category,point,points[candidate.index]))?.index;
  const first=connect(start),last=connect(end);
  if(first===undefined||last===undefined)return [{...start},{...start}];
  const costs=points.map(()=>Infinity),previous=points.map(()=>-1),visited=new Set();
  costs[first]=0;
  while(visited.size<points.length){
    let current=-1;
    for(let index=0;index<points.length;index++)if(!visited.has(index)&&(current<0||costs[index]<costs[current]))current=index;
    if(current<0||!Number.isFinite(costs[current]))break;
    if(current===last)break;
    visited.add(current);
    for(const link of links[current]){
      const cost=costs[current]+link.length;
      if(cost<costs[link.index]){costs[link.index]=cost;previous[link.index]=current;}
    }
  }
  if(!Number.isFinite(costs[last]))return [{...start},{...start}];
  const path=[];
  for(let index=last;index!==-1;index=previous[index]){path.unshift({...points[index]});if(index===first)break;}
  return [{...start},...path,{...end}];
}

export function createIslandWorld({host,asset,avatar,onMember,onChat,onCategory,onSail,onEncounter,isCurrent=()=>true,diceHost,profile}={}){

if(!host?.ownerDocument||typeof asset!=='function'||typeof avatar!=='function')throw Error('人脈島場景缺少必要設定');

const doc=host.ownerDocument,view=doc.defaultView,world=doc.createElement('div');
world.className='bi-world';
world.dataset.rolling='false';
world.dataset.paused=String(!!doc.hidden);
world.dataset.phase='idle';
const vesselArt=category=>`<img class="bi-vessel-art" src="${esc(asset(`assets/business-island/boats/${VESSELS[category]}`))}" alt="" width="200" height="140" decoding="async" draggable="false">`;

world.innerHTML=CATEGORIES.map((category,index)=>`<section class="bi-world-island" data-island="${category.id}" data-visible="false" style="--bi-island-index:${index}" aria-labelledby="bi-world-${category.id}-title"><h3 class="bi-world-title" id="bi-world-${category.id}-title"><button type="button" class="bi-world-category" data-category="${category.id}">${esc(category.label)}</button></h3><p class="bi-world-caption">${esc(category.caption)}</p><img class="bi-world-art" src="${esc(asset(`assets/business-island/${category.id}-v1.webp`))}" alt="${esc(category.label)}的立體島嶼場景" loading="${index?'lazy':'eager'}" decoding="async"><div class="bi-world-members"></div><div class="bi-island-member-bank"><p class="bi-island-member-summary" role="status"></p><button type="button" class="bi-island-members-more" data-bi-members-more="${category.id}" hidden>更多本島會員</button><button type="button" class="bi-island-sail" data-bi-sail="${category.id}">搭船前往${esc(category.label)}</button></div><span class="bi-pool" aria-hidden="true"><span class="bi-pool-water"></span><span class="bi-swimmer"></span><span class="bi-swimmer"></span><span class="bi-pool-ripple"></span><span class="bi-pool-ripple"></span></span><span class="bi-world-boat" data-vessel="${category.id}" aria-hidden="true">${vesselArt(category.id)}<span class="bi-boat-wake"></span></span></section>`).join('');

const travellers=doc.createElement('div');
travellers.className='bi-world-voyagers';
world.append(travellers);
const player=doc.createElement('span');
player.className='bi-world-player';
Object.assign(player.dataset,{moving:'false',step:'0',total:'0',travel:'walking',phase:'idle',boatStyle:'food'});
player.setAttribute('aria-label','我的探索位置');
player.innerHTML=`<span class="bi-player-shadow"></span><span class="bi-player-person">${walker()}${profile?`<span class="bi-player-avatar">${avatar(profile)}</span>`:''}</span><span class="bi-player-ferry" data-vessel="food" aria-hidden="true">${vesselArt('food')}<span class="bi-ferry-wake"></span></span><span class="bi-player-label">我</span>`;
function setBoatStyle(category){
const id=Object.hasOwn(VESSELS,category)?category:'food',ferry=player.querySelector('.bi-player-ferry'),image=ferry.querySelector('.bi-vessel-art'),src=asset(`assets/business-island/boats/${VESSELS[id]}`);
player.dataset.boatStyle=id;
ferry.dataset.vessel=id;
if(image.getAttribute('src')!==src)image.setAttribute('src',src);
}
setBoatStyle('food');
world.append(player);
host.replaceChildren(world);

const ownsDice=!diceHost;
if(!diceHost){
diceHost=doc.createElement('div');
diceHost.className='bi-world-dice';
host.prepend(diceHost);
}diceHost.innerHTML=diceMarkup();

const diceBox=diceHost.querySelector('.bi-3d-dice-box'),diceTotal=diceHost.querySelector('.bi-dice-total'),dice=[...diceHost.querySelectorAll('.bi-3d-die')],sections=[...world.querySelectorAll('.bi-world-island')],main=host.closest('#main'),media=view.matchMedia?.('(prefers-reduced-motion:reduce)'),timers=new Map(),npcStates=new Map(),artBoxes=new Map(),visible=new Set();

let generation=0,destroyed=false,paused=!!doc.hidden,rowsCache=[],selectedHandle='',arrivalHandle='',position=0,currentCategory='food',memberPages=new Map(),heroLand={x:NAV.food.spawn[0],y:NAV.food.spawn[1]},playerPoint={x:0,y:0},worldSize={width:0,height:0},pendingState=null,frameId=null,frameFinish=null,roamFrame=null,frozenHandle='',phaseListener=null,phaseDetails=null,phaseValid=null;
let logicTimer=null,simClock=0,simAt=null,nextDeparture=6000,nextBankRotation=18000,tripCursor=0,visitCount=0,nextEncounter=2000,preferResidentEncounter=true;
const encounterTimes=new Map();

const reduced=()=>!!media?.matches,current=(ticket,valid=()=>true)=>!destroyed&&!paused&&!doc.hidden&&ticket===generation&&isCurrent()&&valid();

const membersFor=(category,source=rowsCache)=>uniqueRows(source).filter(row=>{const state=npcStates.get(row.handle);return state&&state.row&&!state.trip&&state.category===category;}).sort((a,b)=>Number(isOnline(b))-Number(isOnline(a))||a.handle.localeCompare(b.handle));

const box=category=>artBoxes.get(category)||{x:0,y:0,size:0};

const landToWorld=(category,point)=>{
const rect=box(category);
return{x:rect.x+point.x*rect.size,y:rect.y+point.y*rect.size};
};

const worldToLand=(category,point)=>{
const rect=box(category);
return{x:(point.x-rect.x)/(rect.size||1),y:(point.y-rect.y)/(rect.size||1)};
};

function drawPlayer(){
player.style.transform=transform({x:playerPoint.x-HERO_X,y:playerPoint.y-HERO_Y});
player.dataset.onLand=String(!!heroLand&&isWalkable(currentCategory,heroLand));
if(heroLand){
player.dataset.x=heroLand.x.toFixed(6);
player.dataset.y=heroLand.y.toFixed(6);
}else{
delete player.dataset.x;
delete player.dataset.y;
}}
function measureWorld(){
const width=world.clientWidth,height=world.clientHeight;
if(width<=0||height<=0)return worldSize;
const base=world.getBoundingClientRect();
for(const section of sections){
const rect=section.querySelector('.bi-world-art').getBoundingClientRect();
if(rect.width>0)artBoxes.set(section.dataset.island,{x:rect.left-base.left,y:rect.top-base.top,size:rect.width,sectionX:section.getBoundingClientRect().left-base.left,sectionY:section.getBoundingClientRect().top-base.top});
}if(heroLand)playerPoint=landToWorld(currentCategory,heroLand);
else if(worldSize.width>0&&worldSize.height>0&&(width!==worldSize.width||height!==worldSize.height))playerPoint={x:playerPoint.x/worldSize.width*width,y:playerPoint.y/worldSize.height*height};
worldSize={width,height};
drawPlayer();
for(const state of npcStates.values()){if(state.trip)buildTripRoute(state);drawNpc(state);}
return worldSize;
}
function syncLocation(){
for(const element of[world,player])element.dataset.currentCategory=currentCategory;
const busy=world.dataset.rolling==='true',afloat=['sailing','boarding'].includes(player.dataset.travel);
for(const section of sections){
const here=section.dataset.island===currentCategory;
section.dataset.current=String(here);
const sail=section.querySelector('[data-bi-sail]');
sail.disabled=busy||(here&&!afloat);
sail.textContent=here&&!afloat?'目前所在島':'搭船前往'+CATEGORIES.find(item=>item.id===section.dataset.island).label;
section.querySelector('[data-bi-members-more]').disabled=busy;
}}
function bindPictures(){
for(const image of world.querySelectorAll('img[data-bi-avatar]:not([data-bound])')){
image.dataset.bound='';
const initial=image.previousElementSibling,loaded=()=>{
if(initial)initial.hidden=true;
image.hidden=false;
},failed=()=>{
if(initial)initial.hidden=false;
image.remove();
};
image.addEventListener('load',loaded,{once:true});
image.addEventListener('error',failed,{once:true});
if(image.complete){
if(image.naturalWidth>0)loaded();
else failed();
}}}
// NPC locations are a local scene simulation, never a claim about real member locations.
function publicPerson(row){
  const person={};
  for(const key of ['handle','name','company','title','industry','islandCategory','avatarUrl','memberNumber','canChat'])if(row[key]!==undefined)person[key]=row[key];
  person.online=row.online===true&&row.onlineKnown===true;
  person.onlineKnown=row.onlineKnown===true;
  return person;
}
function residents(category){return membersFor(category).map(publicPerson);}
function tripSample(state){
  const trip=state.trip;
  if(!trip)return {point:landToWorld(state.category,state.point),phase:'walking',category:state.category};
  let elapsed=Math.min(trip.elapsed,trip.duration);
  for(const leg of trip.legs){
    if(elapsed<=leg.duration){
      return {point:interpolate(leg.from,leg.to,leg.duration?elapsed/leg.duration:1),phase:leg.phase,category:leg.category};
    }
    elapsed-=leg.duration;
  }
  return {point:landToWorld(trip.to,trip.end),phase:'walking',category:trip.to};
}
function memberLocation(handle){
  const state=npcStates.get(handle);
  if(!state?.row)return null;
  const sample=tripSample(state),onLand=sample.phase==='walking';
  return {homeCategory:state.homeCategory,category:sample.category,phase:sample.phase,fromCategory:state.trip?.from||state.category,toCategory:state.trip?.to||state.category,
    point:onLand?worldToLand(sample.category,sample.point):null,world:{...sample.point}};
}
function actorVisible(state){
  if(!state.trip)return visible.has(state.category);
  const point=tripSample(state).point,rect=world.getBoundingClientRect(),viewport=main?.getBoundingClientRect()||{top:0,bottom:view.innerHeight};
  return rect.top+point.y>=viewport.top-180&&rect.top+point.y<=viewport.bottom+180;
}
function drawNpc(state){
  const element=state.element;
  if(!element?.isConnected)return;
  const sample=tripSample(state),point=sample.point,rect=state.trip?{sectionX:0,sectionY:0}:box(state.category),onLand=sample.phase==='walking',seen=actorVisible(state),active=!paused&&!doc.hidden&&!reduced()&&seen;
  element.style.transform=transform({x:point.x-(rect.sectionX||0)-NPC_X,y:point.y-(rect.sectionY||0)-NPC_Y});
  Object.assign(element.dataset,{homeCategory:state.homeCategory,currentCategory:sample.category,travel:sample.phase,phase:sample.phase,
    fromCategory:state.trip?.from||state.category,toCategory:state.trip?.to||state.category,vessel:state.trip?.from||state.category,
    worldX:point.x.toFixed(2),worldY:point.y.toFixed(2),onLand:String(onLand),visible:String(seen),moving:String(active&&!!state.moving&&!state.frozen),
    frozen:String(!!state.frozen),online:String(isOnline(state.row)),onlineKnown:String(state.row?.onlineKnown===true),roamTarget:state.goal?`${state.goal.x.toFixed(5)},${state.goal.y.toFixed(5)}`:''});
  if(onLand){
    const land=worldToLand(sample.category,point);
    element.dataset.x=land.x.toFixed(6);element.dataset.y=land.y.toFixed(6);
  }else{delete element.dataset.x;delete element.dataset.y;}
  element.style.zIndex=String(state.trip?120:5+Math.round(state.point.y*100));
}
function randomLandPoint(category){
  const nav=NAV[category],zone=nav.zones?.length&&random()>.45?pick(nav.zones):null;
  if(zone){
    const center={x:zone.reduce((sum,p)=>sum+p[0],0)/zone.length,y:zone.reduce((sum,p)=>sum+p[1],0)/zone.length},a=pick(zone),amount=.2+random()*.65;
    return interpolate(center,{x:a[0],y:a[1]},amount);
  }
  const [a,b]=pick(nav.edges);
  return interpolate(LAND_WAYPOINTS[category][a],LAND_WAYPOINTS[category][b],.1+random()*.8);
}
function initialPoint(category,handle){
  const group=membersFor(category),index=group.findIndex(row=>row.handle===handle),start=Math.floor(Math.max(0,index)/pageSize())*pageSize(),peers=new Set(group.slice(start,start+pageSize()).map(row=>row.handle));
  const others=[...npcStates.values()].filter(state=>state.handle!==handle&&state.category===category&&state.row&&peers.has(state.handle));
  let result=randomLandPoint(category),best=-1;
  for(let trial=0;trial<45;trial++){
    const point=randomLandPoint(category),gap=others.length?Math.min(...others.map(state=>distance(point,state.point))):1;
    if(gap>best){best=gap;result=point;}
  }
  return {...result};
}
function ensureState(row){
  let state=npcStates.get(row.handle);
  if(!state){
    const counts=CATEGORIES.map(category=>[category.id,[...npcStates.values()].filter(other=>other.row&&other.category===category.id).length]);
    const minimum=Math.min(...counts.map(([,count])=>count)),category=counts.find(([,count])=>count===minimum)[0];
    state={handle:row.handle,homeCategory:classifyMember(row),category,row,point:{x:NAV[category].spawn[0],y:NAV[category].spawn[1]},route:[],goal:null,wait:0,moving:false,frozen:false,element:null,at:simClock,trip:null,visitAfter:0};
    npcStates.set(row.handle,state);
    state.point=initialPoint(category,row.handle);
  }
  if(!state.row)state.at=simClock;
  state.row=row;state.homeCategory=classifyMember(row);
  return state;
}
function paintActor(state,host){
  const row=state.row;
  let element=state.element;
  if(!element){
    element=doc.createElement('button');element.type='button';element.className='bi-npc bi-pin';
    element.dataset.biMember=row.handle;element.dataset.biNpc='';state.element=element;state.signature='';
  }
  if(element.parentElement!==host)host.append(element);
  const vessel=state.trip?.from||state.category,signature=JSON.stringify([row.name,row.avatarUrl,row.online,row.onlineKnown,row.canChat,vessel]);
  if(state.signature!==signature){
    element.innerHTML=`<span class="bi-npc-person" aria-hidden="true"><span class="bi-npc-shadow"></span><span class="bi-npc-body"></span><span class="bi-npc-arm is-left"></span><span class="bi-npc-arm is-right"></span><span class="bi-npc-leg is-left"></span><span class="bi-npc-leg is-right"></span>${avatar(row,'bi-npc-head')}</span><span class="bi-npc-ferry" aria-hidden="true" data-vessel="${vessel}">${vesselArt(vessel)}<span class="bi-npc-wake"></span></span><span class="bi-npc-name">${esc(row.name||'會員')}</span><span class="bi-npc-online" aria-hidden="true"></span>`;
    state.signature=signature;
  }
  element.setAttribute('aria-label',`與 ${clean(row.name)||'會員'} 開始交流${isOnline(row)?'，目前在線':''}`);
  element.setAttribute('aria-pressed',String(row.handle===selectedHandle));
  drawNpc(state);
}
function paintMembers(ensure=''){
  ensure=frozenHandle||ensure;
  const wanted=new Set();
  for(const section of sections){
    const category=section.dataset.island,group=membersFor(category),pages=Math.max(1,Math.ceil(group.length/pageSize())),host=section.querySelector('.bi-world-members');
    let page=Math.min(memberPages.get(category)||0,pages-1);
    const index=ensure?group.findIndex(row=>row.handle===ensure):-1;
    if(index>=0)page=Math.floor(index/pageSize());
    memberPages.set(category,page);
    for(const row of group.slice(page*pageSize(),(page+1)*pageSize())){
      wanted.add(row.handle);paintActor(ensureState(row),host);
    }
    section.dataset.memberCount=String(group.length);section.dataset.onlineCount=String(group.filter(isOnline).length);
    section.dataset.page=String(page+1);section.dataset.pages=String(pages);
    const known=group.filter(row=>row.onlineKnown===true).length,onlineText=known===group.length?`在線 ${group.filter(isOnline).length} 位`:known?`已知在線 ${group.filter(isOnline).length} 位`:'在線優先，狀態更新中';
    section.querySelector('.bi-island-member-summary').textContent=group.length?`島上 ${group.length} 位夥伴 · ${onlineText} · 第 ${page+1} / ${pages} 批`:'目前沒有夥伴停留，仍可在島上散步。';
    section.querySelector('[data-bi-members-more]').hidden=pages<=1;
  }
  for(const state of npcStates.values())if(state.row&&state.trip){wanted.add(state.handle);paintActor(state,travellers);}
  for(const state of npcStates.values())if(state.element?.isConnected&&!wanted.has(state.handle))state.element.remove();
  bindPictures();syncLocation();startRoam();
}
function canInteract(){return !destroyed&&!paused&&!doc.hidden&&isCurrent()&&world.clientWidth>0&&rowsCache.length>0;}
function canSimulate(){return canInteract()&&!reduced();}
function stopRoam(){
  if(roamFrame!==null)view.cancelAnimationFrame(roamFrame);
  if(logicTimer!==null)view.clearTimeout(logicTimer);
  roamFrame=null;logicTimer=null;simAt=null;
  for(const state of npcStates.values()){state.moving=false;drawNpc(state);}
}
function canRoam(){return canSimulate()&&!reduced()&&[...npcStates.values()].some(state=>state.row&&state.element?.isConnected&&actorVisible(state)&&!state.frozen);}
function nextGoal(state){
  const neighbours=[...npcStates.values()].filter(other=>other!==state&&other.row&&!other.trip&&other.category===state.category);
  state.goal=neighbours.length&&random()<.45?{...pick(neighbours).point}:randomLandPoint(state.category);
  state.route=npcLandPath(state.category,state.point,state.goal).slice(1);state.wait=0;
}
function advanceLand(state,elapsed){
  if(reduced()){state.moving=false;return;}
  state.wait=Math.max(0,state.wait-elapsed);
  if(state.wait>0){state.moving=false;return;}
  if(!state.route.length)nextGoal(state);
  let budget=30*elapsed/1000/(box(state.category).size||330);
  state.moving=budget>0;
  while(budget>0&&state.route.length){
    const target=state.route[0],length=distance(state.point,target);
    if(length<=budget){state.point={...target};state.route.shift();budget-=length;}
    else{
      const candidate=interpolate(state.point,target,budget/(length||1));
      const near=state.element?.isConnected&&[...npcStates.values()].some(other=>other!==state&&!other.trip&&other.row&&other.element?.isConnected&&other.category===state.category&&distance(candidate,other.point)*(box(state.category).size||330)<33&&distance(candidate,other.point)<distance(state.point,other.point));
      if(near){state.wait=120+random()*250;state.route=[];state.goal=null;state.moving=false;}
      else state.point=candidate;
      budget=0;
    }
  }
  if(!state.route.length){state.wait=80+random()*280;state.moving=false;}
}
function buildTripRoute(state){
  const trip=state.trip;
  if(!trip)return;
  const previous=trip.duration?trip.elapsed/trip.duration:trip.progress||0,points=[];
  const add=(point,phase,category)=>points.push({...point,phase,category});
  const fromDock={x:NAV[trip.from].dock[0],y:NAV[trip.from].dock[1]},toDock={x:NAV[trip.to].dock[0],y:NAV[trip.to].dock[1]};
  const fromSea=landToWorld(trip.from,{x:NAV[trip.from].sea[0],y:NAV[trip.from].sea[1]}),toSea=landToWorld(trip.to,{x:NAV[trip.to].sea[0],y:NAV[trip.to].sea[1]}),channel=Math.max(46,worldSize.width*.09);
  for(const point of npcLandPath(trip.from,trip.start,fromDock))add(landToWorld(trip.from,point),'walking',trip.from);
  add(fromSea,'boarding',trip.from);add({x:channel,y:fromSea.y},'sailing',trip.from);
  add({x:channel,y:toSea.y},'sailing',trip.from);add(toSea,'sailing',trip.from);
  add(landToWorld(trip.to,toDock),'docking',trip.to);
  for(const point of npcLandPath(trip.to,toDock,trip.end).slice(1))add(landToWorld(trip.to,point),'walking',trip.to);
  trip.legs=[];
  for(let index=1;index<points.length;index++){
    const from=points[index-1],to=points[index],length=distance(from,to),speed=to.phase==='walking'?45:to.phase==='sailing'?170:95;
    trip.legs.push({from,to,phase:to.phase,category:to.category,duration:Math.max(1,length/speed*1000)});
  }
  trip.duration=trip.legs.reduce((sum,leg)=>sum+leg.duration,0);trip.elapsed=Math.max(0,Math.min(1,previous))*trip.duration;
  delete trip.progress;
}
function beginVisit(state){
  const counts=CATEGORIES.filter(category=>category.id!==state.category).map(category=>[category.id,[...npcStates.values()].filter(other=>other.row&&(other.trip?other.trip.to===category.id:other.category===category.id)).length]);
  const minimum=Math.min(...counts.map(([,count])=>count)),social=counts.filter(([,count])=>count>0&&count<pageSize());
  const meeting=social.length?pick(social):counts.find(([id,count])=>id===currentCategory&&count<pageSize()),socialTurn=visitCount++%5<2;
  const to=meeting&&socialTurn?meeting[0]:pick(counts.filter(([,count])=>count===minimum))[0];
  const hosts=[...npcStates.values()].filter(other=>other.row&&!other.trip&&other.category===to),host=hosts.length&&socialTurn?pick(hosts):null,end=host?{...host.point}:randomLandPoint(to);
  state.trip={from:state.category,to,start:{...state.point},end,elapsed:0,duration:0};
  state.route=[];state.goal=null;state.at=simClock;state.moving=!reduced();
  buildTripRoute(state);
  if(host)host.visitAfter=Math.max(host.visitAfter||0,simClock+state.trip.duration+12000);
  if(reduced()){state.category=to;state.point={...state.trip.end};state.trip=null;state.moving=false;}
}
function advanceNpc(state){
  const elapsed=Math.max(0,simClock-state.at);state.at=simClock;
  if(!state.row||state.frozen){state.moving=false;return false;}
  if(!state.trip){advanceLand(state,elapsed);return false;}
  state.trip.elapsed=Math.min(state.trip.duration,state.trip.elapsed+elapsed);state.moving=elapsed>0&&!reduced();
  const sample=tripSample(state);state.category=sample.category;
  if(sample.phase==='walking')state.point=worldToLand(sample.category,sample.point);
  else state.point={x:NAV[sample.category].dock[0],y:NAV[sample.category].dock[1]};
  if(state.trip.elapsed>=state.trip.duration){
    state.category=state.trip.to;state.point={...state.trip.end};state.trip=null;state.route=[];state.wait=500;state.visitAfter=simClock+14000;return true;
  }
  return false;
}
function encounter(kind,states,explicit=false){
  if(typeof onEncounter!=='function'||!canInteract()||(!explicit&&simClock<nextEncounter)||states.some(state=>!state.row||state.trip))return false;
  const handles=states.map(state=>state.handle).sort(),id=kind+':'+handles.join('|'),last=encounterTimes.get(id)??-Infinity;
  if(!explicit&&simClock-last<45000)return false;
  encounterTimes.set(id,simClock);nextEncounter=simClock+12000;
  preferResidentEncounter=kind==='hero';
  if(encounterTimes.size>300){const first=encounterTimes.keys().next().value;encounterTimes.delete(first);}
  const point=landToWorld(states[0].category,states[0].point);
  try{
    onEncounter({kind,explicit,people:states.map(state=>publicPerson(state.row)),category:states[0].category,anchor:{x:point.x/(worldSize.width||1),y:point.y/(worldSize.height||1)},id});
    return true;
  }catch{return false;}
}
function considerEncounters(){
  if(simClock<nextEncounter)return;
  const actors=[...npcStates.values()].filter(state=>state.row&&!state.trip&&state.element?.isConnected&&actorVisible(state));
  const heroEncounter=()=>{
    if(!heroLand||player.dataset.travel!=='walking')return false;
    for(const state of actors)if(state.category===currentCategory&&distance(landToWorld(state.category,state.point),playerPoint)<46&&encounter('hero',[state]))return true;
    return false;
  };
  const residentEncounter=()=>{
    for(let left=0;left<actors.length;left++)for(let right=left+1;right<actors.length;right++){
      const a=actors[left],b=actors[right];
      if(a.category===b.category&&distance(a.point,b.point)*(box(a.category).size||330)<42&&encounter('residents',[a,b]))return true;
    }
    return false;
  };
  if(preferResidentEncounter){if(!residentEncounter())heroEncounter();}
  else if(!heroEncounter())residentEncounter();
}

function advanceSimulation(visibleOnly=false){
  const now=view.performance.now();
  if(simAt!==null)simClock+=Math.max(0,Math.min(1000,now-simAt));
  simAt=now;
  let changed=false;
  for(const state of npcStates.values())if(state.row&&(!visibleOnly||state.element?.isConnected&&actorVisible(state))){changed=advanceNpc(state)||changed;drawNpc(state);}
  if(!visibleOnly){
    if(simClock>=nextDeparture){
      nextDeparture=simClock+4500;
      const ordered=[...npcStates.values()].filter(state=>state.row).sort((a,b)=>a.handle.localeCompare(b.handle));
      if(ordered.filter(state=>state.trip).length<3)for(let tries=0;tries<ordered.length;tries++){
        const state=ordered[tripCursor++%ordered.length];
        if(!state.trip&&!state.frozen&&(state.visitAfter||0)<=simClock&&state.element!==doc.activeElement){beginVisit(state);changed=true;break;}
      }
    }
    if(simClock>=nextBankRotation){
      nextBankRotation=simClock+18000;
      for(const category of CATEGORIES){
        const group=membersFor(category.id),pages=Math.ceil(group.length/pageSize()),host=sections.find(section=>section.dataset.island===category.id);
        if(pages>1&&!group.some(row=>row.handle===frozenHandle)&&!host.contains(doc.activeElement)){memberPages.set(category.id,((memberPages.get(category.id)||0)+1)%pages);changed=true;}
      }
    }
    considerEncounters();
  }
  if(changed)paintMembers();
}
function startRoam(){
  if(!canSimulate())return;
  if(simAt===null)simAt=view.performance.now();
  if(logicTimer===null)logicTimer=view.setTimeout(()=>{
    logicTimer=null;
    if(!canSimulate()){stopRoam();if(!isCurrent())world.dataset.paused='true';return;}
    advanceSimulation();startRoam();
  },500);
  if(roamFrame!==null||!canRoam())return;
  const tick=()=>{
    roamFrame=null;
    if(!canRoam()){
      if(!canSimulate()){stopRoam();if(!isCurrent())world.dataset.paused='true';}
      else for(const state of npcStates.values())drawNpc(state);
      return;
    }
    advanceSimulation(true);
    if(roamFrame===null&&canRoam())roamFrame=view.requestAnimationFrame(tick);
  };
  roamFrame=view.requestAnimationFrame(tick);
}
function renderMembers(rows,{selected=''}={}){
  if(destroyed)return;
  measureWorld();
  const changed=selectedHandle!==clean(selected);
  rowsCache=uniqueRows(rows);selectedHandle=clean(selected);
  if(!rowsCache.length)stopRoam();
  const present=new Set(rowsCache.map(row=>row.handle));
  for(const state of npcStates.values())if(!present.has(state.handle)){state.row=null;state.element?.remove();state.at=simClock;}
  for(const row of [...rowsCache].sort((a,b)=>a.handle.localeCompare(b.handle)))ensureState(row);
  if(arrivalHandle&&!present.has(arrivalHandle))clearArrival();
  if(arrivalHandle){
    const row=rowsCache.find(item=>item.handle===arrivalHandle),aside=world.querySelector('.bi-world-arrival');
    if(row&&aside){aside.querySelector('h4').textContent=(row.name||'會員')+(isOnline(row)?' · 在線':'');aside.querySelector('p').textContent=[row.company,row.title].filter(Boolean).join(' · ');}
  }
  paintMembers(changed?selectedHandle:'');
}
function clearArrival(){
world.querySelectorAll('.bi-world-arrival').forEach(element=>element.remove());
arrivalHandle='';
}
function showArrival(handle){
if(destroyed||paused||!isCurrent())return false;
const row=rowsCache.find(item=>item.handle===handle);
if(!row)return false;
clearArrival();
arrivalHandle=row.handle;
selectedHandle=row.handle;
paintMembers(row.handle);
const location=memberLocation(handle),section=sections.find(item=>item.dataset.island===(location?.category||currentCategory)),aside=doc.createElement('aside');
aside.className='bi-world-arrival';
aside.setAttribute('aria-label','目前遇見的會員');
aside.innerHTML=`${avatar(row)}<div class="bi-world-arrival-copy"><h4>${esc(row.name||'會員')}${isOnline(row)?' · 在線':''}</h4><p>${esc([row.company,row.title].filter(Boolean).join(' · '))}</p></div><div class="bi-world-arrival-actions"><button type="button" data-bi-action="card" data-bi-handle="${esc(row.handle)}">查看公開名片</button><button type="button" data-bi-action="chat" data-bi-handle="${esc(row.handle)}"${row.canChat===false?' disabled':''}>${row.canChat===false?'未開放新聯絡':'開始交流'}</button></div>`;
section.insertBefore(aside,section.querySelector('.bi-pool'));
bindPictures();
return true;
}
function showEmptyArrival(){
clearArrival();
}
function releaseTarget(wait=0){
if(frozenHandle){
const state=npcStates.get(frozenHandle);
if(state){
state.frozen=false;
state.wait=wait;
drawNpc(state);
}frozenHandle='';
}}
function wait(ms,ticket,valid){
if(!current(ticket,valid))return Promise.resolve(false);
return new Promise(resolve=>{
const id=view.setTimeout(()=>{
timers.delete(id);
resolve(current(ticket,valid));
},ms);
timers.set(id,resolve);
});
}
function stopMotion(){
if(frameId!==null)view.cancelAnimationFrame(frameId);
frameId=null;
if(frameFinish){
const finish=frameFinish;
frameFinish=null;
finish(false);
}for(const[id,resolve]of timers){
view.clearTimeout(id);
resolve(false);
}timers.clear();
dice.forEach(cube=>cube.classList.remove('rolling'));
diceBox.dataset.rolling='false';
world.dataset.rolling='false';
player.dataset.moving='false';
if(main?.isConnected)main.scrollTo({top:main.scrollTop,behavior:'auto'});
syncLocation();
}
function setPhase(phase,emit=true){
const changed=player.dataset.phase!==phase;
world.dataset.phase=phase;
player.dataset.phase=phase;
if(phase==='boarding')player.dataset.travel='boarding';
else if(phase==='sailing'||phase==='docking')player.dataset.travel='sailing';
else if(phase==='walking'||phase==='arrived')player.dataset.travel='walking';
if(changed&&emit&&phaseListener&&phaseDetails){
try{
phaseListener({...phaseDetails,phase});
}catch{}}}
function cancel(){
const was=world.dataset.rolling==='true',notify=was&&current(generation,phaseValid||(()=>true));
generation++;
stopMotion();
stopRoam();
releaseTarget();
if(was)setPhase('cancelled',notify);
phaseListener=null;
phaseDetails=null;
phaseValid=null;
}
function follow(point,ms=16,instant=false){
if(!main?.isConnected)return;
const worldTop=world.getBoundingClientRect().top-main.getBoundingClientRect().top+main.scrollTop,desired=Math.max(0,Math.min(main.scrollHeight-main.clientHeight,worldTop+point.y-main.clientHeight*.48)),delta=desired-main.scrollTop,limit=500*Math.min(64,Math.max(0,ms))/1000;
main.scrollTo({top:instant?desired:main.scrollTop+Math.sign(delta)*Math.min(Math.abs(delta),limit),behavior:'auto'});
}
function moveHero(point,phase){
playerPoint={x:point.x,y:point.y};
const candidate=worldToLand(currentCategory,playerPoint);
heroLand=phase==='walking'&&isWalkable(currentCategory,candidate)?candidate:null;
drawPlayer();
}
function animatePath(route,duration,total,ticket,valid,onStep,stepInfo,completeStep=()=>{
}){
return new Promise(resolve=>{
let started=null,previous=null,lastStep=0,settled=false;
const finish=okay=>{
if(settled)return;
settled=true;
if(frameId!==null)view.cancelAnimationFrame(frameId);
frameId=null;
frameFinish=null;
resolve(okay);
};
frameFinish=finish;
const tick=now=>{
frameId=null;
if(!current(ticket,valid)){
finish(false);
return;
}if(started===null)started=now;
const progress=Math.min(1,(now-started)/duration),point=pointAt(route,route.length*progress),phase=point.phase||'walking';
moveHero(point,phase);
player.dataset.progress=progress.toFixed(5);
setPhase(phase);
if(!current(ticket,valid)){
finish(false);
return;
}follow(playerPoint,previous===null?0:now-previous);
previous=now;
const done=Math.min(total,Math.floor(progress*total+1e-8));
while(lastStep<done){
if(!current(ticket,valid)){
finish(false);
return;
}lastStep++;
completeStep(lastStep);
player.dataset.step=String(lastStep);
onStep(stepInfo(lastStep));
}if(!current(ticket,valid)){
finish(false);
return;
}if(progress>=1)finish(true);
else frameId=view.requestAnimationFrame(tick);
};
frameId=view.requestAnimationFrame(tick);
});
}
function journeyInfo(info,onPhase,valid){
phaseListener=onPhase;
phaseDetails=info;
phaseValid=valid;
for(const[key,value]of Object.entries({duration:info.duration.toFixed(2),distance:info.distance.toFixed(2),speed:info.speed.toFixed(2),mode:info.mode})){
player.dataset[key]=String(value);
world.dataset[key]=String(value);
}player.dataset.fromCategory=info.fromCategory;
player.dataset.category=info.category;
world.dataset.rolling='true';
player.dataset.step='0';
player.dataset.total=String(info.total);
player.dataset.progress='0';
syncLocation();
}
function finishJourney(ticket){
if(ticket===generation){
if(player.dataset.phase!=='arrived')setPhase('cancelled',false);
world.dataset.rolling='false';
player.dataset.moving='false';
diceBox.dataset.rolling='false';
dice.forEach(cube=>cube.classList.remove('rolling'));
phaseListener=null;
phaseDetails=null;
phaseValid=null;
releaseTarget(player.dataset.phase==='arrived'?1200:0);
syncLocation();
startRoam();
}}
function prepareJourney(valid){
if(destroyed||paused||doc.hidden||world.dataset.rolling==='true'||!isCurrent()||!valid()||world.clientWidth<=0||world.clientHeight<=0)return false;
measureWorld();
if(pendingState){
const saved=pendingState;
pendingState=null;
if(!restore(saved))return false;
}return true;
}
function explorationRoute(category,start,end,total){
const size=box(category).size||330,budget=total*size*.07;
let route=landPath(category,start,end);
if(routeMetrics(route).length*size<budget){
route=[{...start}];
let cursor=start;
for(let turn=0;
turn<total;
turn++){
const goal=pick(LAND_WAYPOINTS[category]),leg=landPath(category,cursor,goal);
route.push(...leg.slice(1));
cursor=goal;
const final=landPath(category,cursor,end);
if((routeMetrics(route).length+routeMetrics(final).length)*size>=budget){
route.push(...final.slice(1));
break;
}if(turn===total-1)route.push(...final.slice(1));
}}return route;
}

async function roll({dice1,dice2,rows,valid=()=>true,onStep=()=>{
},onPhase=()=>{
}}={}){

if(!Number.isInteger(dice1)||dice1<1||dice1>6||!Number.isInteger(dice2)||dice2<1||dice2>6)throw Error('骰子點數必須介於1至6');
if(!prepareJourney(valid))return null;
if(['sailing','boarding'].includes(player.dataset.travel))throw Error('目前停在航道，請先明確搭船靠岸後再擲骰。');

clearArrival();
cancel();
const ticket=generation,total=dice1+dice2,category=currentCategory,allowed=new Set(uniqueRows(rows===undefined?rowsCache:rows).map(row=>row.handle)),group=membersFor(category).filter(row=>allowed.has(row.handle)),online=group.filter(row=>isOnline(row)),target=pick(online.length?online:group),start=heroLand&&isWalkable(category,heroLand)?{...heroLand}:nearestLand(category,worldToLand(category,playerPoint));

let end;
if(target){
const state=ensureState(target);
state.frozen=true;
state.moving=false;
frozenHandle=target.handle;
end={...state.point};
paintMembers(target.handle);
}else{
end={...pick(LAND_WAYPOINTS[category])};
startRoam();
}
const route=routeMetrics(explorationRoute(category,start,end,total).map(point=>({...landToWorld(category,point),phase:'walking'}))),duration=Math.max(total*650,route.length/100*1000),info={mode:'walk',total,dice1,dice2,handle:target?.handle||'',targetOnline:!!target&&isOnline(target),category,fromCategory:category,duration,distance:route.length,speed:route.length/duration*1000},stepInfo=step=>({...info,step});

journeyInfo(info,onPhase,valid);
player.dataset.target=target?.handle||'';
diceBox.dataset.rolling='true';
diceBox.dataset.dice1=String(dice1);
diceBox.dataset.dice2=String(dice2);
diceBox.dataset.total=String(total);
diceTotal.textContent='擲骰中…';
setPhase('dice');

try{
if(!current(ticket,valid))return null;
dice.forEach(cube=>{
cube.style.transition='none';
cube.style.transform=DICE_ROTATIONS[1];
cube.dataset.value='1';
void cube.offsetWidth;
cube.classList.add('rolling');
});
if(!reduced()&&!await wait(1100,ticket,valid))return null;
if(!current(ticket,valid))return null;
dice.forEach((cube,index)=>{
const value=index?dice2:dice1;
cube.classList.remove('rolling');
cube.dataset.value=String(value);
cube.style.transform=DICE_ROTATIONS[value];
});
diceBox.dataset.rolling='false';
diceBox.setAttribute('aria-label',`${dice1} 加 ${dice2} 等於 ${total} 點`);
diceTotal.textContent=`${dice1} + ${dice2} = ${total} 點`;
player.dataset.moving='true';
setPhase('walking');
onStep(stepInfo(0));
const complete=()=>{
position++;
};

if(reduced()){
moveHero(landToWorld(category,end),'walking');
player.dataset.progress='1';
follow(playerPoint,0,true);
for(let step=1;
step<=total;
step++){
if(!current(ticket,valid))return null;
complete();
player.dataset.step=String(step);
onStep(stepInfo(step));
}}else if(!await animatePath(route,duration,total,ticket,valid,onStep,stepInfo,complete))return null;
if(!current(ticket,valid))return null;
if(target){
selectedHandle=target.handle;
paintMembers(target.handle);
}else{
selectedHandle='';
paintMembers();
showEmptyArrival();
}setPhase('arrived');
if(target)encounter('hero',[npcStates.get(target.handle)],true);
return {...info,empty:!target,steps:total,position,currentCategory};

}finally{finishJourney(ticket);
}}
function dock(index){
const section=sections[index],rect=section.getBoundingClientRect(),base=world.getBoundingClientRect();
return{x:rect.left-base.left+rect.width*.18,y:rect.top-base.top+rect.height*.91};
}
function voyageRoute(targetPoint,category){
const fromIndex=Math.max(0,Math.min(6,Math.floor(playerPoint.y/(world.clientHeight/7||1)))),targetIndex=CATEGORIES.findIndex(item=>item.id===category),afloat=['sailing','boarding'].includes(player.dataset.travel),points=[{...playerPoint,phase:afloat?'sailing':'walking'}],channelX=Math.max(46,world.clientWidth*.09),departure=dock(fromIndex),arrival=dock(targetIndex);
if(!afloat){
points.push({...departure,phase:'walking'},{x:channelX,y:departure.y,phase:'boarding'});
}else points.push({x:channelX,y:playerPoint.y,phase:'sailing'});
points.push({x:channelX,y:arrival.y,phase:'sailing'},{...arrival,phase:'docking'},{...targetPoint,phase:'walking'});
return routeMetrics(points);
}
async function sailTo(category,{valid=()=>true,onPhase=()=>{
},onStep=()=>{
}}={}){

if(!CATEGORIES.some(item=>item.id===category))throw Error('請選擇有效的目的島嶼');
if(!prepareJourney(valid))return null;
const afloat=['sailing','boarding'].includes(player.dataset.travel);
if(category===currentCategory&&!afloat)return{mode:'sail',category,currentCategory,noop:true,total:0,steps:0,duration:0,distance:0,speed:0};
clearArrival();
cancel();
const ticket=generation,end={x:NAV[category].spawn[0],y:NAV[category].spawn[1]},targetPoint=landToWorld(category,end),route=voyageRoute(targetPoint,category),total=Math.max(1,Math.abs(CATEGORIES.findIndex(item=>item.id===category)-CATEGORIES.findIndex(item=>item.id===currentCategory))),duration=Math.max(1300,route.length/(world.clientWidth>700?240:200)*1000),info={mode:'sail',handle:'',category,fromCategory:currentCategory,total,duration,distance:route.length,speed:route.length/duration*1000},stepInfo=step=>({...info,step});
if(!afloat)setBoatStyle(currentCategory);
journeyInfo(info,onPhase,valid);
player.dataset.target='';
player.dataset.direction=targetPoint.y>=playerPoint.y?'south':'north';
player.dataset.moving='true';
setPhase(route.points[0].phase);
onStep(stepInfo(0));
startRoam();

try{
if(reduced()){
if(!current(ticket,valid))return null;
playerPoint=targetPoint;
drawPlayer();
player.dataset.step=String(total);
player.dataset.progress='1';
follow(playerPoint,0,true);
onStep(stepInfo(total));
}else if(!await animatePath(route,duration,total,ticket,valid,onStep,stepInfo))return null;
if(!current(ticket,valid))return null;
currentCategory=category;
heroLand=end;
playerPoint=targetPoint;
drawPlayer();
syncLocation();
setPhase('arrived');
return{...info,steps:total,currentCategory};
}finally{finishJourney(ticket);
}}
function snapshot(){
if(pendingState)return{...pendingState,point:{...pendingState.point},pages:{...pendingState.pages},npcPositions:pendingState.npcPositions?.map(point=>({...point}))};
measureWorld();
return{version:2,anchor:'feet-v1',position,currentCategory,pages:Object.fromEntries(memberPages),dice1:Number(dice[0].dataset.value),dice2:Number(dice[1].dataset.value),step:Number(player.dataset.step)||0,total:Number(player.dataset.total)||0,targetHandle:player.dataset.target||'',point:{x:Math.max(0,Math.min(1,playerPoint.x/(worldSize.width||1))),y:Math.max(0,Math.min(1,playerPoint.y/(worldSize.height||1)))},heroLand:heroLand?{...heroLand}:null,npcPositions:[...npcStates.values()].map(state=>({handle:state.handle,category:state.category,x:state.point.x,y:state.point.y,restFor:Math.max(0,(state.visitAfter||0)-simClock),...(state.trip?{trip:{from:state.trip.from,to:state.trip.to,start:{...state.trip.start},end:{...state.trip.end},progress:state.trip.duration?state.trip.elapsed/state.trip.duration:0}}:{})})),travel:player.dataset.travel||'walking',direction:player.dataset.direction||'south',phase:player.dataset.phase||'idle',fromCategory:player.dataset.fromCategory||currentCategory,category:player.dataset.category||currentCategory,duration:Number(player.dataset.duration)||0,distance:Number(player.dataset.distance)||0,speed:Number(player.dataset.speed)||0};
}
function validNpcTrip(trip){
  const category=id=>CATEGORIES.some(item=>item.id===id),point=value=>value&&[value.x,value.y].every(number=>Number.isFinite(number)&&number>=0&&number<=1);
  return trip===undefined||trip===null||typeof trip==='object'&&category(trip.from)&&category(trip.to)&&trip.from!==trip.to&&point(trip.start)&&point(trip.end)&&Number.isFinite(trip.progress)&&trip.progress>=0&&trip.progress<=1;
}
function restore(state){

if(destroyed||!state||typeof state!=='object'||!isCurrent())return false;
const{dice1,dice2,step,total,targetHandle,point}=state,category=state.currentCategory??CATEGORIES[Math.max(0,Math.min(6,Math.floor((point?.y||0)*7)))].id,pages=state.pages??{},travel=state.travel??'walking',direction=state.direction??'south',phase=state.phase??'idle',npcPositions=state.npcPositions??[];

if(!CATEGORIES.some(item=>item.id===category)||!Number.isSafeInteger(state.position)||state.position<0||![dice1,dice2].every(value=>Number.isInteger(value)&&value>=1&&value<=6)||!Number.isInteger(total)||total<0||total>12||!Number.isInteger(step)||step<0||step>total||typeof targetHandle!=='string'||targetHandle.length>180||!point||![point.x,point.y].every(value=>Number.isFinite(value)&&value>=0&&value<=1)||!pages||typeof pages!=='object'||Array.isArray(pages)||Object.entries(pages).some(([key,value])=>!CATEGORIES.some(item=>item.id===key)||!Number.isSafeInteger(value)||value<0)||!['walking','boarding','sailing','stopped'].includes(travel)||!['north','south'].includes(direction)||!['idle','dice','boarding','sailing','docking','walking','arrived','cancelled'].includes(phase)||!Array.isArray(npcPositions)||npcPositions.some(value=>!value||typeof value.handle!=='string'||value.handle.length>180||!CATEGORIES.some(item=>item.id===value.category)||![value.x,value.y].every(number=>Number.isFinite(number)&&number>=0&&number<=1)||!validNpcTrip(value.trip)||value.restFor!==undefined&&(!Number.isFinite(value.restFor)||value.restFor<0||value.restFor>180000)))return false;

cancel();
position=state.position;
currentCategory=category;
memberPages=new Map(Object.entries(pages));
measureWorld();
dice.forEach((cube,index)=>{
const value=index?dice2:dice1;
cube.dataset.value=String(value);
cube.style.transform=DICE_ROTATIONS[value];
});
Object.assign(diceBox.dataset,{dice1:String(dice1),dice2:String(dice2),total:String(dice1+dice2)});
diceBox.setAttribute('aria-label',`${dice1} 加 ${dice2} 等於 ${dice1+dice2} 點`);
diceTotal.textContent=`${dice1} + ${dice2} = ${dice1+dice2} 點`;
Object.assign(player.dataset,{step:String(step),total:String(total),target:targetHandle,travel,direction,phase,fromCategory:state.fromCategory||category,category:state.category||category});
setBoatStyle(['boarding','sailing'].includes(travel)&&Object.hasOwn(VESSELS,state.fromCategory)?state.fromCategory:category);
world.dataset.phase=phase;

for(const[key,value]of Object.entries({duration:state.duration??0,distance:state.distance??0,speed:state.speed??0})){
if(Number.isFinite(value)&&value>=0){
player.dataset[key]=String(value);
world.dataset[key]=String(value);
}}
for(const saved of npcPositions){
const row=rowsCache.find(item=>item.handle===saved.handle);
let npc=npcStates.get(saved.handle);
if(!npc){
npc={handle:saved.handle,homeCategory:row?classifyMember(row):saved.category,category:saved.category,row:row||null,element:null,route:[],goal:null,wait:0,moving:false,frozen:false,at:simClock,trip:null};
npcStates.set(saved.handle,npc);
}npc.category=saved.category;
npc.homeCategory=row?classifyMember(row):npc.homeCategory||saved.category;
npc.row=row||null;
npc.frozen=false;
npc.point=isWalkable(saved.category,saved)?{x:saved.x,y:saved.y}:nearestLand(saved.category,saved);
npc.route=[];
npc.goal=null;
npc.moving=false;
npc.at=simClock;
npc.visitAfter=simClock+(saved.restFor||0);
npc.trip=saved.trip?{from:saved.trip.from,to:saved.trip.to,start:isWalkable(saved.trip.from,saved.trip.start)?{...saved.trip.start}:nearestLand(saved.trip.from,saved.trip.start),end:isWalkable(saved.trip.to,saved.trip.end)?{...saved.trip.end}:nearestLand(saved.trip.to,saved.trip.end),progress:saved.trip.progress,elapsed:0,duration:0}:null;
if(npc.trip)buildTripRoute(npc);
drawNpc(npc);
}
if(world.clientWidth<=0||world.clientHeight<=0){
pendingState={...state,currentCategory:category,pages:{...pages},npcPositions:npcPositions.map(value=>({...value})),point:{...point}};
syncLocation();
return true;
}pendingState=null;
playerPoint={x:point.x*world.clientWidth+(state.anchor==='feet-v1'?0:HERO_X),y:point.y*world.clientHeight+(state.anchor==='feet-v1'?0:HERO_Y)};
heroLand=null;
if(!['boarding','sailing'].includes(travel)){
const proposed=state.heroLand&&Number.isFinite(state.heroLand.x)&&Number.isFinite(state.heroLand.y)?state.heroLand:worldToLand(category,playerPoint);
heroLand=isWalkable(category,proposed)?{...proposed}:nearestLand(category,proposed);
playerPoint=landToWorld(category,heroLand);
}drawPlayer();
paintMembers(targetHandle);
syncLocation();
return true;
}

const click=event=>{
const button=event.target.closest('button');
if(!button||!world.contains(button)||destroyed||paused||!isCurrent())return;
if(button.dataset.biSail){
event.stopPropagation();
if(world.dataset.rolling!=='true')onSail?.(button.dataset.biSail);
}else if(button.dataset.biMembersMore){
event.stopPropagation();
if(world.dataset.rolling==='true')return;
const category=button.dataset.biMembersMore,pages=Math.max(1,Math.ceil(membersFor(category).length/pageSize()));
memberPages.set(category,((memberPages.get(category)||0)+1)%pages);
clearArrival();
paintMembers();
}else if(button.hasAttribute('data-bi-npc')){
event.stopPropagation();
const row=rowsCache.find(item=>item.handle===button.dataset.biMember);
if(row?.canChat===false||typeof onChat!=='function')onMember?.(button.dataset.biMember);
else onChat(button.dataset.biMember);
}else if(button.dataset.biMember){
event.stopPropagation();
onMember?.(button.dataset.biMember);
}else if(button.dataset.category){
event.stopPropagation();
onCategory?.(button.dataset.category);
}};
world.addEventListener('click',click);

const observer=typeof view.IntersectionObserver==='function'?new view.IntersectionObserver(entries=>{
for(const entry of entries){
entry.target.dataset.visible=String(entry.isIntersecting&&!paused&&!destroyed);
if(entry.isIntersecting)visible.add(entry.target.dataset.island);
else visible.delete(entry.target.dataset.island);
}if(canSimulate())startRoam();
else stopRoam();
},{root:main||null,rootMargin:'0px',threshold:0}):null;
if(observer)sections.forEach(section=>observer.observe(section));
else sections.forEach(section=>{
visible.add(section.dataset.island);
section.dataset.visible='true';
});

function pause(value){
if(destroyed)return;
paused=!!value;
world.dataset.paused=String(paused);
if(paused)cancel();
else{
measureWorld();
if(pendingState){
const saved=pendingState;
pendingState=null;
restore(saved);
}const viewport=main?.getBoundingClientRect()||{top:0,bottom:view.innerHeight};
for(const section of sections){
const rect=section.getBoundingClientRect(),seen=rect.bottom>=viewport.top&&rect.top<=viewport.bottom;
section.dataset.visible=String(seen);
if(seen)visible.add(section.dataset.island);
else visible.delete(section.dataset.island);
}startRoam();
}}
const visibility=()=>pause(doc.hidden),resize=()=>{
if(world.dataset.rolling==='true')cancel();
stopRoam();
measureWorld();
paintMembers();
},motion=()=>{
if(reduced())cancel();
else startRoam();
};
doc.addEventListener('visibilitychange',visibility);
view.addEventListener('resize',resize);
media?.addEventListener?.('change',motion);

function destroy(){
if(destroyed)return;
clearArrival();
cancel();
destroyed=true;
observer?.disconnect();
doc.removeEventListener('visibilitychange',visibility);
view.removeEventListener('resize',resize);
media?.removeEventListener?.('change',motion);
world.removeEventListener('click',click);
world.remove();
if(ownsDice)diceHost.remove();
else diceHost.replaceChildren();
npcStates.clear();
}
measureWorld();
syncLocation();
bindPictures();

return{renderMembers,showArrival,clearArrival,snapshot,restore,roll,sailTo,residents,memberLocation,currentIsland:()=>currentCategory,cancel,destroy,pause,categories:CATEGORIES};

}
