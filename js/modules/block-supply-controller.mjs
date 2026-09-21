import {GAME_ID,INPUT,STEP_MS,createGame,stepGame,pauseGame,resumeGame,getProgress,getResult,recordInput} from './block-supply-engine.mjs';
import {createBlockRenderer} from './block-supply-renderer.mjs';
import {createSupplyAudio} from './block-supply-audio.mjs';

// Standalone lifecycle adapter. No member, reward or network calls in this phase.
export function createBlockSupply(root,{seed=crypto.getRandomValues(new Uint32Array(1))[0],onComplete=()=>{},onFail=()=>{},onExit=()=>{},onRestart=null,onEvent=()=>{},isCurrent=()=>true,localPreview=true}={}){
 const abort=new AbortController(),listen=(el,event,fn,opts={})=>el.addEventListener(event,fn,{...opts,signal:abort.signal});
 root.innerHTML=`<section class="bs-game" data-mode="welcome" aria-label="方塊補給站">
  <header class="bs-header"><div><small>BASE SUPPORT · ${localPreview?'本機試玩':'每日補給任務'}</small><h1>方塊補給站</h1></div><button data-action="exit">‹ 返回遊戲館</button></header>
  <nav class="bs-tools" aria-label="遊戲設定"><button data-action="pause" disabled>Ⅱ 暫停</button><button data-action="music"></button><button data-action="sound"></button><span class="bs-audio-status" aria-live="polite"></span></nav>
  <div class="bs-hud"><div><small>剩餘時間</small><strong data-value="time">90<span> 秒</span></strong></div><div class="bs-energy"><div><small>基地能源</small><b data-value="energy">0 / 100</b></div><progress aria-label="基地能源" max="100" value="0"></progress></div></div>
  <div class="bs-field"><div class="bs-board"><canvas width="300" height="480" aria-label="10 欄 16 列補給棋盤"></canvas></div><aside><small>NEXT · 下一件</small><canvas class="bs-next" width="120" height="120" aria-label="下一個補給方塊"></canvas><small>本局分數</small><strong data-value="score">0</strong><small>連擊</small><strong data-value="combo">—</strong><small>消除排數</small><strong data-value="lines">0</strong><p class="bs-tip">⚡ 特殊能源<br>消除額外 +10</p></aside>
   <div class="bs-overlay" role="dialog" aria-modal="true" aria-label="遊戲狀態"><div class="bs-panel"></div></div>
  </div><footer class="bs-controls" aria-label="遊戲控制"><button data-input="left" aria-label="向左">◀<span>向左</span></button><button data-input="right" aria-label="向右">▶<span>向右</span></button><button data-input="rotate" aria-label="旋轉">↻<span>旋轉</span></button><button data-input="drop" aria-label="快速落下">⤓<span>快速落下</span></button></footer>
  <div class="bs-footnote">90 秒補滿 100 能源 · ${localPreview?'本機試玩不發點':'遊戲館每日共領 100 點'}</div>
 </section>`;
 const el=root.firstElementChild,$=s=>el.querySelector(s),canvas=$('.bs-board canvas'),panel=$('.bs-panel'),overlay=$('.bs-overlay');
 const renderer=createBlockRenderer(canvas,$('.bs-next')),keys=new Map(),pointers=new Map();
 let s=createGame(seed),mode='welcome',dead=false,raf=0,epoch=0,last=0,acc=0,tap=0,pulses=[],replay=[],finished=false,scroll=null,swipe=null;
 const audio=createSupplyAudio((type,state)=>{if(!dead&&state==='blocked')$('.bs-audio-status').textContent='音訊受限；可重開音訊';});
 const labels={music:'音樂',sound:'音效'};
 function audioButtons(){for(const k of ['music','sound']){const b=$(`[data-action="${k}"]`),enabled=audio.settings[k];b.textContent=`${labels[k]} ${enabled?'開':'關'}`;b.setAttribute('aria-pressed',String(enabled));}}
 function lockScroll(){if(scroll)return;scroll=[document.documentElement.style.overflow,document.body.style.overflow];document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';}
 function unlockScroll(){if(!scroll)return;[document.documentElement.style.overflow,document.body.style.overflow]=scroll;scroll=null;}
 function clearInput(){keys.clear();pointers.clear();tap=0;pulses=[];swipe=null;}
 function stopLoop(){epoch++;cancelAnimationFrame(raf);raf=0;clearInput();}
 function paint(){const p=getProgress(s);$('[data-value="time"]').textContent=`${Math.ceil(p.remainingMs/1000)} 秒`;$('[data-value="energy"]').textContent=`${p.energy} / 100`;$('progress').value=p.energy;$('[data-value="score"]').textContent=s.score;$('[data-value="combo"]').textContent=s.combo>1?`${s.combo} 連擊`:'—';$('[data-value="lines"]').textContent=s.clearedLines;renderer.draw(s);}
 function show(next,content=''){
  mode=next;el.dataset.mode=next;overlay.hidden=next==='playing';panel.innerHTML=content;
  $('[data-action="pause"]').disabled=next!=='playing';
  for(const b of el.querySelectorAll('[data-input]'))b.disabled=next!=='playing';
  if(next!=='playing')panel.querySelector('button')?.focus({preventScroll:true});
 }
 const resultCopy=`<p class="bs-local" role="status">${localPreview?'本機試玩，尚未串接每日獎勵；本局成績尚未上傳。':'正在確認結果，尚未確認獎勵入帳…'}</p>`;
 function finish(){
  if(finished)return;finished=true;stopLoop();unlockScroll();const won=s.state==='won',result=getResult(s);
  audio.finish(won?'win':'lose');paint();
  show(s.state,`<small>${won?'SUPPLY COMPLETE':'TRY AGAIN'}</small><h2>${won?'補給完成':'基地能源不足'}</h2><p>${won?'基地恢復運作，補給任務達成！':`還差 ${Math.max(0,100-s.energy)} 能源。${s.reason==='timeout'?'時間到了。':'補給箱已抵達警戒線。'}`}</p><div class="bs-result"><span>能源 <b>${s.energy}</b></span><span>分數 <b>${s.score}</b></span><span>排數 <b>${s.clearedLines}</b></span></div>${resultCopy}<div class="bs-actions"><button class="bs-primary" data-action="restart">${won?'再玩一次':'重新挑戰'}</button><button data-action="exit">返回遊戲館</button></div>`);
  (won?onComplete:onFail)(result,{seed,replay:replay.map(p=>[...p])});
 }
 function frame(time,g){
  if(dead||mode!=='playing'||g!==epoch)return;raf=0;const dt=time-last;last=time;
  if(!isCurrent()){destroy();onExit();return;}
  if(dt>1000){pause();return;}acc+=Math.max(0,dt);
  while(acc>=STEP_MS&&mode==='playing'){
   const mask=[...keys.values(),...pointers.values()].reduce((a,b)=>a|b,0)|tap|(pulses.shift()||0);tap=0;
   stepGame(s,mask);recordInput(replay,mask);acc-=STEP_MS;
   if(s.state==='won'||s.state==='lost'){finish();return;}
   const event=['warning','combo','clear','land','rotate','move'].find(e=>s.events.includes(e));if(event)audio.play(event);
  }
  paint();raf=requestAnimationFrame(t=>frame(t,g));
 }
 function run(){last=performance.now();const g=++epoch;raf=requestAnimationFrame(t=>frame(t,g));}
 function start(){if(dead||mode!=='welcome')return;audio.start();lockScroll();show('playing');run();}
 function pause(){if(dead||mode!=='playing')return;pauseGame(s);stopLoop();audio.stop();unlockScroll();show('paused','<small>SUPPLY PAUSED</small><h2>補給暫停中</h2><p>時間已暫停，準備好再繼續。</p><div class="bs-actions"><button class="bs-primary" data-action="resume">繼續補給</button><button data-action="exit">返回遊戲館</button></div>');}
 function resume(){if(dead||mode!=='paused')return;resumeGame(s);audio.start();lockScroll();show('playing');run();}
 function restart(){if(dead)return;if(onRestart){onRestart();return;}stopLoop();audio.stop();s=createGame(seed);acc=0;replay=[];finished=false;mode='welcome';paint();start();}
 function destroy(){if(dead)return;dead=true;stopLoop();abort.abort();audio.destroy();unlockScroll();root.replaceChildren();}
 function pulse(bit){pulses.push(bit,0);}
 const codes={ArrowLeft:INPUT.left,ArrowRight:INPUT.right,ArrowDown:INPUT.down,ArrowUp:INPUT.rotate,KeyZ:INPUT.rotate,Space:INPUT.drop};
 listen(window,'keydown',e=>{
  if(e.code==='KeyP'){if(mode==='playing'||mode==='paused'){e.preventDefault();if(!e.repeat)(mode==='playing'?pause:resume)();}return;}
  const bit=codes[e.code];if(!bit||mode!=='playing')return;e.preventDefault();
  if(bit===INPUT.rotate||bit===INPUT.drop){if(!e.repeat)pulse(bit);}else {keys.set(e.code,bit);tap|=bit;}
 });
 listen(window,'keyup',e=>{keys.delete(e.code);});
 for(const b of el.querySelectorAll('[data-input]')){
  listen(b,'pointerdown',e=>{if(mode!=='playing')return;e.preventDefault();b.setPointerCapture(e.pointerId);const bit=INPUT[b.dataset.input];if(bit===INPUT.rotate||bit===INPUT.drop)pulse(bit);else{pointers.set(e.pointerId,bit);tap|=bit;}});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(b,name,e=>pointers.delete(e.pointerId));
 }
 listen(canvas,'pointerdown',e=>{if(mode==='playing'){e.preventDefault();canvas.setPointerCapture(e.pointerId);swipe={id:e.pointerId,x:e.clientX,y:e.clientY};}});
 listen(canvas,'pointerup',e=>{if(!swipe||swipe.id!==e.pointerId||mode!=='playing')return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=null;if(dy>28&&Math.abs(dy)>Math.abs(dx))pulse(INPUT.drop);else if(Math.abs(dx)>24)tap|=dx<0?INPUT.left:INPUT.right;else pulse(INPUT.rotate);});
 for(const name of ['pointercancel','lostpointercapture'])listen(canvas,name,()=>{swipe=null;});
 listen(el,'touchmove',e=>{if(mode==='playing')e.preventDefault();},{passive:false});
 listen(el,'contextmenu',e=>e.preventDefault());
 listen(el,'click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
  if(action==='exit'){destroy();onExit();}else if(action==='start')start();else if(action==='pause')pause();else if(action==='resume')resume();else if(action==='restart')restart();
  else if(action==='music'||action==='sound'){setAudio(action,!audio.settings[action]);}
  else if(action==='confirm')onEvent('confirm');
 });
 listen(window,'blur',pause);listen(document,'visibilitychange',()=>{if(document.hidden)pause();});
 function setAudio(type,value){if(dead)return;$('.bs-audio-status').textContent='';audio[type==='music'?'setMusicEnabled':'setSoundEnabled'](value);audioButtons();}
 audioButtons();paint();show('welcome','<small>MISSION 02 · 基地補給任務</small><h2>基地需要你的支援</h2><p>基地剛完成防禦戰，急需補充能源。排列補給箱、完成能源線，恢復基地運作。</p><p><b>90 秒內累積 100 能源</b><br>填滿一排獲得 20 能源，連消與 ⚡ 有加成。避免堆到頂部警戒線。</p><p class="bs-instructions">手機：下方按鈕移動、旋轉與落下<br>鍵盤：← → 移動 · ↓ 加速 · ↑ / Z 旋轉<br>Space 快速落下 · P 暫停</p><button class="bs-primary" data-action="start">開始補給</button>');
 const notifyState=()=>{if(mode==='paused')onEvent('game_pause');else if(mode==='playing')onEvent('game_resume');};
 const observer=new MutationObserver(notifyState);observer.observe(el,{attributes:true,attributeFilter:['data-mode']});abort.signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
 return {gameId:GAME_ID,start,pause,resume,restart,destroy,getScore:()=>s.score,getProgress:()=>getProgress(s),getResult:()=>getResult(s),setMusicEnabled:v=>setAudio('music',v),setSoundEnabled:v=>setAudio('sound',v),
  setRewardStatus(message,{retry=false}={}){if(dead)return;const text=$('.bs-local');if(text)text.textContent=message;let b=$('[data-action="confirm"]');if(!b&&retry){b=document.createElement('button');b.dataset.action='confirm';b.textContent='重新確認獎勵';panel.append(b);}if(b)b.hidden=!retry;}
 };
}
