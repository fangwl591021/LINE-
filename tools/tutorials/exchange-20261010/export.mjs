import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const evidence=[];
for(const kind of ['exchange-use','exchange-applications']){
  const file=kind+'-tutorial-v1.mp4',m=JSON.parse(readFileSync(kind+'/edit-manifest.json'));
  execFileSync('higgsedit',['build','edit.jsx'],{stdio:'inherit',env:{...process.env,TUTORIAL_KIND:kind}});
  execFileSync('higgsedit',['render',kind+'/native-edit','--out',resolve(file),'--bitrate','1600k','--shards','4','--concurrency','2'],{stdio:'inherit'});
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
  const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio'),duration=Number(probe.format.duration);
  assert.equal(v.codec_name,'h264');assert.equal(v.width,720);assert.equal(v.height,1600);assert.equal(v.r_frame_rate,'24/1');assert.equal(a.codec_name,'aac');assert.ok(Math.abs(duration-m.duration)<.3);
  execFileSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{stdio:'inherit'});
  const volume=spawnSync('ffmpeg',['-i',file,'-af','volumedetect','-vn','-sn','-dn','-f','null','-'],{encoding:'utf8'});assert.equal(volume.status,0);
  const mean=Number(/mean_volume: ([-\d.]+) dB/.exec(volume.stderr)?.[1]),peak=Number(/max_volume: ([-\d.]+) dB/.exec(volume.stderr)?.[1]);assert.ok(mean>-45&&peak<=0&&peak>-25);
  const c=JSON.parse(readFileSync(kind+'/capture-evidence.json'));assert.deepEqual(c.errors,[]);assert.deepEqual(c.blocked,[]);assert.equal(c.realMessagesSent,0);assert.equal(c.productionWrites,0);
  const result={kind,file,duration,bytes:statSync(file).size,sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),width:v.width,height:v.height,fps:v.r_frame_rate,audio:a.codec_name,audioMeanDb:mean,audioPeakDb:peak,fullDecodePassed:true,productionWrites:0,realMessagesSent:0,sourceCommit:c.sourceCommit,chapters:m.scenes.map(s=>[Number(s.at.toFixed(3)),s.title])};evidence.push(result);
  for(const s of [m.scenes[1],m.scenes[4],m.scenes[7]])execFileSync('ffmpeg',['-y','-ss',String(s.at+s.dur-1),'-i',file,'-frames:v','1','-vf','scale=360:800','-q:v','3',kind+'/review-'+s.id+'.jpg'],{stdio:'ignore'});
  writeFileSync(kind+'/export-evidence.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
writeFileSync('export-evidence.json',JSON.stringify(evidence,null,2));
writeFileSync('README.md','# 交流專區使用與應用教學\n\n逐 byte 核對正式 HTML、CSS、JS 與基線 Git。隔離虛構會員、貼文、訊息、AI 審核與扣點回報；零正式資料異動、零真實訊息。不是真人 LINE 通知或送達驗收。優惠券只填表未發券或核銷。\n\n720×1600、24fps、H.264/AAC，台灣中文旁白及原生步驟標示，未宣稱完整語音字幕。\n\n重建：node capture.mjs；node prepare.mjs；node export.mjs。字型授權 OFL.txt。\n');
execFileSync('zip',['-qr','exchange-tutorials-editable-source-v1.zip','capture.mjs','prepare.mjs','edit.jsx','export.mjs','README.md','export-evidence.json','NotoSansTC.ttf','OFL.txt','exchange-use','exchange-applications','-x','*native-edit*','*page@*','*.webm','*preview-*.png']);
