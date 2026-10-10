import fs from 'node:fs';
import path from 'node:path';
export default async({project,frame,text,rect,media})=>{
  const kind=process.env.TUTORIAL_KIND;if(!['exchange-use','exchange-applications'].includes(kind))throw Error('Set TUTORIAL_KIND');
  const m=JSON.parse(fs.readFileSync(kind+'/edit-manifest.json','utf8'));
  const p=await project({dir:path.resolve(kind+'/native-edit'),size:'720x1600',fps:24,background:'#103f37'});
  const font=await p.add(path.resolve('NotoSansTC.ttf')),capture=await p.add(path.resolve(kind+'/capture.mp4'));
  const label=(value,opts={})=>text(value,{typography:{fontAssetId:font.id,script:'Hani',axes:{wght:600},language:'zh-TW'},fontSize:27,lineHeight:1.25,color:'#fff',...opts});
  for(let i=0;i<m.scenes.length;i++){
    const s=m.scenes[i],shot=await p.add(path.resolve(s.shot));const clip=s.from===undefined?0:Math.max(0,Math.min(s.to-s.from,s.dur-0.5));
    const ui=(handle,extra={})=>frame({x:27,y:108,width:666,height:1442,layout:'none',clip:true,radius:14,background:'#fff'},[media({file:handle,x:0,y:0,width:666,height:1442,fit:'contain',...extra})]);
    if(clip>0)p.compose(ui(capture,{trimStart:s.from}),{at:s.at,dur:clip,name:s.id+'-operation'});
    p.compose(ui(shot),{at:s.at+clip,dur:s.dur-clip,name:s.id+'-hold'});
    // All teaching titles/step labels are native graphics, not HTML screenshots.
    p.compose(frame({width:720,height:1600,layout:'none'},[
      rect({x:0,y:0,width:720,height:104,fill:'#103f37'}),label(s.title,{x:24,y:12,width:672,height:42,fontSize:27}),
      label(s.tip,{x:24,y:59,width:672,height:37,fontSize:21,color:'#baf1de'}),
      rect({x:0,y:1554,width:720,height:46,fill:'#103f37'}),label(`隔離教學示範・未發文、傳訊或扣點   ${i+1} / ${m.scenes.length}`,{x:20,y:1562,width:680,height:32,fontSize:19,align:'center'}),
      rect({x:0,y:1595,width:720*(i+1)/m.scenes.length,height:5,fill:'#49d998'})
    ]),{at:s.at,dur:s.dur,name:s.id+'-steps'});
    const voice=await p.add(path.resolve(s.voice));p.cut(voice,{from:0,dur:s.audioDuration,at:s.at+0.25});
  }
  for(const s of [m.scenes[1],m.scenes[4],m.scenes[7]])await p.frame(s.at+s.dur-0.3,path.resolve(kind+'/preview-'+s.id+'.png'));
};
