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
export function createTankAudio(onState=()=>{}) {
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
