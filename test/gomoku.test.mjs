import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,placeMove,winningLine,undoTurn,chooseMove} from '../js/modules/gomoku-engine.mjs';
import {gomokuWav,createGomokuAudio} from '../js/modules/gomoku-audio.mjs';
test('empty board, alternating turns, bounds and occupied intersections',()=>{
  const g=createGame();assert.equal(g.board.length,225);assert.equal(g.turn,1);
  for(const [x,y]of [[-1,0],[15,0],[0,15],[0,NaN],[1.5,1]])assert.equal(placeMove(g,x,y),false);
  assert.equal(placeMove(g,7,7),true);assert.equal(g.turn,2);assert.equal(placeMove(g,7,7),false);assert.equal(g.moves.length,1);
  assert.equal(placeMove(g,7,8),true);assert.equal(g.turn,1);
});
test('five and overlines win across all four axes without wrapping edges',()=>{
  for(const [dx,dy]of [[1,0],[0,1],[1,1],[1,-1]])for(const count of [5,6]){
    const g=createGame();for(let i=0;i<count;i++)g.board[(7+i*dy)*15+3+i*dx]=1;
    assert.equal(winningLine(g.board,3,7,1).length,count);
  }
  const g=createGame();for(const i of [13,14,15,16,17])g.board[i]=1;assert.equal(winningLine(g.board,0,1,1).length,0);
});
test('terminal win stops later moves and full board draw has no winner',()=>{
  const g=createGame();for(let i=0;i<4;i++){placeMove(g,i,0);placeMove(g,i,2);}placeMove(g,4,0);assert.equal(g.winner,1);assert.equal(placeMove(g,5,4),false);
  const d=createGame();d.board=d.board.map((_,i)=>(i%15+2*Math.floor(i/15))%4<2?1:2);d.board[224]=0;d.turn=2;d.moves=Array.from({length:224},(_,i)=>({x:i%15,y:Math.floor(i/15),side:d.board[i]}));
  assert.equal(placeMove(d,14,14),true);assert.equal(d.draw,true);assert.equal(d.winner,0);assert.equal(placeMove(d,0,0),false);
});
test('undo restores player turn after pending AI, paired turns, and a win',()=>{
  const g=createGame();assert.equal(undoTurn(g),false);placeMove(g,7,7);undoTurn(g);assert.equal(g.moves.length,0);
  placeMove(g,7,7);placeMove(g,7,8);undoTurn(g);assert.equal(g.moves.length,0);assert.equal(g.turn,1);
  for(let i=0;i<4;i++){placeMove(g,i,0);placeMove(g,i,2);}placeMove(g,4,0);undoTurn(g);assert.equal(g.winner,0);assert.equal(g.line.length,0);assert.equal(g.moves.length,8);
});
test('all levels win before defending and block immediate opponent threats',()=>{
  for(const level of ['easy','normal','hard']){
    const g=createGame();for(let x=0;x<4;x++)g.board[x]=1;
    assert.deepEqual(chooseMove(g.board,2,level),{x:4,y:0});
    for(let x=0;x<4;x++)g.board[30+x]=2;assert.deepEqual(chooseMove(g.board,2,level),{x:4,y:2});
  }
});
test('broken four threat is blocked, deterministic choices never mutate board',()=>{
  const g=createGame();for(const x of [0,1,3,4])g.board[x]=1;const before=g.board.slice();
  assert.deepEqual(chooseMove(g.board,2,'hard'),{x:2,y:0});assert.deepEqual(g.board,before);
  assert.deepEqual(chooseMove(createGame().board,2),{x:7,y:7});assert.equal(chooseMove(Array(225).fill(1)),null);
  assert.equal(chooseMove([]),null);assert.equal(chooseMove(Array(225).fill(9)),null);
});
test('complete automated game stays legal with bounded search and replayable turns',()=>{
  const g=createGame(),before=performance.now();while(!g.winner&&!g.draw){const m=chooseMove(g.board,g.turn,g.turn===1?'normal':'easy');assert.ok(m);assert.equal(placeMove(g,m.x,m.y),true);}
  assert.ok(g.moves.length<=225);assert.ok(performance.now()-before<10000);
  const replay=createGame();for(const m of g.moves){assert.equal(replay.turn,m.side);assert.ok(placeMove(replay,m.x,m.y));}assert.deepEqual(replay,g);
});
test('original WAV assets have valid duration and nonzero audio samples',()=>{
  for(const kind of ['music','place','win','lose']){const wav=gomokuWav(kind),v=new DataView(wav);assert.equal(v.getUint32(40,true),wav.byteLength-44);assert.equal(v.getUint32(24,true),16000);let peak=0;for(let i=44;i<wav.byteLength;i+=2)peak=Math.max(peak,Math.abs(v.getInt16(i,true)));assert.ok(peak>100);assert.ok(peak<32767);}
});
test('audio creates nothing before gesture, handles blocking and releases players',async()=>{
  const original=globalThis.Audio,players=[];globalThis.Audio=class{constructor(){players.push(this);}setAttribute(){}play(){return Promise.reject(Error('blocked'));}pause(){this.paused=true;}removeAttribute(){}load(){this.released=true;}};
  try{const warnings=[],audio=createGomokuAudio(m=>warnings.push(m));assert.equal(players.length,0);audio.start();await new Promise(r=>setTimeout(r,0));assert.ok(warnings.length);audio.toggleMusic();audio.toggleSound();audio.destroy();assert.ok(players.every(p=>p.paused&&p.released));audio.start();assert.equal(players.length,2);}finally{globalThis.Audio=original;}
});
test('preview remains disconnected from production entry, accounts and point APIs',()=>{
  const controller=readFileSync(new URL('../js/modules/gomoku-controller.mjs',import.meta.url),'utf8');assert.doesNotMatch(controller,/fetchAPI|gameAPI|completeGame|localStorage|fetch\(/);
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.doesNotMatch(index,/gomoku/);
  const server=readFileSync(new URL('../tools/preview-gomoku.mjs',import.meta.url),'utf8');assert.match(server,/127\.0\.0\.1/);assert.match(server,/connect-src 'none'/);
});
