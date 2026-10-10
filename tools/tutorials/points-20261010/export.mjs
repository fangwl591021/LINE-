import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const roles=['gift','redeem'];
await Promise.all(roles.map(role=>new Promise((done,fail)=>{
  const proc=spawn('higgsedit',['render',role+'/native-edit','--out',resolve(role+'/final.mp4'),'--bitrate','1600k','--shards','4','--concurrency','2'],{stdio:'inherit'});
  proc.on('error',fail);proc.on('close',code=>code===0?done():fail(Error(role+' render failed '+code)));
})));
const results=[];
for(const role of roles){
  const file=role+'/final.mp4',manifest=JSON.parse(readFileSync(role+'/edit-manifest.json'));
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
  const video=probe.streams.find(s=>s.codec_type==='video'),audio=probe.streams.find(s=>s.codec_type==='audio');
  assert.equal(video.codec_name,'h264');assert.equal(video.width,720);assert.equal(video.height,1600);assert.equal(video.r_frame_rate,'24/1');assert.equal(audio.codec_name,'aac');
  const duration=Number(probe.format.duration);assert.ok(Math.abs(duration-manifest.duration)<0.3);
  execFileSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{stdio:'inherit'});
  const volume=spawnSync('ffmpeg',['-i',file,'-af','volumedetect','-vn','-sn','-dn','-f','null','-'],{encoding:'utf8'});assert.equal(volume.status,0);
  const mean=Number(/mean_volume: ([-\d.]+) dB/.exec(volume.stderr)?.[1]),peak=Number(/max_volume: ([-\d.]+) dB/.exec(volume.stderr)?.[1]);assert.ok(mean>-45&&peak<=0&&peak>-25);
  const evidence=JSON.parse(readFileSync(role+'/capture-evidence.json'));assert.equal(evidence.productionWrites,0);assert.deepEqual(evidence.errors,[]);assert.equal(evidence.syntheticWrites.length,1);
  results.push({role,file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),bytes:statSync(file).size,duration,width:video.width,height:video.height,fps:video.r_frame_rate,audio:audio.codec_name,audioMeanDb:mean,audioPeakDb:peak,fullDecodePassed:true,chapters:manifest.scenes.map(s=>({at:s.at,title:s.title,tip:s.tip}))});
}
writeFileSync('export-evidence.json',JSON.stringify({success:true,sourceCommit:'04b670bff685336439b7cf38d848c1c776f358c9',productionWrites:0,results},null,2));
writeFileSync('README.md','# 贈點與折抵操作教學\n\n錄製日期：2026-10-10。正式已發布 UI、虛構會員、隔離 API、測試相機。正式點數異動 0 筆；未執行真實 LINE 登入或實體手機相機交易。\n\n- gift：電話贈送 100 點，會員端查看 +100 明細。\n- redeem：會員出示錢包 QR，店家用實際解碼器掃描，消費 100 元折抵 30 點，應收 70 元，會員端查看 -30 明細。\n- 本片非活動／課程報到核銷，非網路訂單付款。\n- 實際收款由店家處理；結果未知先查原交易，勿重複操作。\n\n720×1600、24fps、H.264/AAC、台灣中文旁白與步驟標示。\n\n重新編輯：node prepare.mjs；TUTORIAL_ROLE=gift higgsedit build edit.jsx；TUTORIAL_ROLE=redeem higgsedit build edit.jsx。字型授權見 OFL.txt。\n\n教學製作未變更正式程式、角色、資料或點數帳本；影片尚未加入平台教學區。\n');
execFileSync('zip',['-qr','points-tutorials-editable-source-v1.zip','capture.mjs','prepare.mjs','edit.jsx','export.mjs','README.md','export-evidence.json','NotoSansTC.ttf','OFL.txt','gift','redeem','-x','*page@*','*failure*','*final.mp4','*review-*.jpg']);
console.log(JSON.stringify({result:'PASS',productionWrites:0,results:results.map(r=>({role:r.role,duration:r.duration,bytes:r.bytes,sha256:r.sha256,mean:r.audioMeanDb,peak:r.audioPeakDb})),archiveBytes:statSync('points-tutorials-editable-source-v1.zip').size}));
