import {gameAPI,gameUser,gameEvent,deviceType,pendingGame,refreshGamePoints} from './game-session.mjs?v=1';
const games=[{id:'tank_defense',name:'坦克守衛挑戰',tag:'DEFEND THE BASE',icon:'▰',description:'守住基地，擊敗 5 輛敵方坦克',className:'gc-tank'},
 {id:'block_supply',name:'方塊補給站',tag:'RESTORE THE ENERGY',icon:'▦',description:'90 秒排列補給方塊，累積 100 能源',className:'gc-block'},
 {id:'gomoku',name:'喵喵五子棋',tag:'FIVE PAWS IN A ROW',icon:'🐾',description:'五顆相連，和小貓一起享受下棋時光',className:'gc-gomoku'}];
let dialog,host,owner='',generation=0,controller=null,currentSession=null,busy=false,confirming=false,returnFocus,midnightTimer;
const current=()=>owner===gameUser()&&dialog?.open;
const $=s=>dialog?.querySelector(s);
function styles(){for(const name of ['game-center','block-supply','gomoku'])if(!document.querySelector(`[data-game-style="${name}"]`)){const l=document.createElement('link');l.rel='stylesheet';l.href=new URL(`../../css/${name}.css?v=2`,import.meta.url).href;l.dataset.gameStyle=name;document.head.append(l);}}
function ensure(){
 if(dialog)return;styles();dialog=document.createElement('dialog');dialog.className='gc-dialog';dialog.setAttribute('aria-label','LINE 遊戲館');
 dialog.innerHTML='<div class="gc-lobby"><header><div><small>PLAY · CONNECT · REWARD</small><h1>LINE 遊戲館</h1></div><button data-gc="close">返回每日任務</button></header><section class="gc-summary"><small>今日點數挑戰</small><h2>每日獎勵 <b>100</b> 點</h2><p data-gc-status role="status">讀取今日狀態…</p><div class="gc-stats"><span>連續遊玩 <b data-streak>—</b> 天</span><span>本週完成 <b data-week>—</b> 次</span></div><button data-gc="refresh">重新整理</button><button data-gc="confirm" hidden>重新確認獎勵</button></section><div class="gc-cards"></div><p class="gc-note">兩款遊戲共用每日 100 點上限 · 台灣時間每日重置<br>已領獎仍能遊玩並保存成績，簽到獎勵不受影響。</p></div><div class="gc-game" hidden></div>';
 $('.gc-cards').innerHTML=games.map(g=>`<article><div class="gc-cover ${g.className}" aria-hidden="true"><span>${g.icon}</span><small>${g.tag}</small></div><div class="gc-card-content"><h2>${g.name}</h2><p>${g.description}</p><p data-complete="${g.id}">讀取完成狀態…</p><p>個人最高分 <b data-best="${g.id}">—</b></p><button data-gc="play" data-game="${g.id}">開始遊戲</button></div></article>`).join('');
 document.body.append(dialog);host=$('.gc-game');
 $('.gc-note').textContent='三款遊戲共用每日 100 點上限 · 台灣時間每日重置。已領獎仍能挑戰並保存成績；自由練習不計分、不發點，簽到獎勵不受影響。';
 const gomokuButton=$('[data-game="gomoku"]');gomokuButton.textContent='每日挑戰 · 標準難度';
 const practice=document.createElement('button');practice.dataset.gc='practice';practice.textContent='自由練習 · 三種難度';gomokuButton.after(practice);
 const explore=document.createElement('article');
 explore.innerHTML='<div class="gc-cover" aria-hidden="true"><span>🎲</span><small>EXPLORE THE STORES</small></div><div class="gc-card-content"><h2>商城大富翁</h2><p>擲骰前進，隨機逛逛已上架的商城。</p><p>自由探索 · 不贈點、不列入每日挑戰</p><button data-gc="explore-store">開始逛商城</button></div>';
 $('.gc-cards').append(explore);
 dialog.addEventListener('cancel',e=>{if(e.target!==dialog)return;e.preventDefault();close();});
 dialog.addEventListener('click',e=>{const b=e.target.closest('[data-gc]');if(!b)return;const action=b.dataset.gc;if(action==='close')close();if(action==='refresh')void refresh();if(action==='play')void play(b.dataset.game);if(action==='practice')void practiceGomoku();if(action==='explore-store')exploreStores();if(action==='confirm')void confirm();});
}
function exploreStores(){
 if(busy||!current())return;
 if(typeof window.openStoreRichman!=='function'){$('[data-gc-status]').textContent='商城大富翁尚未載入，請重新整理。';return;}
 const returnPage=window.currentPage||'home';close();
 void window.openStoreRichman({onExit:()=>{window.goPage(returnPage,true);openGameCenter();}});
}
function close(){generation++;clearTimeout(midnightTimer);controller?.destroy();controller=null;currentSession=null;dialog?.close();document.documentElement.style.overflow=dialog?.dataset.overflow||'';returnFocus?.focus?.();}
async function refresh(){
 if(!current())return;const version=generation;clearTimeout(midnightTimer);$('[data-gc-status]').textContent='讀取今日狀態…';$('[data-gc="confirm"]').hidden=!pendingGame();
 try{const data=await gameAPI('gameCenterStatus');if(version!==generation||!current())return;
  $('[data-gc-status]').textContent=data.message;$('[data-streak]').textContent=data.streak;$('[data-week]').textContent=data.weeklyCompletions;
  for(const g of data.games){const status=$(`[data-complete="${g.gameId}"]`);if(!status)continue;status.textContent=(g.completedToday?'今日已完成':'今日尚未完成')+' · '+(data.state==='available'?'可挑戰領獎':data.state==='pending'?'獎勵待確認':'今日已領獎');$(`[data-best="${g.gameId}"]`).textContent=g.bestScore;}
  const now=Date.now(),next=Math.floor((now+28800000)/86400000)*86400000+86400000-28800000;midnightTimer=setTimeout(()=>void refresh(),next-now+500);
 }catch(e){if(version===generation&&current())$('[data-gc-status]').textContent=e.message;}
}
function lobby(){controller?.destroy();controller=null;currentSession=null;host.hidden=true;$('.gc-lobby').hidden=false;void refresh();}
async function practiceGomoku(){
 if(busy||!current())return;busy=true;const version=++generation,member=owner;
 try{const module=await import('./gomoku-controller.mjs?v=2');if(version!==generation||!current())return;
  controller?.destroy();currentSession=null;$('.gc-lobby').hidden=true;host.hidden=false;
  controller=module.createGomoku(host,{exitLabel:'返回遊戲館',isCurrent:()=>version===generation&&member===gameUser()&&current(),onExit:lobby});
 }catch(e){if(version===generation&&current())$('[data-gc-status]').textContent=e.message;}finally{busy=false;}
}
async function confirm(){
 if(confirming)return;const proof=pendingGame(),member=gameUser();if(!proof){void refresh();return;}confirming=true;
 controller?.setRewardStatus('正在確認結果，尚未確認獎勵入帳…');
 try{const data=await gameAPI('completeGame',proof);if(member!==gameUser())return;
  if(data.state==='completed'||data.state==='failed')pendingGame(null,member);
  controller?.setRewardStatus(data.message,{retry:data.state==='pending'});if(current())$('[data-gc-status]').textContent=data.message;refreshGamePoints(data);
 }catch(e){if(member===gameUser()){controller?.setRewardStatus(e.message,{retry:true});if(current())$('[data-gc-status]').textContent=e.message;}}
 finally{confirming=false;if(current())$('[data-gc="confirm"]').hidden=!pendingGame();}
}
async function play(gameId,replay=false){
 if(busy||!current())return;
 if(gameId==='tank_defense'){
  void gameEvent('game_card_click',null,gameId);
  if(typeof window.startDailyTankChallenge!=='function'){$('[data-gc-status]').textContent='坦克遊戲尚未載入，請重新整理。';return;}
  await window.startDailyTankChallenge({onExit:()=>void refresh(),fromGameCenter:true});return;
 }
 if(!['block_supply','gomoku'].includes(gameId))return;
 if(pendingGame()){controller?.setRewardStatus('上一局結果尚待確認，請先按「重新確認獎勵」。',{retry:true});$('[data-gc-status]').textContent='上一局結果尚待確認，請先重新確認獎勵。';return;}
 busy=true;const version=++generation,member=owner;void gameEvent('game_card_click',null,gameId);
 if(gameId==='gomoku'&&controller){controller.destroy();controller=null;currentSession=null;host.hidden=true;$('.gc-lobby').hidden=false;}
 $('[data-gc-status]').textContent=gameId==='gomoku'?'正在準備喵喵五子棋…':'正在準備補給任務…';controller?.setRewardStatus('正在準備下一局…');
 try{
  const [module,session]=await Promise.all([gameId==='gomoku'?import('./gomoku-controller.mjs?v=2'):import('./block-supply-controller.mjs?v=3'),gameAPI('startGame',{gameId,replay,deviceType:deviceType()})]);
  if(version!==generation||!current())return;
  controller?.destroy();currentSession=session;$('.gc-lobby').hidden=true;host.hidden=false;
  const done=(_result,proof)=>{if(version!==generation||member!==gameUser()||!current())return;pendingGame({sessionId:session.sessionId,gameId,nonce:session.nonce,replay:proof.replay},member);void confirm();};
  const create=gameId==='gomoku'?module.createGomoku:module.createBlockSupply;
  controller=create(host,{seed:session.seed,exitLabel:'返回遊戲館',challenge:gameId==='gomoku',localPreview:false,isCurrent:()=>member===gameUser()&&current(),onComplete:done,onFail:done,onRestart:()=>void play(gameId,true),onExit:()=>{void gameEvent('game_exit',session);lobby();},onEvent:type=>{if(type==='confirm')void confirm();else void gameEvent(type,session);}});
 }catch(e){if(version===generation&&current()){controller?.setRewardStatus(e.message,{retry:!!pendingGame()});$('[data-gc-status]').textContent=e.message;}}
 finally{busy=false;}
}
export function openGameCenter(){
 if(!gameUser()){window.showToast?.('請重新進入 LINE LIFF 登入後挑戰',true);return;}
 ensure();if(dialog.open)return;owner=gameUser();returnFocus=document.activeElement;dialog.dataset.overflow=document.documentElement.style.overflow;dialog.showModal();document.documentElement.style.overflow='hidden';generation++;lobby();void gameEvent('game_center_view');
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&current()&&!controller)void refresh();});
window.openGameCenter=openGameCenter;
document.getElementById('game-center-open')?.addEventListener('click',openGameCenter);
