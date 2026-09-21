import {createTankMusic} from './tank-music.mjs';
export const EFFECTS=Object.freeze({move:[330],rotate:[440,660],land:[150,100],clear:[523,659,784],combo:[659,784,1047],warning:[440,220,440],win:[523,659,784,1047],lose:[392,294,196]});
export function supplyEffectWav(kind){
 const notes=EFFECTS[kind]||EFFECTS.move,rate=22050,part=kind==='move'?.055:kind==='land'?.07:.12,n=Math.ceil(notes.length*part*rate);
 const buffer=new ArrayBuffer(44+n*2),v=new DataView(buffer),text=(i,s)=>[...s].forEach((c,j)=>v.setUint8(i+j,c.charCodeAt(0)));
 text(0,'RIFF');v.setUint32(4,36+n*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,n*2,true);
 let phase=0;for(let i=0;i<n;i++){const t=i/rate,index=Math.min(notes.length-1,Math.floor(t/part)),p=(t%part)/part;phase+=notes[index]/rate;
  const triangle=1-4*Math.abs(phase%1-.5),env=Math.min(1,p*20)*(1-p)**1.4;
  v.setInt16(44+i*2,Math.round(triangle*env*.22*32767),true);
 }return buffer;
}
export function createSupplyAudio(onState=()=>{}){
 const key='line-game-audio-v1';let settings={music:true,sound:true};
 try{const saved=JSON.parse(globalThis.localStorage?.getItem(key)||'{}');for(const k of ['music','sound'])if(typeof saved[k]==='boolean')settings[k]=saved[k];}catch{}
 let active=false,player=null,unlocked=false,generation=0,last=-Infinity,dead=false;const urls=new Map();
 const music=createTankMusic(state=>{if(!dead)onState('music',state);});
 if(!settings.music)music.toggle(false);
 const persist=()=>{try{globalThis.localStorage?.setItem(key,JSON.stringify(settings));}catch{}};
 const stopSound=()=>{generation++;unlocked=false;if(player){try{player.pause();player.removeAttribute('src');player.load();}catch{}player=null;}};
 function play(kind,gesture=false){
  if(dead||!settings.sound||(!gesture&&!unlocked))return;
  const time=globalThis.performance?.now?.()||0;if(kind==='move'&&time-last<65)return;
  try{
   if(!player){player=new Audio();player.setAttribute('playsinline','');player.preload='auto';}
   if(!urls.has(kind))urls.set(kind,URL.createObjectURL(new Blob([supplyEffectWav(kind)],{type:'audio/wav'})));
   const p=player,g=++generation;p.pause();p.src=urls.get(kind);last=time;
   Promise.resolve(p.play()).then(()=>{if(g===generation&&!dead){unlocked=true;onState('sound','ready');}}).catch(()=>{if(g===generation&&!dead){unlocked=false;onState('sound','blocked');}});
  }catch{onState('sound','blocked');}
 }
 return {get settings(){return {...settings};},start(){if(dead)return;active=true;music.start();play('rotate',true);},
  play,finish(kind){active=false;music.pause();play(kind);},stop(){active=false;music.pause();stopSound();},
  setMusicEnabled(value){if(dead)return;settings.music=!!value;persist();if(music.enabled!==settings.music)music.toggle(active);else if(active&&settings.music)music.start();onState('music',settings.music?'idle':'muted');},
  setSoundEnabled(value){if(dead)return;settings.sound=!!value;persist();if(settings.sound&&active)play('rotate',true);else stopSound();onState('sound',settings.sound?'idle':'muted');},
  destroy(){if(dead)return;dead=true;active=false;music.close();stopSound();for(const u of urls.values())URL.revokeObjectURL(u);urls.clear();}
 };
}
