import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame,verifyReplay,WIDTH,HEIGHT,MAX_TICKS} from '../js/modules/tank-engine.mjs';
import {winningReplay} from './helpers/tank-player.mjs';

test('v2 has 80 destructible bricks, open spawn lanes, and can be won without altering old maps',()=>{
 const s=createGame(1,2);assert.equal(s.walls.length,80);assert.equal(createGame(1).walls.length,20);
 assert.equal(new Set(s.walls.map(w=>`${w.x}:${w.y}`)).size,80);
 for(const p of [s.player,...[72,346,620].map(x=>({x,y:24,w:26,h:26}))])
  assert.ok(s.walls.every(w=>p.x+p.w<=w.x||p.x>=w.x+w.w||p.y+p.h<=w.y||p.y>=w.y+w.h));
 for(const seed of [1,2,3]){const {game,replay}=winningReplay(seed,2);assert.equal(game.state,'won');assert.equal(verifyReplay(seed,replay,game.ticks/30*1000,2),true);}
});

test('base is surrounded by an intact eight-brick ring, fully on board',()=>{
 const s=createGame(42),walls=s.walls.filter(w=>w.baseWall);assert.equal(walls.length,8);
 for(let dy=-24;dy<=24;dy+=24)for(let dx=-24;dx<=24;dx+=24)if(dx||dy)
  assert.ok(walls.some(w=>w.x===s.base.x+dx&&w.y===s.base.y+dy));
 for(const w of walls){assert.ok(w.x>=0&&w.x+w.w<=WIDTH&&w.y+w.h<=HEIGHT);assert.equal(w.hp,2);}
});
test('directions, fire, max 3 enemies, stable headings and limited speed',()=>{
 const s=createGame(42),x=s.player.x;stepGame(s,8);assert.ok(s.player.x<x);stepGame(s,16);assert.ok(s.events.includes('fire'));
 for(let i=0;i<1600&&s.state==='playing';i++){
  const before=s.enemies.map(e=>({e,dir:e.dir,turn:e.turn}));stepGame(s,16);assert.ok(s.enemies.length<=3);
  for(const e of before)if(e.turn>1)assert.equal(e.e.dir,e.dir);
 }
});
test('zero lives and destroyed base lose; failed game does not advance',()=>{
 for(const kind of ['player','base']) {
  const s=createGame(1);s.walls=[];s.lives=1;s.player.shield=0;const target=s[kind];
  s.bullets=[{x:target.x,y:target.y,w:4,h:4,dx:0,dy:0,enemy:true}];
  stepGame(s,0);assert.equal(s.state,'lost');const ticks=s.ticks;stepGame(s,16);assert.equal(s.ticks,ticks);
 }
});
test('fifth kill stops the game and leaves protected base alive',()=>{
 const s=createGame(1);s.kills=4;s.spawned=5;s.walls=[];
 s.enemies=[{x:100,y:100,w:26,h:26,dir:2,cooldown:90,turn:90,enemy:true}];
 s.bullets=[{x:102,y:102,w:4,h:4,dx:0,dy:0,enemy:false}];stepGame(s,0);
 assert.equal(s.state,'won');assert.equal(s.kills,5);assert.equal(s.base.alive,true);
});
test('unmodified simulation can be won; server replays actual input; no caller score trusted',()=>{
 const {game,replay}=winningReplay(1);assert.equal(game.state,'won',`kills=${game.kills},ticks=${game.ticks}`);
 assert.equal(verifyReplay(1,replay,game.ticks/30*1000),true);
 assert.equal(verifyReplay(1,replay,0),false);
 for(const bad of [null,[],[[MAX_TICKS+1,16]],[[2,32]],[[1.5,1]],[[10,-1]],[[1,16,5]],[[1,0]]])assert.equal(verifyReplay(42,bad,9999999),false);
 assert.equal(verifyReplay(1,[...replay,[1,0]],9999999),false);
});
