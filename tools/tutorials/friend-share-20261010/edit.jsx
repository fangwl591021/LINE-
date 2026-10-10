import fs from 'node:fs';
import path from 'node:path';
export default async({project,frame,text,rect,media})=>{
  const m=JSON.parse(fs.readFileSync('share/edit-manifest.json','utf8'));
  const p=await project({dir:path.resolve('share/native-edit'),size:'720x1600',fps:24,background:'#103f37'});
  const font=await p.add(path.resolve('NotoSansTC.ttf')),capture=await p.add(path.resolve('share/capture.mp4'));
  const label=(value,opts={})=>{
    const style={typography:{fontAssetId:font.id,script:'Hani',axes:{wght:600},language:'zh-TW'},fontSize:27,lineHeight:1.25,color:'#fff',...opts};
    if(!/[A-Za-z]/.test(value))return text(value,style);
    let x=0;const parts=value.split(/([A-Za-z]+)/).filter(Boolean).map(part=>{
      const latin=/^[A-Za-z]+$/.test(part),width=style.fontSize*Array.from(part).reduce((n,c)=>n+(latin?0.72:c.charCodeAt(0)<128?0.56:1),0);
      const leaf=text(part,{...style,x,y:0,width:width+4,typography:{...style.typography,script:latin?'Latn':'Hani'}});x+=width;return leaf;
    });return frame({x:style.x,y:style.y,width:style.width,height:style.height,layout:'none'},parts);
  };
  for(let i=0;i<m.scenes.length;i++){
    const s=m.scenes[i],shot=await p.add(path.resolve(s.shot));
    const clip=s.from===undefined?0:Math.max(0,Math.min(s.to-s.from,s.dur-0.5));
    const ui=(handle,extra={})=>frame({x:27,y:108,width:666,height:1442,layout:'none',clip:true,radius:14,background:'#fff'},[media({file:handle,x:0,y:0,width:666,height:1442,fit:'contain',...extra})]);
    if(clip>0)p.compose(ui(capture,{trimStart:s.from}),{at:s.at,dur:clip,name:s.id+'-operation'});
    p.compose(ui(shot),{at:s.at+clip,dur:s.dur-clip,name:s.id+'-hold'});
    p.compose(frame({width:720,height:1600,layout:'none'},[
      rect({x:0,y:0,width:720,height:104,fill:'#103f37'}),label(s.title,{x:24,y:12,width:672,height:42,fontSize:27}),
      label(s.tip,{x:24,y:59,width:672,height:37,fontSize:21,color:'#baf1de'}),
      rect({x:0,y:1554,width:720,height:46,fill:'#103f37'}),label(`隔離教學示範・未傳送真實訊息   ${i+1} / ${m.scenes.length}`,{x:20,y:1562,width:680,height:32,fontSize:20,align:'center'}),
      rect({x:0,y:1595,width:720*(i+1)/m.scenes.length,height:5,fill:'#49d998'})
    ]),{at:s.at,dur:s.dur,name:s.id+'-steps'});
    if(s.diagram)p.compose(frame({x:58,y:470,width:604,height:550,layout:'none',background:'#eefbf5',radius:24},[
      label('接下來在 LINE 選人畫面',{x:24,y:30,width:560,height:48,color:'#103f37',fontSize:30}),
      label('① 勾選好友或群組',{x:36,y:122,width:530,height:54,color:'#103f37',fontSize:32}),
      label('② 確認對象，按「分享」',{x:36,y:222,width:530,height:54,color:'#103f37',fontSize:30}),
      label('取消／返回：不算已發送',{x:36,y:322,width:530,height:54,color:'#a14b28',fontSize:28}),
      label('流程示意・非實際 LINE 選人畫面',{x:24,y:437,width:560,height:64,color:'#52685e',fontSize:23})
    ]),{at:s.at+clip,dur:s.dur-clip,name:'native-picker-diagram'});
    const voice=await p.add(path.resolve(s.voice));p.cut(voice,{from:0,dur:s.audioDuration,at:s.at+0.25});
  }
  for(const id of ['qr','picker','copy','store']){const s=m.scenes.find(s=>s.id===id);await p.frame(s.at+s.dur-0.3,path.resolve('share/preview-'+id+'.png'));}
  if(!process.env.TUTORIAL_PREVIEW)await p.render(path.resolve('friend-share-tutorial-v1.mp4'),{depth:8,bitrate:1600000,shards:4,concurrency:2});
};
