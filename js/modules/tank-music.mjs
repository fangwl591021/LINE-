// Original 8-bar chiptune: pulse lead, triangle bass, arpeggio and deterministic percussion.
// PCM is generated locally; separate media player preserves the confirmed sound-effects path.
export function musicWav(){
 const rate=22050,beat=60/112,seconds=beat*32,n=Math.round(rate*seconds),buffer=new ArrayBuffer(44+n*2),v=new DataView(buffer);
 const text=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
 text(0,'RIFF');v.setUint32(4,36+n*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);
 v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,n*2,true);
 const melody=[76,0,79,81,79,76,74,71,74,76,79,0,78,74,71,0,72,76,79,83,81,79,76,72,74,78,81,0,79,78,74,0,
  76,79,83,86,83,81,79,76,74,78,81,83,81,78,74,71,72,76,79,81,79,76,72,0,74,78,81,78,76,74,71,0];
 const roots=[40,43,45,47,40,43,45,47],hz=m=>440*2**((m-69)/12),pulse=p=>(p%1)<.25?1:-1,tri=p=>1-4*Math.abs((p%1)-.5);
 let lead=0,bass=0,arp=0,noise=7;
 for(let i=0;i<n;i++){
  const t=i/rate,b=t/beat,bar=Math.min(7,Math.floor(b/4)),step=Math.min(63,Math.floor(b*2)),local=(b*2)%1;
  const note=melody[step],root=roots[bar];lead+=hz(note||76)/rate;bass+=hz(root)/rate;arp+=hz(root+24+[0,7,12,7][Math.floor(b*4)%4])/rate;
  const env=Math.min(1,local*25)*Math.max(0,1-local/.86);
  noise=(Math.imul(noise,1664525)+1013904223)>>>0;
  const hat=((noise/4294967296)*2-1)*Math.exp(-local*30)*.018;
  const bp=b%1,kick=Math.sin(2*Math.PI*(52*bp*beat+3*(1-Math.exp(-bp*beat*35))))*Math.exp(-bp*22)*.07;
  const mix=(note?pulse(lead)*env*.065:0)+tri(bass)*.055+pulse(arp)*.018*Math.max(0,1-((b*4)%1)) + hat+kick;
  // Quantised 8-bit timbre in a broadly supported 16-bit WAV container; baked low volume for iOS.
  const fade=Math.min(1,i/180,(n-1-i)/180),sample=Math.round(mix*127)/127*fade;
  v.setInt16(44+i*2,Math.round(sample*32767),true);
 }
 return buffer;
}
export function createTankMusic(onState=()=>{}){
 let player=null,url='',enabled=true,generation=0;
 const report=state=>onState(enabled?state:'muted');
 function start(){
  if(!enabled)return;
  try{
   if(!player){url=URL.createObjectURL(new Blob([musicWav()],{type:'audio/wav'}));player=new Audio(url);player.loop=true;player.preload='auto';player.setAttribute('playsinline','');player.volume=1;}
   const current=player,attempt=++generation;
   void Promise.resolve(current.play()).then(()=>{if(attempt===generation&&current===player)report('ready');})
    .catch(()=>{if(attempt===generation&&current===player)report('blocked');});
  }catch{report('blocked');}
 }
 function pause(){generation++;player?.pause();report('idle');}
 return {start,pause,get enabled(){return enabled;},toggle(active=true){enabled=!enabled;if(enabled&&active)start();else pause();},
  close(){pause();if(player){player.removeAttribute('src');player.load();player=null;}if(url)URL.revokeObjectURL(url);url='';}
 };
}
