// Original synthesised effects. No asset downloads; context only starts in a user gesture.
export function synthEffect(ctx,kind) {
  const t=ctx.currentTime;
  const note=(hz,end,duration,volume,type='triangle',delay=0)=>{
    const osc=ctx.createOscillator(),gain=ctx.createGain(),at=t+delay;
    osc.type=type;osc.frequency.setValueAtTime(hz,at);
    osc.frequency.exponentialRampToValueAtTime(end,at+duration);
    gain.gain.setValueAtTime(.001,at);gain.gain.linearRampToValueAtTime(volume,at+.008);
    gain.gain.exponentialRampToValueAtTime(.001,at+duration);
    osc.connect(gain);gain.connect(ctx.destination);osc.start(at);osc.stop(at+duration+.01);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  };
  if(kind==='win'||kind==='ready'){
    (kind==='win'?[523,659,784,1047]:[523,784]).forEach((hz,i)=>note(hz,hz,.22,.16,'sine',i*.12));
  }else if(kind==='lose'){
    [330,247,165].forEach((hz,i)=>note(hz,hz*.7,.3,.18,'triangle',i*.17));
  }else if(kind==='hit'){
    note(150,42,.3,.25,'sawtooth');note(430,70,.16,.1,'triangle');
  }else if(kind==='enemyFire')note(260,85,.13,.13,'triangle');
  else {note(740,140,.12,.23,'triangle');note(110,45,.15,.15,'sine');}
}
export function createWebTankAudio(onState=()=>{}) {
  let context=null,enabled=true;
  const report=()=>onState(!enabled?'muted':context?.state==='running'?'ready':'blocked');
  function play(kind){if(!enabled||context?.state!=='running')return;try{synthEffect(context,kind);}catch{/* Audio is optional. */}}
  function unlock(preview=false){
    if(!enabled)return;
    try{
      const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!Audio){report();return;}
      if(!context||context.state==='closed'){context=new Audio();context.onstatechange=report;}
      const current=context;
      // resume must be called synchronously from start, fire, keyboard or sound-button gesture.
      const resumed=current.state!=='running'?current.resume():Promise.resolve();
      void Promise.resolve(resumed).then(()=>{if(context!==current)return;report();if(preview)play('ready');}).catch(report);
      report();
    }catch{report();}
  }
  return {play,unlock,get enabled(){return enabled;},toggle(){enabled=!enabled;if(enabled)unlock(true);else report();},
    close(){const old=context;context=null;if(old){old.onstatechange=null;try{void old.close().catch(()=>{});}catch{}}}};
}

// Generate real PCM WAV bytes without AudioContext, network assets or third-party sounds.
export function effectWav(kind){
 const rate=22050,duration=kind==='win'||kind==='lose'?.85:kind==='ready'?.45:kind==='hit'?.3:.18;
 const count=Math.ceil(rate*duration),buffer=new ArrayBuffer(44+count*2),v=new DataView(buffer);
 const text=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
 text(0,'RIFF');v.setUint32(4,36+count*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);
 v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,count*2,true);
 let phase=0;
 for(let i=0;i<count;i++){
  const t=i/rate,q=t/duration;let hz,env;
  if(['ready','win','lose'].includes(kind)){
   const notes=kind==='lose'?[392,294,196]:kind==='win'?[523,659,784,1047]:[523,784];
   const n=Math.min(notes.length-1,Math.floor(q*notes.length)),local=(q*notes.length)%1;
   hz=notes[n];env=Math.min(1,local*25)*Math.pow(1-local,1.5);
  }else{hz=kind==='hit'?130-90*q:kind==='enemyFire'?300-180*q:800-650*q;env=Math.min(1,t/.005)*Math.pow(1-q,2);}
  phase+=2*Math.PI*hz/rate;
  const sample=(Math.sin(phase)*.65+Math.sin(phase*2.03)*.18)*env;
  v.setInt16(44+i*2,Math.round(sample*32767),true);
 }
 return buffer;
}
export function createTankAudio(onState=()=>{}){
 let mode='media',enabled=true,player=null,unlocked=false,generation=0,busyUntil=0;
 const urls=new Map();
 const report=state=>onState(enabled?state:'muted',mode);
 const web=createWebTankAudio(state=>{if(mode==='web')report(state);});
 function mediaPlay(kind){
  if(!enabled||!player)return;
  const priority=kind==='win'||kind==='lose'||kind==='ready';
  if(!priority&&Date.now()<busyUntil)return;
  try{
   if(!urls.has(kind))urls.set(kind,URL.createObjectURL(new Blob([effectWav(kind)],{type:'audio/wav'})));
   const attempt=++generation,current=player;
   current.pause();current.src=urls.get(kind);current.muted=false;current.volume=1;
   busyUntil=Date.now()+(priority?900:kind==='hit'?180:70);
   // Called synchronously in the gesture on first unlock, not after fetch()/resume().
   void Promise.resolve(current.play()).then(()=>{
    if(attempt!==generation||player!==current)return;unlocked=true;report('ready');
   }).catch(()=>{if(attempt===generation&&player===current){unlocked=false;report('blocked');}});
  }catch{unlocked=false;report('blocked');}
 }
 function unlock(preview=false){
  if(!enabled)return;
  if(mode==='web'){web.unlock(preview);return;}
  try{
   if(!player){player=new Audio();player.preload='auto';player.setAttribute('playsinline','');}
   if(preview||!unlocked)mediaPlay('ready');
  }catch{report('blocked');}
 }
 function stopMedia(){generation++;unlocked=false;busyUntil=0;if(player){player.pause();player.removeAttribute('src');player.load();player=null;}}
 return {unlock,get enabled(){return enabled;},get mode(){return mode;},
  play(kind){if(!enabled)return;if(mode==='web')web.play(kind);else if(unlocked)mediaPlay(kind);},
  toggle(){enabled=!enabled;if(enabled)unlock(true);else{stopMedia();web.close();report('muted');}},
  switchMode(){stopMedia();web.close();mode=mode==='media'?'web':'media';enabled=true;report('blocked');unlock(true);},
  close(){stopMedia();web.close();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}
 };
}
