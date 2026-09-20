import {createGame,stepGame,recordInput} from '../../js/modules/tank-engine.mjs';
// Test-only player: choose a heading toward the closest enemy, try another axis if blocked.
export function winningReplay(seed=1) {
  const s=createGame(seed),replay=[];let stuck=0,lastX=s.player.x,lastY=s.player.y,escape=0;
  while(s.state==='playing') {
    const p=s.player,e=[...s.enemies].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    let mask=16;
    if(e){
      const dx=e.x-p.x,dy=e.y-p.y;
      if(Math.abs(dx)<12)mask|=dy<0?1:4;
      else if(Math.abs(dy)<12)mask|=dx<0?8:2;
      else mask|=Math.abs(dx)<Math.abs(dy)?(dx<0?8:2):(dy<0?1:4);
      if(stuck>6){escape=28;stuck=0;}
      if(escape>0){escape--;mask=16|([1,2,4,8][Math.floor(s.ticks/28)%4]);}
    }else mask|=1;
    recordInput(replay,mask);stepGame(s,mask);
    stuck=(p.x===lastX&&p.y===lastY)?stuck+1:0;lastX=p.x;lastY=p.y;
  }
  return {game:s,replay};
}
