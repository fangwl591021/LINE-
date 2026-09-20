import {createGame,stepGame,recordInput,WIDTH,HEIGHT,FPS} from './tank-engine.mjs';

const task=document.getElementById('daily-tank-task');
const $=id=>document.getElementById(id);
let dialog,game,replay=[],session,owner='',frame=0,last=0,acc=0,run=0,playing=false,submitting=false;
let keys=new Set(),stick=0,fire=false,audio=null,sound=true,paused=false,statusGeneration=0,rolloverTimer;
const uid=()=>window.currentUserProfile?.userId||'';
const storeKey=()=>`daily-tank-pending:${uid()}`;
function saved(){try{return JSON.parse(sessionStorage.getItem(storeKey())||'null');}catch{return null;}}
function save(value){try{value?sessionStorage.setItem(storeKey(),JSON.stringify(value)):sessionStorage.removeItem(storeKey());}catch{/* Optional recovery only; never an award record. */}}
async function api(action,payload={}) {
  if(!uid()||typeof window.fetchAPI!=='function')throw Error('請重新進入 LINE LIFF 登入後挑戰');
  const res=await window.fetchAPI(action,payload,true);
  if(!res||res.success===false||res.error)throw Error(res?.error||'無法確認獎勵，請稍後重試');
  return res.data||res;
}
function taskState(data) {
  if(!task)return;
  $('daily-tank-status').textContent=data.message||'每日首次破關贈送 100 點';
  $('daily-tank-start').textContent=playing?'挑戰中':data.state==='completed'?'今日已完成':'開始挑戰';
  $('daily-tank-start').disabled=playing||data.state==='completed';
  $('daily-tank-practice').hidden=data.state!=='completed';
  $('daily-tank-confirm').hidden=data.state!=='pending'&&!saved();
}
export async function refreshDailyTankStatus() {
  if(!task||!uid()||playing)return;
  const generation=++statusGeneration,member=uid();
  try{
    const pending=saved();
    const data=await api('dailyTankStatus');
    if(member!==uid()||generation!==statusGeneration)return;
    if(data.state==='completed'&&(!pending?.date||pending.date===data.date))save(null);
    taskState(data);
    clearTimeout(rolloverTimer);
    const now=Date.now(),next=Math.floor((now+28800000)/86400000)*86400000+86400000-28800000;
    rolloverTimer=setTimeout(()=>{if(!document.hidden)void refreshDailyTankStatus();},next-now+500);
  }catch(e){if(generation===statusGeneration)taskState({message:e.message});}
}
function initSound() {
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!audio&&Audio)audio=new Audio();
    if(audio?.state==='suspended')void audio.resume().catch(()=>{});
  }catch{audio=null;}
}
function tone(kind) {
  if(!sound||!audio||audio.state!=='running')return;
  try{
    const notes={fire:[460,.055],enemyFire:[160,.05],hit:[75,.16],win:[680,.4],lose:[95,.5]};
    const [frequency,duration]=notes[kind]||notes.hit;
    const osc=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime;
    osc.type=kind==='win'?'sine':'triangle';osc.frequency.setValueAtTime(frequency,t);
    osc.frequency.exponentialRampToValueAtTime(kind==='win'?1020:Math.max(35,frequency/2),t+duration);
    gain.gain.setValueAtTime(.055,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+duration);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }catch{/* Muted/unsupported audio never stops simulation. */}
}
function ensureDialog() {
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.className='tank-dialog';dialog.id='daily-tank-dialog';
  dialog.setAttribute('aria-label','坦克守衛挑戰');
  dialog.innerHTML=`<header class="tank-toolbar"><strong>坦克守衛挑戰</strong><nav><button type="button" data-tank="sound" aria-pressed="true">音效：開</button><button type="button" data-tank="close">返回每日任務</button></nav></header>
    <div class="tank-hud" aria-live="off"><span id="tank-life">生命 ♥♥♥</span><span id="tank-kills">擊敗 0 / 5</span><span>守住基地</span></div>
    <div class="tank-stage"><canvas id="tank-canvas" width="720" height="432" aria-label="坦克遊戲：方向鍵或 WASD 移動，空白鍵射擊"></canvas>
      <div class="tank-result" id="tank-result"><div><h2 id="tank-result-title">準備挑戰</h2><p id="tank-result-message" role="status" aria-live="polite">正在準備遊戲…</p><nav><button type="button" data-tank="retry" hidden>重新確認獎勵</button><button type="button" data-tank="again" hidden>再玩一次</button><button type="button" data-tank="resume" hidden>繼續挑戰</button><button type="button" data-tank="close">返回每日任務</button></nav></div></div>
    </div><div class="tank-controls"><div class="tank-stick" id="tank-stick" role="group" aria-label="移動搖桿"><span></span></div><p class="tank-control-help">建議橫向遊玩<br>方向鍵 / WASD 移動 · 空白鍵射擊<br>3 條生命，擊敗 5 輛敵車</p><button class="tank-fire" id="tank-fire" type="button" aria-label="持續射擊">射擊</button></div>`;
  document.body.append(dialog);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('click',e=>{
    const action=e.target.closest('[data-tank]')?.dataset.tank;
    if(action==='close')close();
    if(action==='again')void start();
    if(action==='retry')void confirmReward();
    if(action==='resume'){paused=false;last=0;$('tank-result').hidden=true;initSound();}
    if(action==='sound'){sound=!sound;e.target.textContent=`音效：${sound?'開':'關'}`;e.target.setAttribute('aria-pressed',String(sound));if(sound)initSound();}
  });
  const pad=$('tank-stick');let pointer=null;
  const update=e=>{
    if(e.pointerId!==pointer)return;
    const r=pad.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2;
    stick=Math.hypot(dx,dy)<9?0:Math.abs(dx)>Math.abs(dy)?(dx>0?2:8):(dy>0?4:1);
    const scale=Math.min(1,28/Math.max(1,Math.hypot(dx,dy)));
    pad.firstElementChild.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;e.preventDefault();
  };
  pad.addEventListener('pointerdown',e=>{if(pointer!==null)return;pointer=e.pointerId;pad.setPointerCapture(pointer);update(e);});
  pad.addEventListener('pointermove',update);
  const release=e=>{if(e.pointerId===pointer){pointer=null;stick=0;pad.firstElementChild.style.transform='';}};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,release);
  $('tank-fire').addEventListener('pointerdown',e=>{fire=true;e.target.setPointerCapture(e.pointerId);e.preventDefault();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])$('tank-fire').addEventListener(event,()=>{fire=false;});
  dialog.addEventListener('contextmenu',e=>e.preventDefault());
  dialog.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
}
function result(title,message,{retry=false,again=false,resume=false}={}) {
  if(!dialog?.open)return;
  $('tank-result').hidden=false;$('tank-result-title').textContent=title;$('tank-result-message').textContent=message;
  dialog.querySelector('[data-tank="retry"]').hidden=!retry;
  dialog.querySelector('[data-tank="again"]').hidden=!again;
  dialog.querySelector('[data-tank="resume"]').hidden=!resume;
}
function close() {
  run++;playing=false;paused=false;keys.clear();stick=0;fire=false;cancelAnimationFrame(frame);
  dialog?.close();document.documentElement.style.overflow=dialog?.dataset.previousOverflow||'';
  if(audio){void audio.close().catch(()=>{});audio=null;}
  void refreshDailyTankStatus();$('daily-tank-start')?.focus();
}
async function start() {
  if(submitting)return;
  if(!uid())return window.showToast?.('請重新進入 LINE LIFF 登入後挑戰',true);
  initSound();ensureDialog();
  if(!dialog.open){dialog.dataset.previousOverflow=document.documentElement.style.overflow;dialog.showModal();document.documentElement.style.overflow='hidden';}
  const generation=++run;++statusGeneration;owner=uid();playing=false;paused=false;keys.clear();stick=0;fire=false;
  cancelAnimationFrame(frame);result('準備挑戰','正在取得挑戰憑證…');
  try{
    const data=await api('startDailyTank');
    if(generation!==run||owner!==uid())return;
    session=data;game=createGame(data.seed);replay=[];playing=true;acc=0;last=0;
    taskState({});$('tank-result').hidden=true;frame=requestAnimationFrame(loop);
  }catch(e){if(generation===run)result('暫時無法開始',e.message,{again:true});}
}
function inputMask() {
  return stick|(keys.has('ArrowUp')||keys.has('w')?1:0)|(keys.has('ArrowRight')||keys.has('d')?2:0)|
    (keys.has('ArrowDown')||keys.has('s')?4:0)|(keys.has('ArrowLeft')||keys.has('a')?8:0)|(fire||keys.has(' ')?16:0);
}
function loop(time) {
  if(!playing)return;
  if(owner!==uid()){close();return;}
  if(!last)last=time;
  if(!paused)acc+=Math.min(100,time-last);last=time;
  while(!paused&&acc>=1000/FPS&&playing) {
    const mask=inputMask();recordInput(replay,mask);stepGame(game,mask);acc-=1000/FPS;
    game.events.forEach(tone);
    if(game.state!=='playing'){
      playing=false;keys.clear();stick=0;fire=false;
      if(game.state==='won'){
        save({sessionId:session.sessionId,date:session.date,replay});
        result('挑戰成功','正在確認今日獎勵，尚未確認入帳…');void confirmReward();
      }else result('挑戰失敗',game.base.alive?'生命用盡或時間已到，再試一次吧！':'基地失守了，再試一次吧！',{again:true});
      taskState({message:game.state==='won'?'破關成功，正在確認獎勵':'可重新挑戰，首次破關才會贈點'});
    }
  }
  draw();if(playing)frame=requestAnimationFrame(loop);
}
function drawTank(ctx,t,color) {
  ctx.save();ctx.translate(t.x+13,t.y+13);ctx.rotate(t.dir*Math.PI/2);
  ctx.fillStyle='#0b1c24';ctx.fillRect(-14,-13,7,26);ctx.fillRect(7,-13,7,26);
  ctx.fillStyle=color;ctx.fillRect(-9,-11,18,22);ctx.fillStyle='#f5f5df';ctx.fillRect(-2,-20,4,16);
  ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#082a2b';ctx.stroke();ctx.restore();
}
function draw() {
  if(!game)return;
  const ctx=$('tank-canvas').getContext('2d');if(!ctx)return;
  ctx.fillStyle='#18373a';ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.strokeStyle='#254649';ctx.lineWidth=1;
  for(let x=0;x<=WIDTH;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,HEIGHT);ctx.stroke();}
  for(let y=0;y<=HEIGHT;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WIDTH,y);ctx.stroke();}
  for(const w of game.walls){ctx.fillStyle=w.baseWall?'#d0a465':'#aa7955';ctx.fillRect(w.x+1,w.y+1,22,22);ctx.strokeStyle='#694b36';ctx.strokeRect(w.x+1,w.y+1,22,22);ctx.beginPath();ctx.moveTo(w.x,w.y+12);ctx.lineTo(w.x+24,w.y+12);ctx.moveTo(w.x+12,w.y);ctx.lineTo(w.x+12,w.y+12);ctx.stroke();}
  const b=game.base;ctx.fillStyle=b.alive?'#b9efcf':'#ef8769';ctx.beginPath();ctx.moveTo(b.x+12,b.y+2);ctx.lineTo(b.x+22,b.y+7);ctx.lineTo(b.x+19,b.y+18);ctx.lineTo(b.x+12,b.y+23);ctx.lineTo(b.x+5,b.y+18);ctx.lineTo(b.x+2,b.y+7);ctx.closePath();ctx.fill();ctx.fillStyle='#185d49';ctx.fillRect(b.x+10,b.y+6,4,12);
  ctx.globalAlpha=game.player.shield>0&&Math.floor(game.ticks/4)%2?0.45:1;
  drawTank(ctx,game.player,'#7be2ba');ctx.globalAlpha=1;
  game.enemies.forEach(e=>drawTank(ctx,e,'#ee9971'));
  for(const bullet of game.bullets){ctx.fillStyle=bullet.enemy?'#ffbc77':'#fff5b9';ctx.fillRect(bullet.x-1,bullet.y-1,6,6);}
  $('tank-life').textContent='生命 '+('♥'.repeat(game.lives))+('♡'.repeat(3-game.lives));
  $('tank-kills').textContent=`擊敗 ${game.kills} / 5`;
}
async function confirmReward() {
  if(submitting)return;
  const member=uid(),proof=saved();submitting=true;
  try{
    const data=await api(proof?'completeDailyTank':'dailyTankStatus',proof||{});
    if(member!==uid())return;
    if(data.state==='completed'){
      save(null);taskState(data);result('挑戰成功',data.message,{again:true});
      void refreshDailyTankStatus();
      window.pointWalletData=null;
      if(Number.isFinite(data.balance))window.renderPointBalanceState?.('ready',{balance:data.balance});
      void window.loadPointsWallet?.(true);
    }else{
      const message=data.state==='pending'?data.message:'尚未送出破關結果，請完成挑戰後領取獎勵。';
      taskState({...data,message});result('獎勵待確認',message,{retry:true,again:true});
    }
  }catch(e){if(member===uid()){taskState({state:'pending',message:e.message});result('獎勵待確認',e.message,{retry:true});}}
  finally{submitting=false;}
}
const recognized=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d',' '];
document.addEventListener('keydown',e=>{const key=e.key.length===1?e.key.toLowerCase():e.key;if(dialog?.open&&recognized.includes(key)){e.preventDefault();keys.add(key);}});
document.addEventListener('keyup',e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));
function pause(){keys.clear();stick=0;fire=false;if(playing){paused=true;result('挑戰暫停','按繼續後恢復遊戲。',{resume:true});}}
window.addEventListener('blur',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else if(!playing)void refreshDailyTankStatus();});
window.startDailyTankChallenge=start;window.refreshDailyTankStatus=refreshDailyTankStatus;
if(task){
  $('daily-tank-start').addEventListener('click',()=>void start());
  $('daily-tank-practice').addEventListener('click',()=>void start());
  $('daily-tank-confirm').addEventListener('click',()=>void confirmReward());
  const page=$('page-points-wallet');
  if(page)new MutationObserver(()=>{if(!page.classList.contains('hidden'))void refreshDailyTankStatus();}).observe(page,{attributes:true,attributeFilter:['class']});
  if(page&&!page.classList.contains('hidden'))void refreshDailyTankStatus();
}
