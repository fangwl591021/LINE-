import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHAPES,COLS,ROWS,MAX_TICKS,STEP_MS,INPUT,createGame,stepGame,fits,fallInterval,pauseGame,resumeGame,restartGame,getScore,getProgress,getResult,recordInput,verifyReplay} from '../js/modules/block-supply-engine.mjs';
const clone=s=>structuredClone(s),tick=(s,n,mask=0)=>{for(let i=0;i<n;i++)stepGame(s,mask);return s;};
function clearFixture(lines=1,special=false){
 const s=createGame(1);
 for(let y=ROWS-lines;y<ROWS;y++)s.board[y]=Array.from({length:COLS},(_,x)=>x===4?null:{shape:0,special:false});
 s.active={shape:0,x:4,y:ROWS-lines,cells:Array.from({length:lines},(_,y)=>({x:0,y,special:special&&y===0}))};
 return s;
}
test('ten distinct connected mixed-size shapes have non-color symbols and deterministic bag',()=>{
 assert.equal(SHAPES.length,10);assert.deepEqual([...new Set(SHAPES.map(p=>p.cells.length))].sort(),[3,4,5]);
 assert.equal(new Set(SHAPES.map(p=>JSON.stringify(p.cells))).size,10);
 assert.equal(new Set(SHAPES.map(p=>p.symbol)).size,10);
 for(const p of SHAPES){const seen=new Set([p.cells[0].join(',')]);for(let i=0;i<5;i++)for(const [x,y] of p.cells)if([[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(c=>seen.has(c.join(','))))seen.add([x,y].join(','));assert.equal(seen.size,p.cells.length);}
 const s=createGame(44),ids=[];
 for(let i=0;i<10;i++){ids.push(s.active.shape);s.board=Array.from({length:ROWS},()=>Array(COLS).fill(null));stepGame(s,INPUT.drop);stepGame(s,0);}
 assert.equal(new Set(ids).size,10);assert.deepEqual(createGame(9),createGame(9));assert.notDeepEqual(createGame(9).seed,createGame(10).seed);
});
test('left/right movement, held-repeat delay and opposing controls are bounded',()=>{
 const s=createGame(1),x=s.active.x;stepGame(s,INPUT.left);assert.equal(s.active.x,x-1);
 tick(s,8,INPUT.left);assert.equal(s.active.x,x-1);stepGame(s,INPUT.left);assert.equal(s.active.x,x-2);
 tick(s,50,INPUT.left);assert.equal(s.active.x,0);assert(fits(s));
 tick(s,70,INPUT.right);assert.equal(s.active.x+Math.max(...s.active.cells.map(c=>c.x)),9);
 const before=s.active.x;tick(s,4,INPUT.left|INPUT.right);assert.equal(s.active.x,before);
});
test('rotation preserves cells/special energy and cannot overlap occupied board',()=>{
 const s=createGame(1);s.active={shape:1,x:3,y:5,cells:[{x:0,y:0,special:true},{x:0,y:1},{x:1,y:1}]};
 const original=JSON.stringify(s.active.cells);stepGame(s,INPUT.rotate);assert.notEqual(JSON.stringify(s.active.cells),original);assert.equal(s.active.cells.filter(c=>c.special).length,1);
 const once=JSON.stringify(s.active.cells);stepGame(s,INPUT.rotate);assert.equal(JSON.stringify(s.active.cells),once,'holding rotation does not spin every tick');
 for(let i=0;i<3;i++){stepGame(s,0);stepGame(s,INPUT.rotate);}assert.deepEqual(s.active.cells.map(c=>[c.x,c.y]),[[0,0],[0,1],[1,1]]);
 // A tight shaft cannot accept a horizontal beam even after horizontal kick attempts.
 const shaft=createGame(1);shaft.active={shape:3,x:4,y:4,cells:[0,1,2,3].map(y=>({x:0,y}))};
 for(let y=4;y<9;y++)for(let x=0;x<COLS;x++)if(x!==4)shaft.board[y][x]={shape:0};
 const cells=clone(shaft.active.cells);stepGame(shaft,INPUT.rotate);assert.deepEqual(shaft.active.cells,cells);assert(fits(shaft));
});
test('wall kicks stay in bounds and floor collisions never write outside board',()=>{
 const s=createGame(1);s.active={shape:3,x:8,y:6,cells:[0,1,2,3].map(y=>({x:0,y}))};
 stepGame(s,INPUT.rotate);assert(fits(s));assert.equal(s.active.x,6);assert(s.events.includes('rotate'));stepGame(s,INPUT.drop);assert.equal(s.placed,1);
 assert.equal(s.board.length,16);assert(s.board.every(row=>row.length===10));
});
test('gravity starts at 720ms, speeds up at 30/60 seconds, and soft drop is faster',()=>{
 const s=createGame(1);tick(s,35);assert.equal(s.active.y,0);stepGame(s);assert.equal(s.active.y,1);
 assert.equal(fallInterval(29999),720);assert.equal(fallInterval(30000),600);assert.equal(fallInterval(60000),480);assert.equal(fallInterval(999999),450);
 const soft=createGame(1);tick(soft,9,INPUT.down);assert.equal(soft.active.y,3);
});
test('hard drop locks once per press, preserves blocks and emits landing',()=>{
 const s=createGame(7),size=s.active.cells.length;stepGame(s,INPUT.drop);
 assert.equal(s.placed,1);assert.equal(s.board.flat().filter(Boolean).length,size);assert(s.events.includes('land'));
 tick(s,5,INPUT.drop);assert.equal(s.placed,1);stepGame(s,0);stepGame(s,INPUT.drop);assert.equal(s.placed,2);
});
test('one through five rows award exact energies and only cleared special cells add energy',()=>{
 for(const [lines,energy] of [[1,20],[2,50],[3,90],[4,140],[5,200]]){
  const s=clearFixture(lines);stepGame(s,INPUT.drop);assert.equal(s.energy,energy);assert.equal(s.clearedLines,lines);assert.equal(s.score,energy*10);assert.equal(s.board.flat().filter(Boolean).length,0);
 }
 const s=clearFixture(1,true);stepGame(s,INPUT.drop);assert.equal(s.energy,30);
 const unCleared=createGame(1);unCleared.active.cells[0].special=true;stepGame(unCleared,INPUT.drop);assert.equal(unCleared.energy,0);
});
test('successive clearing locks add combo bonus; no-clear placement resets combo',()=>{
 const s=clearFixture();stepGame(s,INPUT.drop);assert.equal(s.combo,1);
 const next=clearFixture();s.board=next.board;s.active=next.active;stepGame(s,0);stepGame(s,INPUT.drop);
 assert.equal(s.energy,50);assert.equal(s.combo,2);assert(s.events.includes('combo'));
 stepGame(s,0);stepGame(s,INPUT.drop);assert.equal(s.combo,0);assert.equal(s.energy,50);
});
test('100 energy wins and end states cannot advance or score again',()=>{
 const s=clearFixture(3,true);stepGame(s,INPUT.drop);assert.equal(s.state,'won');assert.equal(s.energy,100);
 assert.equal(getScore(s),1000);assert.equal(getProgress(s).ratio,1);const end=clone(s);tick(s,20,INPUT.drop);assert.deepEqual(s,end);
});
test('warning-line, blocked-spawn and timeout lose; warning event fires before top-out',()=>{
 const s=createGame(1);s.board[1][0]={shape:0};stepGame(s,INPUT.drop);assert.equal(s.reason,'warning_line');assert.equal(s.state,'lost');
 const blocked=createGame(1);blocked.next={shape:0,x:0,y:2,cells:[{x:0,y:0}]};blocked.board[2][0]={shape:0};stepGame(blocked,INPUT.drop);assert.equal(blocked.reason,'blocked_spawn');
 const warn=createGame(1);warn.board[3][0]={shape:0};stepGame(warn,INPUT.drop);assert(warn.events.includes('warning'));
 const time=createGame(1);time.ticks=MAX_TICKS-1;stepGame(time,INPUT.drop);assert.equal(time.reason,'timeout');assert.equal(time.energy,0);assert.equal(getProgress(time).remainingMs,0);
});
test('pause freezes all gameplay time; resume preserves deterministic input history; restart is fresh',()=>{
 const s=createGame(2);tick(s,5,INPUT.left);const direct=clone(s);pauseGame(s);const paused=clone(s);tick(s,500,INPUT.drop);assert.deepEqual(s,paused);
 resumeGame(s);tick(s,9,INPUT.left);tick(direct,9,INPUT.left);assert.deepEqual(s,direct);
 const fresh=restartGame(s);assert.deepEqual(fresh,createGame(2));assert.notEqual(fresh.board,s.board);assert.equal(fresh.previousInput,0);
 const source=readFileSync(new URL('../js/modules/block-supply-engine.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/\b(?:setTimeout|setInterval|requestAnimationFrame|fetch|localStorage|document|Date)\s*[.(]/);
});
test('replay rejects invalid, truncated, too-long and too-fast input instead of trusting a score',()=>{
 for(const replay of [null,[],[[1,99]],[[.5,0]],[[0,0]],[[MAX_TICKS+1,0]],[[1,0,100]],[[1,0]]])assert.equal(verifyReplay(1,replay,100000),null);
 assert.equal(verifyReplay(1,[[2000,0]],1),null);assert.equal(verifyReplay(-1,[[1,0]],1000),null);assert.equal(verifyReplay(1,[[1,0]],NaN),null);
 assert.throws(()=>stepGame(createGame(1),-1));assert.throws(()=>createGame(NaN));
 const s=createGame(1),replay=[];while(s.state==='playing'){stepGame(s);recordInput(replay,0);}
 assert.deepEqual(verifyReplay(1,replay,s.ticks*STEP_MS),getResult(s));
 replay.push([1,0]);assert.equal(verifyReplay(1,replay,s.ticks*STEP_MS),null);
});
test('ordinary controls can win on untouched boards; server-style replay recomputes the exact result',()=>{
 // Greedy test player explores only valid input sequences, never edits authoritative state.
 const evaluate=s=>{
  if(s.state==='lost')return -Infinity;if(s.state==='won')return 1e9;
  let holes=0;const heights=[];
  for(let x=0;x<COLS;x++){let top=ROWS;for(let y=0;y<ROWS;y++){if(s.board[y][x])top=Math.min(top,y);else if(y>top)holes++;}heights.push(ROWS-top);}
  const rough=heights.slice(1).reduce((sum,h,i)=>sum+Math.abs(h-heights[i]),0);
  return s.energy*1000-holes*100-heights.reduce((sum,h)=>sum+h*h,0)*3-rough*4;
 };
 for(const seed of [1,7,44]){
  const s=createGame(seed),replay=[];
  for(let piece=0;piece<60&&s.state==='playing';piece++){
   let best=null;
   for(let rotation=0;rotation<4;rotation++)for(let shift=-6;shift<=6;shift++){
    const commands=[];for(let i=0;i<rotation;i++)commands.push(INPUT.rotate,0);
    for(let i=0;i<Math.abs(shift);i++)commands.push(shift<0?INPUT.left:INPUT.right,0);
    commands.push(INPUT.drop,0);const candidate=clone(s);
    for(const mask of commands){if(candidate.state!=='playing')break;stepGame(candidate,mask);}
    const rank=evaluate(candidate);if(!best||rank>best.rank)best={rank,commands};
   }
   for(const mask of best.commands){if(s.state!=='playing')break;stepGame(s,mask);recordInput(replay,mask);}
  }
  assert.equal(s.state,'won',`seed ${seed}: energy ${s.energy}`);
  assert.deepEqual(verifyReplay(seed,replay,s.ticks*STEP_MS),getResult(s));
 }
});
