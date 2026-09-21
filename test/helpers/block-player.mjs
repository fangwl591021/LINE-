import {COLS,ROWS,INPUT,createGame,stepGame,recordInput,getResult} from '../../js/modules/block-supply-engine.mjs';
// Test-only search over ordinary controls; never edits the authoritative board.
export function winningBlockReplay(seed=1){
 const evaluate=s=>{
  if(s.state==='lost')return -Infinity;if(s.state==='won')return 1e9;
  let holes=0;const heights=[];
  for(let x=0;x<COLS;x++){let top=ROWS;for(let y=0;y<ROWS;y++){if(s.board[y][x])top=Math.min(top,y);else if(y>top)holes++;}heights.push(ROWS-top);}
  return s.energy*1000-holes*100-heights.reduce((n,h)=>n+h*h,0)*3-heights.slice(1).reduce((n,h,i)=>n+Math.abs(h-heights[i]),0)*4;
 };
 const s=createGame(seed),replay=[];
 for(let piece=0;piece<60&&s.state==='playing';piece++){
  let best=null;
  for(let rotation=0;rotation<4;rotation++)for(let shift=-6;shift<=6;shift++){
   const commands=[];for(let i=0;i<rotation;i++)commands.push(INPUT.rotate,0);
   for(let i=0;i<Math.abs(shift);i++)commands.push(shift<0?INPUT.left:INPUT.right,0);
   commands.push(INPUT.drop,0);const candidate=structuredClone(s);
   for(const mask of commands){if(candidate.state!=='playing')break;stepGame(candidate,mask);}
   const rank=evaluate(candidate);if(!best||rank>best.rank)best={rank,commands};
  }
  for(const mask of best.commands){if(s.state!=='playing')break;stepGame(s,mask);recordInput(replay,mask);}
 }
 if(s.state!=='won')throw Error('Test player could not win');return {replay,result:getResult(s)};
}
