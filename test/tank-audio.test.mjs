import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTankAudio} from '../js/modules/tank-audio.mjs';
test('no context before gesture; interrupted resume retries; mute and close are safe',async()=>{
 const original=globalThis.AudioContext;let built=0,resumes=0,instance;const states=[];
 globalThis.AudioContext=class{constructor(){built++;instance=this;this.state='suspended';}resume(){resumes++;if(resumes===1)return Promise.reject(Error('blocked'));this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}};
 try{
  const audio=createTankAudio(s=>states.push(s));assert.equal(built,0);
  audio.unlock();await new Promise(r=>setTimeout(r,0));assert.equal(states.at(-1),'blocked');
  audio.unlock();await new Promise(r=>setTimeout(r,0));assert.equal(states.at(-1),'ready');
  instance.state='interrupted';audio.unlock();await new Promise(r=>setTimeout(r,0));assert.equal(resumes,3);
  audio.toggle();assert.equal(states.at(-1),'muted');audio.unlock();assert.equal(resumes,3);
  audio.close();assert.equal(instance.state,'closed');
 }finally{globalThis.AudioContext=original;}
});
test('unsupported and throwing audio devices never block the game',()=>{
 const original=globalThis.AudioContext;try{globalThis.AudioContext=class{constructor(){throw Error('unsupported');}};
  let state;const audio=createTankAudio(s=>state=s);assert.doesNotThrow(()=>audio.unlock(true));assert.equal(state,'blocked');assert.doesNotThrow(()=>audio.play('fire'));audio.close();
 }finally{globalThis.AudioContext=original;}
});
