// Synthetic local fixture only. Never calls production APIs or LINE.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import '../../js/shared/card-links.js';
const root = new URL('../../', import.meta.url);
let enabled = true;
let cfg = {title:'企業合作與數位行銷',desc:'協助品牌串聯資源、推廣產品與拓展合作。\n歡迎選擇下方方式與我聯絡。',layoutStyle:'landscape',imgUrl:'https://example.com/card.svg',buttons:Array.from({length:11},(_,i)=>({l:['加 LINE 好友','LINE 官方帳號','行動電話','公司電話','電子郵件','官方網站','Facebook','Instagram','YouTube','地圖導航','預約表單'][i],u:i===2?'tel:0912345678':i===4?'mailto:demo@example.com':'https://example.com/'+i,c:i<2?'#06C755':'#176D69'}))};
const card = () => ({rowId:'LOCAL_PREVIEW_ONLY',name:'合成測試名片',mobile:'0912345678',email:'demo@example.com',customConfig:JSON.stringify(cfg),'自訂名片設定':JSON.stringify(cfg)});
const files = new Set(['js/shared/card-links.js','js/modules/card-links-runtime.js','js/modules/mycard.js','js/modules/ecard.js','css/card-links.css']);
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="/css/card-links.css"><style>body{font-family:system-ui,sans-serif}.material-symbols-outlined{font-size:12px}#notice{position:fixed;bottom:0;left:0;z-index:9999;background:#fffbcc;padding:8px}</style></head><body><div id="notice">本機合成測試，無正式資料異動</div><script>
window.Config={WORKER_URL:location.origin};window.currentUserProfile={userId:'LOCAL'};window.canEditCardRecord=()=>true;window.showToast=m=>document.getElementById('notice').textContent=m;window.fetchAPI=async(action,payload)=>{if(action!=='updateCard')throw new Error('External API forbidden');const res=await fetch('/save',{method:'POST',body:JSON.stringify(payload)});return res.json()};
</script><script src="/js/shared/card-links.js"></script><script src="/js/modules/card-links-runtime.js"></script><script src="/js/modules/ecard.js"></script><script src="/js/modules/mycard.js"></script><script>
async function reopen(){const card=await(await fetch('/card')).json();window.currentCard=card;await window.openCardRecordWysiwyg(card)}reopen();
</script></body></html>`;
http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  res.setHeader('Cache-Control','no-store');
  if(req.method==='POST'){
    let data='';for await(const chunk of req){data+=chunk;if(data.length>100000){res.writeHead(413);res.end();return;}}
    try{
      if(path==='/flag'){enabled=JSON.parse(data).enabled===true;res.end('{}');return;}
      if(path!=='/save')throw new Error('Local only');
      cfg=globalThis.CardLinks.saveConfig(cfg,JSON.parse(data).data['自訂名片設定'],enabled);
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,data:card()}));return;
    }catch(e){res.end(JSON.stringify({success:false,error:e.message}));return;}
  }
  if(path==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
  if(path==='/card'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(card()));return;}
  if(path==='/api/card-links/config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({enabled}));return;}
  const file=path.slice(1);if(!files.has(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(new URL(file,root)));
}).listen(8776,'127.0.0.1',()=>console.log('Synthetic card editor: http://127.0.0.1:8776/'));
