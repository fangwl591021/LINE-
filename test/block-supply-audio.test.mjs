import test from 'node:test';
import assert from 'node:assert/strict';
import {EFFECTS,supplyEffectWav,createSupplyAudio} from '../js/modules/block-supply-audio.mjs';
test('all original supply effects have valid non-silent low-level PCM',()=>{
 for(const kind of Object.keys(EFFECTS)){
  const wav=supplyEffectWav(kind),v=new DataView(wav);assert.equal(new TextDecoder().decode(wav.slice(0,4)),'RIFF');assert.equal(v.getUint32(24,true),22050);assert.equal(v.getUint32(40,true),wav.byteLength-44);
  let peak=0,squares=0;for(let i=44;i<wav.byteLength;i+=2){const a=v.getInt16(i,true)/32768;peak=Math.max(peak,Math.abs(a));squares+=a*a;}
  assert(peak>.02&&peak<=.23);assert(Math.sqrt(squares/((wav.byteLength-44)/2))>.01);
 }
});
test('audio is gesture-gated, independently muted, safe when blocked, and disposed',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'Audio'),storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const media=[],saved=new Map();let blocked=false;
 class FakeAudio{constructor(){this.paused=true;media.push(this);}setAttribute(){}removeAttribute(){this.src='';}load(){}pause(){this.paused=true;}play(){if(blocked)return Promise.reject(Error('blocked'));this.paused=false;return Promise.resolve();}}
 Object.defineProperty(globalThis,'Audio',{value:FakeAudio,configurable:true});Object.defineProperty(globalThis,'localStorage',{value:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},configurable:true});
 try{
  const states=[],a=createSupplyAudio((...args)=>states.push(args));a.play('move');assert.equal(media.length,0);a.start();await Promise.resolve();assert.equal(media.length,2);
  a.setMusicEnabled(false);assert(media[0].paused);assert(!media[1].paused);a.setSoundEnabled(false);assert(media[1].paused);a.stop();
  assert.deepEqual(JSON.parse(saved.get('line-game-audio-v1')),{music:false,sound:false});a.destroy();a.destroy();a.start();assert.equal(media.length,2);
  const b=createSupplyAudio((...args)=>states.push(args));assert.deepEqual(b.settings,{music:false,sound:false});blocked=true;b.setSoundEnabled(true);b.start();await new Promise(r=>setImmediate(r));assert(states.some(s=>s[1]==='blocked'));b.destroy();assert(media.every(a=>a.paused));
 }finally{for(const [key,d]of [['Audio',original],['localStorage',storage]]){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];}}
});
