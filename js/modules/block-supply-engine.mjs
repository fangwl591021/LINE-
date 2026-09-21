// Original supply geometry. Shared pure simulation: no browser, clock, storage or points service.
export const GAME_ID='block_supply', ENGINE_VERSION=1;
export const COLS=10, ROWS=16, WARNING_ROWS=2, STEP_MS=20, MAX_TICKS=4500, TARGET_ENERGY=100;
export const INPUT=Object.freeze({left:1,right:2,down:4,rotate:8,drop:16});
const definitions=[
 ['rail','▰','#53d6c3',[[0,0],[1,0],[2,0]]],
 ['elbow','⌁','#ffa865',[[0,0],[0,1],[1,1]]],
 ['crate','▣','#80baff',[[0,0],[1,0],[0,1],[1,1]]],
 ['beam','═','#f7d76d',[[0,0],[1,0],[2,0],[3,0]]],
 ['hook','⌑','#c9a2ff',[[0,0],[0,1],[0,2],[1,2]]],
 ['step','≋','#ff91ba',[[0,0],[1,0],[1,1],[2,1]]],
 ['relay','✚','#79d389',[[1,0],[0,1],[1,1],[2,1],[1,2]]],
 ['rack','∪','#ffa071',[[0,0],[2,0],[0,1],[1,1],[2,1]]],
 ['tool','⚒','#83dce9',[[0,0],[1,0],[0,1],[1,1],[0,2]]],
 ['mast','⋮','#e3b5f8',[[0,0],[0,1],[0,2],[0,3],[1,3]]]
];
export const SHAPES=Object.freeze(definitions.map(([id,symbol,color,cells])=>Object.freeze({id,symbol,color,cells:Object.freeze(cells.map(c=>Object.freeze(c)))})));
const LINE_ENERGY=[0,20,50,90,140,200];
const random=s=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};
export const fallInterval=elapsedMs=>Math.max(450,720-120*Math.floor(Math.max(0,elapsedMs)/30000));
function nextPiece(s){
 if(!s.bag.length){s.bag=SHAPES.map((_,i)=>i);for(let i=s.bag.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[s.bag[i],s.bag[j]]=[s.bag[j],s.bag[i]];}}
 const shape=s.bag.pop(),cells=SHAPES[shape].cells.map(([x,y])=>({x,y,special:false}));
 if(random(s)<.2)cells[Math.floor(random(s)*cells.length)].special=true;
 return {shape,cells,x:Math.floor((COLS-1-Math.max(...cells.map(c=>c.x)))/2),y:0};
}
export function fits(s,piece=s.active,dx=0,dy=0){
 return !!piece&&piece.cells.every(c=>{const x=piece.x+c.x+dx,y=piece.y+c.y+dy;return x>=0&&x<COLS&&y>=0&&y<ROWS&&!s.board[y][x];});
}
function finish(s,state,reason){s.state=state;s.reason=reason;s.events.push(state==='won'?'win':'lose');}
function spawn(s){s.active=s.next;s.next=nextPiece(s);s.fallMs=0;if(!fits(s))finish(s,'lost','blocked_spawn');}
export function createGame(seed){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new TypeError('Seed must be uint32');
 const s={gameId:GAME_ID,version:ENGINE_VERSION,initialSeed:seed,seed,bag:[],board:Array.from({length:ROWS},()=>Array(COLS).fill(null)),
  active:null,next:null,ticks:0,fallMs:0,previousInput:0,horizontal:0,heldTicks:0,downTicks:0,
  energy:0,score:0,clearedLines:0,combo:0,placed:0,warning:false,state:'playing',reason:'',events:[]};
 s.next=nextPiece(s);spawn(s);return s;
}
function move(s,dx,dy){if(!fits(s,s.active,dx,dy))return false;s.active.x+=dx;s.active.y+=dy;s.events.push('move');return true;}
function rotate(s){
 const cells=s.active.cells.map(c=>({...c,x:-c.y,y:c.x}));
 const minX=Math.min(...cells.map(c=>c.x)),minY=Math.min(...cells.map(c=>c.y));
 cells.forEach(c=>{c.x-=minX;c.y-=minY;});
 for(const dx of [0,-1,1,-2,2]){const p={...s.active,cells,x:s.active.x+dx};if(fits(s,p)){s.active=p;s.events.push('rotate');return;}}
}
function lock(s){
 for(const c of s.active.cells)s.board[s.active.y+c.y][s.active.x+c.x]={shape:s.active.shape,special:c.special};
 s.placed++;s.events.push('land');
 const full=s.board.filter(row=>row.every(Boolean)),lines=full.length;
 if(lines){
  s.combo++;const special=full.reduce((n,row)=>n+row.filter(c=>c.special).length,0);
  s.energy+=LINE_ENERGY[lines]+(s.combo>=2?10:0)+special*10;s.score=s.energy*10;s.clearedLines+=lines;
  s.board=s.board.filter(row=>!row.every(Boolean));while(s.board.length<ROWS)s.board.unshift(Array(COLS).fill(null));
  s.events.push('clear');if(s.combo>=2)s.events.push('combo');
 }else s.combo=0;
 if(s.board.slice(0,WARNING_ROWS).some(row=>row.some(Boolean))){finish(s,'lost','warning_line');return;}
 if(s.energy>=TARGET_ENERGY){finish(s,'won','energy');return;}
 const warning=s.board.slice(WARNING_ROWS,WARNING_ROWS+2).some(row=>row.some(Boolean));
 if(warning&&!s.warning)s.events.push('warning');s.warning=warning;
 spawn(s);
}
export function stepGame(s,mask=0){
 if(s.state!=='playing')return s;
 if(!Number.isInteger(mask)||mask<0||mask>31)throw new TypeError('Invalid input mask');
 s.events=[];s.ticks++;
 if(s.ticks>=MAX_TICKS){finish(s,'lost','timeout');return s;}
 const pressed=mask&~s.previousInput;s.previousInput=mask;
 const horizontal=(mask&INPUT.left? -1:0)+(mask&INPUT.right?1:0);
 if(horizontal!==s.horizontal){s.horizontal=horizontal;s.heldTicks=0;}
 if(horizontal&&(s.heldTicks===0||(s.heldTicks>=9&&(s.heldTicks-9)%3===0)))move(s,horizontal,0);
 s.heldTicks=horizontal?s.heldTicks+1:0;
 if(pressed&INPUT.rotate)rotate(s);
 if(pressed&INPUT.drop){while(move(s,0,1)){}lock(s);return s;}
 if(mask&INPUT.down){
  if(s.downTicks%3===0){if(!move(s,0,1)){lock(s);s.downTicks++;return s;}s.fallMs=0;}
  s.downTicks++;
 }else s.downTicks=0;
 s.fallMs+=STEP_MS;
 if(s.fallMs>=fallInterval(s.ticks*STEP_MS)){s.fallMs=0;if(!move(s,0,1))lock(s);}
 return s;
}
export function pauseGame(s){if(s.state==='playing'){s.state='paused';s.events=[];}return s;}
export function resumeGame(s){if(s.state==='paused')s.state='playing';return s;}
export const restartGame=s=>createGame(s.initialSeed);
export const getProgress=s=>({energy:s.energy,target:TARGET_ENERGY,ratio:Math.min(1,s.energy/TARGET_ENERGY),remainingMs:Math.max(0,(MAX_TICKS-s.ticks)*STEP_MS)});
export const getScore=s=>s.score;
export const getResult=s=>({gameId:GAME_ID,state:s.state,reason:s.reason,score:s.score,energy:s.energy,clearedLines:s.clearedLines,combo:s.combo,durationMs:s.ticks*STEP_MS});
export function recordInput(replay,mask){const last=replay.at(-1);if(last&&last[1]===mask)last[0]++;else replay.push([1,mask]);}
export function verifyReplay(seed,replay,elapsedMs){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isFinite(elapsedMs)||elapsedMs<0||!Array.isArray(replay)||!replay.length||replay.length>MAX_TICKS)return null;
 let ticks=0;
 for(const p of replay){if(!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||p[0]<1||!Number.isInteger(p[1])||p[1]<0||p[1]>31)return null;ticks+=p[0];if(ticks>MAX_TICKS)return null;}
 if(ticks*STEP_MS>elapsedMs+1500)return null;
 const s=createGame(seed);
 for(const [count,mask] of replay)for(let i=0;i<count;i++){if(s.state!=='playing')return null;stepGame(s,mask);}
 return s.state==='won'||s.state==='lost'?getResult(s):null;
}
