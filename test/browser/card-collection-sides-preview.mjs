// Synthetic local preview. Uses real UI/image processing but NO production API or data.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const files=new Set(['js/modules/a-kaffit-card-scanner-adapter.js','js/modules/a-kaffit-vision-v3-crop.js','js/modules/card-collection-sides.mjs','js/shared/card-links.js']);
files.add('js/modules/a-kaffit-card-scanner/card-scanner-v2.js');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>名片正反面本機驗證</title><style>body{font:16px system-ui;margin:16px;color:#183a3a;background:#f3faf7}button{font:inherit;padding:12px;margin:4px}#fixture{position:fixed;bottom:0;left:0;z-index:14000;background:#fff4c7;padding:4px;font-size:12px}#result{white-space:pre-wrap}#detail{max-width:520px;margin:auto}</style>
<h2>收藏名片 · 合成測試</h2><button id="new">新增正面名片</button><button id="old">已收藏名片</button><div id="detail"></div><pre id="result"></pre><div id="fixture">僅本機測試<button id="back" style="font-size:12px">選取合成背面</button></div>
<script src="/js/shared/card-links.js"></script><script type="module">
await import('/js/modules/a-kaffit-card-scanner-adapter.js');
const result=document.getElementById('result'),detail=document.getElementById('detail');
const images={};
for(const side of ['front','back']){const c=document.createElement('canvas');c.width=900;c.height=500;const x=c.getContext('2d');x.fillStyle=side==='front'?'#e0f4ed':'#edf2ff';x.fillRect(0,0,900,500);x.fillStyle='#183a3a';x.font='bold 52px sans-serif';x.fillText(side==='front'?'測試企業・陳小明':'專業服務 / 背面',65,135);x.font='36px sans-serif';x.fillText(side==='front'?'業務顧問':'網站設計・品牌整合・教育培訓',65,235);x.fillText(side==='front'?'hello@example.com':'https://example.com',65,320);images[side]=await new Promise(r=>c.toBlob(b=>r(new File([b],side+'.png',{type:'image/png'}))))}
const objectUrls=Object.fromEntries(Object.entries(images).map(([k,v])=>[k,URL.createObjectURL(v)]));
const originalFetch=window.fetch.bind(window);window.fetch=async(url,opts)=>{
 if(String(url).startsWith(location.origin+'/v1/card-images'))return Response.json({job:{id:'LOCAL'}});
 if(String(url).startsWith(location.origin+'/front.png'))return new Response(images.front);
 if(String(url).startsWith(location.origin+'/back.png'))return new Response(images.back);
 return originalFetch(url,opts)
};
window.Config={API_URL:location.origin};window.liff={getAccessToken:()=> 'LOCAL-ONLY'};window.currentUserProfile={userId:'LOCAL'};window.currentUser={name:'合成示範'};window.canEditCardRecord=()=>true;
window.buildRecognizedCardButtons=()=>[];window.showToast=m=>result.textContent=m;
window.allCards=[];let writes=0,ocr=0,uploads=0;
window.fetchAPI=async(a,p)=>{
 if(a==='recognizeCardWithGPT4o'){ocr++;const loc={detected:true,incomplete:true,cropConfidence:.8,boundingBox:{x:0,y:0,width:1,height:1},corners:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],clippedEdges:[]};return {displayName:'陳小明',companyName:'測試企業',email:'hello@example.com',websiteUrl:p.base64BackImage?'https://example.com':'',profileDescription:p.base64BackImage?'提供網站設計、品牌整合及教育培訓。':'測試企業業務顧問。',primaryIndustry:'科技資訊',cardLocalization:loc,...(p.base64BackImage?{backCardLocalization:loc}:{})}}
 if(a==='uploadImageToR2')return {url:location.origin+'/'+(uploads++===0?'front':'back')+'.png'};
 if(a==='saveCard'||a==='updateCard'){writes++;const cfg=p.data||p;window.currentCard={...window.currentCard,...cfg,rowId:p.rowId};window.allCards=[window.currentCard];return {success:true,...window.currentCard};}
 throw Error('Unexpected API '+a)
};
window.openCardDetail=card=>{window.currentCard=card;detail.innerHTML=window.renderCollectedCardSides(card).replaceAll(location.origin+'/front.png',objectUrls.front).replaceAll(location.origin+'/back.png',objectUrls.back);result.textContent='同一張名片：'+card.rowId+'；OCR 次數 '+ocr+'；寫入次數 '+writes;};
window.loadCardData=()=>window.openCardDetail(window.currentCard);
document.getElementById('new').onclick=()=>{uploads=0;window.recognizeCard({files:[images.front],value:''})};
document.getElementById('old').onclick=()=>{uploads=1;window.openCardDetail({rowId:'EXISTING_ONE',姓名:'陳小明',公司名稱:'測試企業',服務項目:'原有服務',creatorId:'LOCAL',customConfig:JSON.stringify({imgUrl:location.origin+'/front.png',buttons:[],isPrivate:true})})};
document.getElementById('back').onclick=()=>{const input=document.getElementById('ak-back-input');if(!input)return;const dt=new DataTransfer();dt.items.add(images.back);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
</script></html>`;
http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;res.setHeader('Cache-Control','no-store');
 if(path==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
 if(path==='/front.png'||path==='/back.png'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect width="900" height="500" fill="#e0f4ed"/><text x="60" y="180" font-size="52" fill="#183a3a">'+(path==='/front.png'?'測試企業・陳小明':'專業服務・背面')+'</text></svg>');return;}
 if(!files.has(path.slice(1))){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type','text/javascript;charset=utf-8');res.end(await readFile(new URL(path.slice(1),root)));
}).listen(8821,'127.0.0.1',()=>console.log('Local synthetic preview http://127.0.0.1:8821/'));
