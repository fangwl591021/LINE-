import {createGame,placeMove,undoTurn,chooseMove,SIZE,HUMAN,BOT} from './gomoku-engine.mjs';
import {createGomokuAudio} from './gomoku-audio.mjs';
const ART=new URL('../../assets/gomoku/cat-friends-v1.png',import.meta.url).href;
const PAW='<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><ellipse cx="16" cy="23" rx="9" ry="7"/><ellipse cx="5" cy="13" rx="4" ry="5" transform="rotate(-25 5 13)"/><ellipse cx="12" cy="7" rx="4" ry="5"/><ellipse cx="22" cy="8" rx="4" ry="5"/><ellipse cx="28" cy="16" rx="3.5" ry="5" transform="rotate(25 28 16)"/></svg>';
export function createGomoku(host,{onExit=()=>{},exitLabel='離開預覽',challenge=false,seed=0,isCurrent=()=>true,onComplete=()=>{},onRestart=()=>{},onEvent=()=>{}}={}){
  let game=createGame(),selected=null,level='normal',started=false,dead=false,busy=false,generation=0,worker=null,timer=null,workerTimer=null,sequence=0,pendingJob=null;
  const events=new AbortController(),signal=events.signal;
  host.innerHTML=`<div class="meow-app"><nav class="meow-nav"><div class="meow-brand">${PAW}<span>點數通・遊戲時光</span></div><span class="meow-preview">LOCAL PLAY / 本機試玩</span><button class="meow-exit" data-action="exit" aria-label="離開預覽">離開 ↗</button></nav><div class="meow-layout"><section><div class="meow-intro"><div class="meow-eyebrow">A LITTLE PAUSE, A LITTLE PLAY</div><h1>喵喵<span>五子棋</span></h1><p class="meow-lead">放慢一點，和小貓下盤棋。<br>把五顆小棋子，連成今天的小確幸。</p><img class="meow-art" src="${ART}" alt="原創橘貓與灰貓一起玩木製五子棋" width="1536" height="1024"></div><div class="meow-setting-label">選一位小對手 <small>隨時開始新的一局</small></div><div class="meow-levels" role="group" aria-label="電腦難度"><button data-level="easy" aria-pressed="false">小貓入門</button><button data-level="normal" aria-pressed="true">貓咪高手</button><button data-level="hard" aria-pressed="false">貓王挑戰</button></div><p class="meow-help"><b>很簡單，也很療癒。</b><br>你先下深色棋，灰灰下奶白棋。<br>橫、直、斜連成五顆以上，就贏了！<br>先選棋盤交叉點，再按「確認落子」。</p></section><section class="meow-panel" aria-label="五子棋遊戲"><div class="meow-players"><div class="meow-player"><span class="meow-avatar" aria-hidden="true">🐱</span><div><strong>你 · 小橘</strong><small><i class="meow-stone-dot"></i>深色棋先手</small></div></div><span class="meow-versus">VS</span><div class="meow-player"><div><strong>灰灰 · 電腦</strong><small><i class="meow-stone-dot white"></i><span data-opponent>貓咪高手</span></small></div><span class="meow-avatar gray" aria-hidden="true">🐈‍⬛</span></div></div><div class="meow-turnbar"><span data-status role="status" aria-live="polite">準備好和灰灰玩了嗎？</span><small data-count>第 0 手</small></div><div class="meow-board-wrap"><canvas class="meow-board" width="960" height="960" tabindex="0" role="application" aria-label="15乘15五子棋盤。方向鍵選位置，Enter確認。"></canvas><div class="meow-welcome"><div class="paw-large">🐾</div><h2>五顆相連，快樂加一點</h2><p>慢慢想，不用趕。<br>這裡是練習模式，隨時都能再來一局。</p><button class="meow-primary" data-action="start">開始和小貓下棋 →</button></div></div><div class="meow-actions"><div class="meow-placement" data-placement>還沒選擇落點<small>點交叉點預覽，不會直接落子</small></div><button class="meow-primary" data-action="confirm" disabled>確認落子</button></div><div class="meow-tools"><button data-action="undo" disabled>↶ 悔一步</button><button data-action="hint" disabled>✧ 小提示</button><button data-action="restart">↻ 重開</button><button data-action="music" aria-pressed="true">♫ 音樂開</button><button data-action="sound" aria-pressed="true">♪ 音效開</button></div><div class="meow-note" data-note role="status"></div></section></div><footer class="meow-bottom">15 × 15 自由五子棋 · 原創小貓陪你玩<br>本機練習預覽，不登入、不扣點、不發送獎勵</footer><dialog class="meow-modal" aria-labelledby="meow-result-title"><div class="meow-confetti">🐾</div><h2 id="meow-result-title"></h2><p data-result></p><button class="meow-primary" data-action="again">再來一局</button><div class="meow-tools"><button data-action="close-result">看看棋盤</button></div></dialog><dialog class="meow-modal" data-reset-dialog aria-labelledby="meow-reset-title"><h2 id="meow-reset-title">重新開始這一局？</h2><p>這一局的棋盤會清空。<br>練習不影響任何點數。</p><button class="meow-primary" data-action="reset-yes">開始新局</button><div class="meow-tools"><button data-action="reset-no">繼續這局</button></div></dialog></div>`;
  const root=host.firstElementChild,$=selector=>root.querySelector(selector),canvas=$('canvas'),ctx=canvas.getContext('2d'),resultDialog=$('.meow-modal'),resetDialog=$('[data-reset-dialog]');
  let reported=false;
  $('.meow-help').innerHTML='<b>很簡單，也很療癒。</b><br>你先下橘貓，灰灰下灰貓。<br>橫、直、斜連成五隻以上，就贏了！<br>先選棋盤交叉點，再按「確認落子」。';
  $('.meow-player small').innerHTML='<i class="meow-stone-dot"></i>橘貓先手';
  $('.meow-exit').setAttribute('aria-label',exitLabel);
  $('.meow-preview').textContent=challenge?'DAILY CHALLENGE / 每日挑戰':'FREE PLAY / 自由練習';
  $('.meow-bottom').textContent=challenge?'標準難度 · 勝局由後端驗證 · 三款遊戲共用每日 100 點上限':'15 × 15 自由五子棋 · 練習不登入、不扣點、不發送獎勵';
  if(challenge){
    for(const selector of ['.meow-setting-label','.meow-levels','[data-action=undo]','[data-action=hint]'])$(selector).hidden=true;
    $('.meow-welcome p').textContent='戰勝灰灰即可參加每日 100 點獎勵。標準難度，不使用悔棋與提示；已領獎仍可保存成績。';
    $('[data-reset-dialog] p').textContent='這局會放棄，並重新取得挑戰憑證。不扣點。';
    $('[data-action=start]').textContent='開始今日挑戰 →';
    const retry=document.createElement('button');retry.dataset.action='confirm-reward';retry.textContent='重新確認獎勵';retry.hidden=true;resultDialog.append(retry);
    const exit=document.createElement('button');exit.dataset.action='exit';exit.textContent='返回遊戲館';resultDialog.append(exit);
  }
  let requestedLevel=level;
  const note=text=>{$('[data-note]').textContent=text;};
  const usable=()=>{if(dead)return false;if(!isCurrent()){note('登入身分已變更，請返回遊戲館重新進入。');return false;}return true;};
  const audio=createGomokuAudio(note);
  function cancelAI(){generation++;clearTimeout(timer);clearTimeout(workerTimer);timer=null;workerTimer=null;worker?.terminate();worker=null;pendingJob=null;busy=false;}
  function compute(side,onDone){
    const version=generation,id=++sequence;busy=true;render();
    const done=move=>{if(!usable()||version!==generation||pendingJob!==id)return;clearTimeout(workerTimer);pendingJob=null;busy=false;onDone(move);};
    pendingJob=id;
    const fallback=()=>{worker?.terminate();worker=null;const move=chooseMove(game.board,side,level,seed);done(move);};
    try{worker??=new Worker(new URL('./gomoku-ai-worker.mjs',import.meta.url),{type:'module'});worker.onmessage=event=>{if(event.data.id!==id)return;if(event.data.error)fallback();else done(event.data.move);};worker.onerror=fallback;workerTimer=setTimeout(fallback,3500);worker.postMessage({id,board:game.board,side,level,seed});}catch{fallback();}
  }
  function stone(x,y,side,ghost=false,last=false){
    const orange=side===HUMAN;ctx.save();ctx.translate(30+x*30,30+y*30);ctx.globalAlpha=ghost?.48:1;
    ctx.shadowColor='#553c3940';ctx.shadowBlur=2;ctx.shadowOffsetY=1.5;
    const fur=ctx.createLinearGradient(0,-13,0,12);fur.addColorStop(0,orange?'#ffcf7e':'#c3c8d5');fur.addColorStop(1,orange?'#e7943f':'#7e899e');
    ctx.fillStyle=fur;ctx.strokeStyle=orange?'#bb7336':'#5d677b';ctx.lineWidth=.8;
    // One continuous silhouette keeps both ears crisp at small mobile sizes.
    ctx.beginPath();ctx.moveTo(-11,-2);ctx.lineTo(-10.5,-12.5);ctx.quadraticCurveTo(-10,-14,-8.5,-12.5);ctx.lineTo(-4,-8);ctx.quadraticCurveTo(0,-9.5,4,-8);ctx.lineTo(8.5,-12.5);ctx.quadraticCurveTo(10,-14,10.5,-12.5);ctx.lineTo(11,-2);ctx.bezierCurveTo(16,14,-16,14,-11,-2);ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowColor='transparent';
    ctx.fillStyle='#edaaa0';for(const sign of [-1,1]){ctx.beginPath();ctx.moveTo(sign*8.8,-10.2);ctx.lineTo(sign*5.8,-7.1);ctx.lineTo(sign*9.1,-5);ctx.closePath();ctx.fill();}
    ctx.fillStyle=orange?'#c67a32':'#657184';for(const dx of [-3,0,3]){ctx.beginPath();ctx.ellipse(dx,-6,dx===0?1:0.7,2.1,dx*.12,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=orange?'#fff1d8':'#f1f2f7';ctx.beginPath();ctx.ellipse(0,5.5,6.6,4.5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#30303b';for(const dx of [-4.8,4.8]){ctx.beginPath();ctx.ellipse(dx,.1,2,2.7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(dx-.5,-.8,.7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#30303b';}
    ctx.fillStyle='#dc8991';ctx.beginPath();ctx.moveTo(-1.6,3.7);ctx.lineTo(1.6,3.7);ctx.quadraticCurveTo(0,6.2,-1.6,3.7);ctx.fill();
    ctx.strokeStyle='#705956';ctx.lineWidth=.7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,5);ctx.quadraticCurveTo(-1,7,-2.5,5.8);ctx.moveTo(0,5);ctx.quadraticCurveTo(1,7,2.5,5.8);ctx.stroke();
    ctx.strokeStyle=orange?'#925e39':'#525c71';for(const sign of [-1,1]){ctx.beginPath();ctx.moveTo(sign*7,3);ctx.lineTo(sign*11,2.2);ctx.moveTo(sign*7,5);ctx.lineTo(sign*10.8,5.7);ctx.stroke();}
    if(last){ctx.strokeStyle='#397f6a';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,14.5,0,Math.PI*2);ctx.stroke();}ctx.restore();
  }
  function draw(){
    const ratio=Math.min(window.devicePixelRatio||1,2),size=Math.max(280,Math.round(canvas.clientWidth));if(canvas.width!==Math.round(size*ratio)){canvas.width=canvas.height=Math.round(size*ratio);}ctx.setTransform(canvas.width/480,0,0,canvas.height/480,0,0);
    ctx.clearRect(0,0,480,480);const gradient=ctx.createLinearGradient(0,0,480,480);gradient.addColorStop(0,'#f8e7c7');gradient.addColorStop(1,'#eccc9e');ctx.fillStyle=gradient;ctx.fillRect(0,0,480,480);
    ctx.strokeStyle='#a77f3a08';ctx.lineWidth=1;for(let i=0;i<85;i++){const y=i*6;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(130,y+3,210,y-3,480,y+1);ctx.stroke();}
    ctx.lineWidth=.8;ctx.strokeStyle='#a3825080';for(let i=0;i<SIZE;i++){const n=30+i*30;ctx.beginPath();ctx.moveTo(30,n);ctx.lineTo(450,n);ctx.moveTo(n,30);ctx.lineTo(n,450);ctx.stroke();}
    ctx.font='9px system-ui';ctx.textAlign='center';ctx.fillStyle='#91754c';for(let i=0;i<SIZE;i++){ctx.fillText(String.fromCharCode(65+i),30+i*30,16);ctx.fillText(String(i+1),14,33+i*30);}
    for(const [x,y]of [[3,3],[11,3],[7,7],[3,11],[11,11]]){ctx.beginPath();ctx.arc(30+x*30,30+y*30,2.8,0,Math.PI*2);ctx.fill();}
    const last=game.moves.at(-1);for(let i=0;i<225;i++)if(game.board[i])stone(i%15,Math.floor(i/15),game.board[i],false,last?.x===i%15&&last?.y===Math.floor(i/15));
    if(selected&&!game.board[selected.y*15+selected.x]&&!game.winner&&!game.draw)stone(selected.x,selected.y,HUMAN,true);
    if(game.line.length){ctx.strokeStyle='#d8915999';ctx.lineWidth=5;const line=game.line.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);ctx.beginPath();ctx.moveTo(30+line[0][0]*30,30+line[0][1]*30);ctx.lineTo(30+line.at(-1)[0]*30,30+line.at(-1)[1]*30);ctx.stroke();}
  }
  function render(){
    root.classList.toggle('playing',started);
    root.classList.toggle('thinking',busy);$('[data-status]').textContent=!started?'準備好和灰灰玩了嗎？':game.winner===HUMAN?'五子相連，你贏了！':game.winner===BOT?'灰灰這次贏了，再試一次吧！':game.draw?'旗鼓相當，這局和棋！':busy?(game.turn===BOT?'灰灰正在想下一步…':'小貓正在找好位置…'):game.turn===HUMAN?'輪到你了，慢慢想 ♡':'輪到灰灰了';
    $('[data-count]').textContent=`第 ${game.moves.length} 手`;
    $('[data-placement]').innerHTML=selected?`${String.fromCharCode(65+selected.x)}${selected.y+1} · 預覽位置<small>確認後才會放上橘貓棋子</small>`:'還沒選擇落點<small>點交叉點預覽，不會直接落子</small>';
    $('[data-action=confirm]').disabled=!started||busy||game.turn!==HUMAN||!selected||!!game.winner||game.draw;
    $('[data-action=undo]').disabled=challenge||!game.moves.length;
    $('[data-action=hint]').disabled=challenge||!started||busy||game.turn!==HUMAN||!!game.winner||game.draw;
    $('[data-opponent]').textContent=({easy:'小貓入門',normal:'貓咪高手',hard:'貓王挑戰'})[level];
    for(const b of root.querySelectorAll('[data-level]'))b.setAttribute('aria-pressed',String(b.dataset.level===level));draw();
  }
  function finish(){
    if(!game.winner&&!game.draw)return false;
    audio.play(game.winner===HUMAN?'win':'lose');$('#meow-result-title').textContent=game.draw?'平手也很精彩！':game.winner===HUMAN?'太棒了，五子相連！':'灰灰贏了這一局';
    $('[data-result]').textContent=(game.winner===HUMAN?'小橘的好棋，值得一個掌聲。':game.draw?'和灰灰再來一盤吧。':'沒關係，每一步都在變厲害。')+' 本機練習不發送點數。';
    resultDialog.showModal();
    if(challenge&&!reported&&usable()){
      reported=true;setRewardStatus('本局已結束，正在確認棋局與獎勵，尚未入帳…');
      onComplete({winner:game.winner,draw:game.draw},{replay:game.moves.filter(m=>m.side===HUMAN).map(m=>[m.x,m.y])});
    }return true;
  }
  function setRewardStatus(message,{retry=false}={}){
    if(dead||!challenge)return;$('[data-result]').textContent=message;note(message);$('[data-action=confirm-reward]').hidden=!retry;
  }
  function botTurn(){
    const version=generation;busy=true;render();timer=setTimeout(()=>{if(!usable()||version!==generation||game.turn!==BOT)return;compute(BOT,move=>{if(move)placeMove(game,move.x,move.y);audio.play('place');render();finish();});},420);
  }
  function start(nextLevel=level){if(!usable())return;if(challenge&&started){resetDialog.close();onRestart();return;}cancelAI();level=challenge?'normal':nextLevel;game=createGame();selected=null;started=true;reported=false;resultDialog.close();resetDialog.close();$('.meow-welcome').hidden=true;audio.start();note('先選位置，再確認落子。祝你下得開心！');render();canvas.focus({preventScroll:true});}
  function reset(nextLevel=level){requestedLevel=nextLevel;if(game.moves.length&&!game.winner&&!game.draw){resetDialog.showModal();return;}start(nextLevel);}
  function confirm(){if(!usable()||!started||busy||game.turn!==HUMAN||!selected)return;const {x,y}=selected;if(!placeMove(game,x,y))return;selected=null;audio.play('place');note('');render();if(!finish())botTurn();}
  canvas.addEventListener('pointerdown',event=>{if(!started||busy||game.turn!==HUMAN||game.winner||game.draw||resetDialog.open)return;event.preventDefault();audio.start();const rect=canvas.getBoundingClientRect(),x=Math.round(((event.clientX-rect.left)/rect.width*480-30)/30),y=Math.round(((event.clientY-rect.top)/rect.height*480-30)/30);if(x<0||y<0||x>=15||y>=15)return;if(game.board[y*15+x]){note('這裡已經有棋子囉，換個位置吧。');return;}selected={x,y};canvas.focus({preventScroll:true});render();},{signal});
  canvas.addEventListener('keydown',event=>{if(!started||busy||game.turn!==HUMAN||game.winner||game.draw)return;const arrows={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};if(arrows[event.key]){event.preventDefault();const [dx,dy]=arrows[event.key],base=selected||{x:7,y:7};selected={x:Math.max(0,Math.min(14,base.x+dx)),y:Math.max(0,Math.min(14,base.y+dy))};if(game.board[selected.y*15+selected.x])selected=null;render();}else if(['Enter',' '].includes(event.key)){event.preventDefault();if(!selected){selected={x:7,y:7};if(game.board[112])selected=null;render();}else confirm();}},{signal});
  root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.action!=='exit'&&!usable())return;if(challenge&&(button.dataset.level||['undo','hint'].includes(button.dataset.action)))return;if(button.dataset.action==='confirm-reward'){onEvent('confirm');return;}if(button.dataset.level){if(!started){level=button.dataset.level;render();}else reset(button.dataset.level);return;}
    switch(button.dataset.action){case 'start':start();break;case 'confirm':confirm();break;case 'undo':cancelAI();undoTurn(game);selected=null;resultDialog.close();render();note('已回到你落子之前。');break;case 'hint':compute(HUMAN,move=>{selected=move;render();note('小貓建議這一格，是否落子由你決定。');});break;case 'restart':reset();break;case 'reset-yes':start(requestedLevel);break;case 'reset-no':resetDialog.close();break;case 'again':start();break;case 'close-result':resultDialog.close();break;
      case 'music':{const on=audio.toggleMusic();if(on&&started)audio.start();button.textContent=on?'♫ 音樂開':'♫ 音樂關';button.setAttribute('aria-pressed',String(on));break;}
      case 'sound':{const on=audio.toggleSound();if(on&&started)audio.start();button.textContent=on?'♪ 音效開':'♪ 音效關';button.setAttribute('aria-pressed',String(on));break;}
      case 'exit':destroy();onExit();break;}
  },{signal});
  const visibility=()=>{if(document.hidden){audio.pause();cancelAI();}else if(usable()&&started&&game.turn===BOT&&!game.winner&&!game.draw)botTurn();render();};document.addEventListener('visibilitychange',visibility,{signal});
  const resize=new ResizeObserver(draw);resize.observe(canvas);
  function destroy(){if(dead)return;dead=true;cancelAI();events.abort();resize.disconnect();audio.destroy();resultDialog.close();resetDialog.close();host.replaceChildren();}
  render();return {destroy,setRewardStatus,getSnapshot:()=>({board:game.board.slice(),moves:game.moves.map(m=>({...m})),turn:game.turn,winner:game.winner,draw:game.draw,level,busy,selected:selected?{...selected}:null})};
}
