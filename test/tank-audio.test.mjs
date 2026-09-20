import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTankAudio,createWebTankAudio,effectWav} from '../js/modules/tank-audio.mjs';
test('no context before gesture; interrupted resume retries; mute and close are safe',async()=>{
 const original=globalThis.AudioContext;let built=0,resumes=0,instance;const states=[];
 globalThis.AudioContext=class{constructor(){built++;instance=this;this.state='suspended';}resume(){resumes++;if(resumes===1)return Promise.reject(Error('blocked'));this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}};
 try{
  const audio=createWebTankAudio(s=>states.push(s));assert.equal(built,0);
  audio.unlock();await new Promise(r=>setTimeout(r,0));assert.equal(states.at(-1),'blocked');
  audio.unlock();await new Promise(r=>setTimeout(r,0));assert.equal(states.at(-1),'ready');
  instance.state='interrupted';audio.unlock();await new Promise(r=>setTimeout(r,0));assert.equal(resumes,3);
  audio.toggle();assert.equal(states.at(-1),'muted');audio.unlock();assert.equal(resumes,3);
  audio.close();assert.equal(instance.state,'closed');
 }finally{globalThis.AudioContext=original;}
});
test('unsupported and throwing audio devices never block the game',()=>{
 const original=globalThis.AudioContext;try{globalThis.AudioContext=class{constructor(){throw Error('unsupported');}};
  let state;const audio=createWebTankAudio(s=>state=s);assert.doesNotThrow(()=>audio.unlock(true));assert.equal(state,'blocked');assert.doesNotThrow(()=>audio.play('fire'));audio.close();
 }finally{globalThis.AudioContext=original;}
});
test('compatibility WAVs have valid PCM headers and audible samples',()=>{
 for(const kind of ['fire','enemyFire','hit','win','lose','ready']){
  const buffer=effectWav(kind),v=new DataView(buffer);assert.equal(v.getUint32(24,true),22050);assert.equal(v.getUint32(40,true),buffer.byteLength-44);
  let sum=0;for(let i=44;i<buffer.byteLength;i+=2)sum+=(v.getInt16(i,true)/32768)**2;
  assert.ok(Math.sqrt(sum/((buffer.byteLength-44)/2))>.05);
 }
});
test('HTMLAudio play is gesture-synchronous, reports failure, retries and stops on mute/close',async()=>{
 const old=globalThis.Audio;let instance,builds=0,calls=0,fail=true;const states=[];
 globalThis.Audio=class{constructor(){instance=this;builds++;}setAttribute(){}removeAttribute(){}load(){}pause(){this.paused=true;}play(){calls++;this.paused=false;return fail?Promise.reject(Error('blocked')):Promise.resolve();}};
 try{
  const a=createTankAudio(s=>states.push(s));assert.equal(builds,0);a.unlock(true);assert.equal(calls,1);
  await new Promise(r=>setTimeout(r,0));assert.equal(states.at(-1),'blocked');fail=false;a.unlock(true);
  await new Promise(r=>setTimeout(r,0));assert.equal(states.at(-1),'ready');assert.equal(instance.volume,1);assert.equal(instance.muted,false);
  a.toggle();assert.equal(states.at(-1),'muted');assert.equal(instance.paused,true);a.play('fire');assert.equal(calls,2);a.close();
 }finally{globalThis.Audio=old;}
});
