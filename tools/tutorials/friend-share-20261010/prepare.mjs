import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const e=JSON.parse(readFileSync('share/capture-evidence.json'));
execFileSync('ffmpeg',['-y','-i',e.video,'-an','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','share/capture.mp4'],{stdio:'ignore'});
let at=0;const scenes=[];
for(const s of e.timeline){
  const voice='share/'+s.id+'.mp3';execFileSync('edge-tts',['--voice','zh-TW-HsiaoChenNeural','--rate=-3%','--text',s.text,'--write-media',voice],{stdio:'inherit'});
  const audioDuration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',voice],{encoding:'utf8'}).trim());
  const dur=Math.ceil((audioDuration+0.85)*24)/24;scenes.push({...s,audioDuration,voice,at,dur});at+=dur;
}
writeFileSync('share/edit-manifest.json',JSON.stringify({width:720,height:1600,fps:24,duration:at,scenes},null,2));
console.log(JSON.stringify({duration:at,chapters:scenes.map(s=>[Number(s.at.toFixed(3)),s.title])}));
