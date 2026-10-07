// Loopback-only regression surface. Supply a private local fixture via --reference;
// images are never committed and all OCR/archive/card APIs are local mocks.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const reference=process.argv[process.argv.indexOf('--reference')+1];
if(!process.argv.includes('--reference')||!reference)throw Error('Pass --reference <local image>');
const files=new Set(['js/modules/mycard.js','js/modules/a-kaffit-card-scanner-adapter.js','js/modules/a-kaffit-vision-v3-crop.js','js/modules/a-kaffit-card-scanner/card-scanner-v2.js','js/modules/card-side-crop-editor.mjs','js/modules/card-image-archive.mjs','js/modules/card-collection-sides.mjs']);
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>名片裁切回歸驗證（僅本機）</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css"><script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js"></script>
<style>body{font:16px system-ui;background:#eef8f5;color:#183a3a;margin:12px}button{font:inherit;cursor:pointer;padding:10px;border-radius:10px;margin:3px;border:1px solid #ccd8d4}#my-card-wysiwyg-preview{max-width:480px;margin:auto;background:white}.w-full{width:100%}.hidden{display:none}.my-wysiwyg-card-shell{overflow:hidden;border:1px solid #ccd8d4;border-radius:18px}.my-wysiwyg-edit-icon{display:none}#my-card-wysiwyg-preview button{box-sizing:border-box}.my-wysiwyg-layout-grid{display:flex}.my-wysiwyg-layout-grid button{flex:1}#fixture-controls{position:fixed;bottom:0;left:0;right:0;z-index:14000;background:#fff5ce;padding:4px;font-size:12px}#fixture-controls button{font-size:12px;padding:6px}#result{white-space:pre-wrap;margin-bottom:60px}</style>
<h2>圖片完整顯示與裁切失敗驗證</h2><p>原照只留本機；辨識及存檔均為模擬。</p><button id="editor">顯示收藏名片編輯預覽</button><button id="scan">模擬這張照片定位失敗</button><button id="auto">模擬可靠定位</button><div id="my-card-wysiwyg-preview"></div><pre id="result"></pre><div id="fixture-controls">本機測試<button id="back">加入背面照片</button></div>
<script src="/js/modules/mycard.js"></script><script type="module">
window.Config={API_URL:location.origin};window.currentUserProfile={userId:'LOCAL-TEST'};window.currentUser={name:'測試'};window.liff={getAccessToken:()=> 'LOCAL-ONLY'};window.canEditCardRecord=()=>true;window.buildRecognizedCardButtons=()=>[];
window.showToast=m=>document.getElementById('result').textContent=m;window.allCards=[];window.testCalls=[];window.testMode='failed';window.testUploads=[];
window.fetchAPI=async(a,p)=>{
 window.testCalls.push({action:a,rowId:p.rowId});
 if(a==='recognizeCardWithGPT4o'){const loc=window.testMode==='auto'?{detected:true,incomplete:false,cropConfidence:.95,boundingBox:{x:.075,y:.30,width:.85,height:.40},corners:[{x:.075,y:.30},{x:.925,y:.30},{x:.925,y:.70},{x:.075,y:.70}]}:{detected:false,incomplete:false,cropConfidence:0,boundingBox:{},corners:[]};return {displayName:'範例聯絡人',companyName:'範例公司',cardLocalization:loc,...(p.base64BackImage?{backCardLocalization:loc}:{})};}
 if(a==='uploadImageToR2'){const blob=await(await fetch(p.base64Image)).blob();const url=URL.createObjectURL(blob);window.testUploads.push({url,bytes:blob.size});return {url};}
 if(a==='saveCard'){window.testSaved=p;return {rowId:p.rowId,success:true};}
 throw Error('Unexpected mock API '+a);
};
await import('/js/modules/a-kaffit-card-scanner-adapter.js');
const blob=await(await fetch('/reference.webp')).blob(),photo=new File([blob],'reference.webp',{type:'image/webp'});
document.getElementById('editor').onclick=()=>window.renderFixtureEditor(location.origin+'/reference.webp');
document.getElementById('scan').onclick=()=>{window.testMode='failed';window.recognizeCard({files:[photo],value:''});};
document.getElementById('auto').onclick=async()=>{window.testMode='auto';const c=document.createElement('canvas');c.width=1200;c.height=1600;const x=c.getContext('2d');x.fillStyle='#334155';x.fillRect(0,0,1200,1600);x.fillStyle='white';x.fillRect(90,480,1020,640);x.fillStyle='#113b31';x.font='60px sans-serif';x.fillText('範例名片',160,600);const b=await new Promise(r=>c.toBlob(r));window.recognizeCard({files:[new File([b],'auto.png',{type:'image/png'})],value:''});};
document.getElementById('back').onclick=()=>{const input=document.getElementById('ak-back-input');if(!input)return;const dt=new DataTransfer();dt.items.add(photo);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
</script></html>`;
http.createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;res.setHeader('Cache-Control','no-store');
  if(path==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
  if(path==='/reference.webp'){res.setHeader('Content-Type','image/webp');res.end(await readFile(reference));return;}
  if(path.startsWith('/v1/card-images')&&req.method==='POST'){for await(const chunk of req){}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({job:{id:'LOCAL-MOCK'}}));return;}
  if(!files.has(path.slice(1))){res.writeHead(404);res.end();return;}
  let text=await readFile(new URL(path.slice(1),root),'utf8');
  if(path==='/js/modules/mycard.js')text=text.replace(/\}\)\(\);\s*$/, 'window.renderFixtureEditor=url=>{currentCardData={姓名:"範例聯絡人"};wysiwygState={recordMode:true,cfg:{layoutStyle:"landscape",imgUrl:url,buttons:[]}};renderMyCardCopyUrlPanelHtml=()=>"";initMyCardSocialLikeWidget=()=>{};renderMyCardWysiwyg();};})();');
  res.setHeader('Content-Type','text/javascript;charset=utf-8');res.end(text);
 }catch(error){res.writeHead(500);res.end(error.message);}
}).listen(8830,'127.0.0.1',()=>console.log('Card crop test: http://127.0.0.1:8830/ (local mock APIs only)'));
