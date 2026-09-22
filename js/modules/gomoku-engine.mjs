// Pure, bounded and deterministic engine; no points or identity state.
export const SIZE=15, HUMAN=1, BOT=2;
const DIRECTIONS=[[1,0],[0,1],[1,1],[1,-1]];
export function createGame(){return {board:Array(SIZE*SIZE).fill(0),turn:HUMAN,moves:[],winner:0,draw:false,line:[]};}
export const inside=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<SIZE&&y>=0&&y<SIZE;
export function winningLine(board,x,y,side){
  if(!inside(x,y)||!side||board[y*SIZE+x]!==side)return [];
  for(const [dx,dy]of DIRECTIONS){const line=[[x,y]];
    for(const sign of [-1,1])for(let n=1;n<SIZE;n++){const a=x+dx*n*sign,b=y+dy*n*sign;if(!inside(a,b)||board[b*SIZE+a]!==side)break;line.push([a,b]);}
    if(line.length>=5)return line;
  }return [];
}
export function placeMove(game,x,y){
  if(game.winner||game.draw||!inside(x,y)||game.board[y*SIZE+x])return false;
  const side=game.turn;game.board[y*SIZE+x]=side;game.moves.push({x,y,side});game.line=winningLine(game.board,x,y,side);
  if(game.line.length)game.winner=side;else if(game.moves.length===SIZE*SIZE)game.draw=true;else game.turn=3-side;
  return true;
}
export function undoTurn(game){
  if(!game.moves.length)return false;
  do{const move=game.moves.pop();game.board[move.y*SIZE+move.x]=0;}while(game.moves.length&&game.moves.at(-1).side===HUMAN);
  game.turn=HUMAN;game.winner=0;game.draw=false;game.line=[];return true;
}
function candidates(board){
  const result=new Set();for(let i=0;i<board.length;i++)if(board[i]){const x=i%SIZE,y=Math.floor(i/SIZE);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(inside(x+dx,y+dy)&&!board[(y+dy)*SIZE+x+dx])result.add((y+dy)*SIZE+x+dx);}
  if(!result.size&&board.every(n=>n===0))return [112];return [...result].sort((a,b)=>a-b);
}
function potential(board,index,side){
  const x=index%SIZE,y=Math.floor(index/SIZE);let total=0;
  for(const [dx,dy]of DIRECTIONS){let count=1,open=0;
    for(const sign of [-1,1]){let n=1;while(inside(x+dx*n*sign,y+dy*n*sign)&&board[(y+dy*n*sign)*SIZE+x+dx*n*sign]===side){count++;n++;}
      if(inside(x+dx*n*sign,y+dy*n*sign)&&!board[(y+dy*n*sign)*SIZE+x+dx*n*sign])open++;}
    if(count>=5)total+=1000000;else if(open)total+=([0,2,25,350,7000][count]||0)*(open===2?5:1);
    // Broken lines (e.g. XX.XX) should count as threats too.
    for(let start=-4;start<=0;start++){let stones=0,valid=true;for(let k=0;k<5;k++){const a=x+(start+k)*dx,b=y+(start+k)*dy;if(!inside(a,b)||board[b*SIZE+a]===3-side){valid=false;break;}if(board[b*SIZE+a]===side)stones++;}if(valid)total+=[1,3,18,100,1200][stones]||0;}
  }return total;
}
export function chooseMove(board,side=BOT,level='normal',seed=0){
  if(!Array.isArray(board)||board.length!==225||board.some(v=>![0,1,2].includes(v))||![1,2].includes(side))return null;
  const boardCopy=board.slice(),list=candidates(boardCopy);if(!list.length)return null;
  const ranked=list.map(index=>({index,attack:potential(boardCopy,index,side),defend:potential(boardCopy,index,3-side)}));
  // Always take a win first, then block the opponent's immediate win.
  for(const player of [side,3-side])for(const item of ranked){const i=item.index;boardCopy[i]=player;const win=winningLine(boardCopy,i%SIZE,Math.floor(i/SIZE),player).length;boardCopy[i]=0;if(win)return {x:i%SIZE,y:Math.floor(i/SIZE)};}
  for(const r of ranked)r.value=r.attack+r.defend*1.1-(Math.abs(r.index%15-7)+Math.abs(Math.floor(r.index/15)-7))*.3;
  const tie=index=>seed?(Math.imul(index+1,(seed|0)^0x45d9f3b)>>>0):index;
  ranked.sort((a,b)=>b.value-a.value||tie(a.index)-tie(b.index)||a.index-b.index);
  let best=ranked[0];
  if(level==='easy'&&best.value<10000){const hash=boardCopy.reduce((s,v,i)=>(s+(i+1)*v)>>>0,0);best=ranked[hash%Math.min(3,ranked.length)];}
  if(level==='hard'){
    let score=-Infinity;
    for(const item of ranked.slice(0,8)){boardCopy[item.index]=side;let danger=0;
      for(const i of candidates(boardCopy))danger=Math.max(danger,potential(boardCopy,i,3-side));
      boardCopy[item.index]=0;const value=item.value-danger*1.3;if(value>score){score=value;best=item;}
    }
  }
  return {x:best.index%SIZE,y:Math.floor(best.index/SIZE)};
}

// Server replays human coordinates against the fixed, seeded normal opponent.
// Client scores, difficulty and claimed wins are intentionally not inputs.
export function verifyGomokuReplay(seed,replay,elapsedMs){
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Array.isArray(replay)||!replay.length||replay.length>113||!Number.isFinite(elapsedMs)||elapsedMs<replay.length*400||elapsedMs>20*60000)return null;
  const game=createGame();
  for(let i=0;i<replay.length;i++){
    const move=replay[i];if(!Array.isArray(move)||move.length!==2||!placeMove(game,move[0],move[1]))return null;
    if(!game.winner&&!game.draw){const bot=chooseMove(game.board,BOT,'normal',seed);if(!bot||!placeMove(game,bot.x,bot.y))return null;}
    if((game.winner||game.draw)&&i!==replay.length-1)return null;
  }
  if(!game.winner&&!game.draw)return null;
  return {state:game.winner===HUMAN?'won':'lost',score:game.winner===HUMAN?100:0,moves:game.moves.length,draw:game.draw,durationMs:Math.round(elapsedMs)};
}
