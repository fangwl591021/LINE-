// Original soft chiptune and note effects, encoded locally; no downloads.
export function gomokuWav(kind='music'){
  const melody=[523,659,784,659,587,698,880,698,523,659,784,1047,880,784,659,0,440,523,659,523,392,494,587,494,440,523,659,784,659,587,523,0];
  const notes=kind==='music'?melody:kind==='win'?[523,659,784,1047]:kind==='lose'?[659,523,392]:[kind==='place'?660:880];
  const beat=kind==='music'?.27:kind==='place'?.09:.15,rate=16000,n=Math.floor(notes.length*beat*rate),buf=new ArrayBuffer(44+n*2),v=new DataView(buf);
  const str=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++){const t=i/rate,k=Math.floor(t/beat),phase=t%beat/beat,hz=notes[k],env=Math.min(phase*30,1)*(1-phase)**1.4;
    const wave=hz?(Math.sin(2*Math.PI*hz*t)+.2*Math.sin(4*Math.PI*hz*t)):0;
    const bass=kind==='music'?Math.sin(2*Math.PI*([131,147,131,110][Math.floor(k/8)]||131)*t)*.23*env:0;
    v.setInt16(44+i*2,Math.round((wave*env+bass)*(kind==='music'?.11:.23)*32767),true);
  }return buf;
}
export function createGomokuAudio(report=()=>{}){
  let musicEnabled=true,soundEnabled=true,active=false,dead=false,track=null,effect=null,version=0;const urls=new Map();
  const url=kind=>{if(!urls.has(kind))urls.set(kind,URL.createObjectURL(new Blob([gomokuWav(kind)],{type:'audio/wav'})));return urls.get(kind);};
  function play(kind='place'){
    if(dead||!soundEnabled||!active)return;const current=++version;try{effect??=new Audio();effect.setAttribute('playsinline','');effect.src=url(kind);void effect.play().catch(e=>{if(!dead&&active&&soundEnabled&&current===version&&e?.name!=='AbortError')report('瀏覽器限制音效，點音效按鈕重試');});}catch{/* Optional audio. */}
  }
  function music(){if(dead||!active||!musicEnabled)return;try{track??=new Audio(url('music'));track.loop=true;track.setAttribute('playsinline','');void track.play().catch(e=>{if(!dead&&active&&musicEnabled&&e?.name!=='AbortError')report('音樂暫時無法播放，可點音樂按鈕重試');});}catch{}}
  return {get musicEnabled(){return musicEnabled;},get soundEnabled(){return soundEnabled;},start(){if(dead)return;active=true;music();play('place');},play,
    toggleMusic(){musicEnabled=!musicEnabled;if(musicEnabled)music();else track?.pause();return musicEnabled;},
    toggleSound(){soundEnabled=!soundEnabled;if(soundEnabled)play();else effect?.pause();return soundEnabled;},
    pause(){active=false;track?.pause();effect?.pause();},
    destroy(){dead=true;active=false;for(const p of [track,effect])if(p){p.pause();p.removeAttribute('src');p.load();}for(const value of urls.values())URL.revokeObjectURL(value);urls.clear();}
  };
}
