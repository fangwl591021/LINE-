// Local-only UI preview: no login, member data, scores or reward API.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
export function createBlockPreview(){
 const assets=new Set(['css/block-supply.css',...['block-supply-controller','block-supply-engine','block-supply-renderer','block-supply-audio','tank-music'].map(n=>`js/modules/${n}.mjs`)]);
 const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>方塊補給站｜本機試玩</title><link rel="stylesheet" href="/css/block-supply.css"><style>body{margin:0;background:#06191e;color:#f0fffa;font-family:system-ui,sans-serif}#launcher{padding:32px;max-width:600px;margin:auto}#launcher button{padding:16px;font:inherit}#launcher[hidden]{display:none}</style></head><body><main id="game"></main><section id="launcher" hidden><h1>方塊補給站 · 本機預覽</h1><p>已離開遊戲，音訊與操作已停止。遊戲館將於下一階段接入。</p><button id="open">重新開啟試玩</button></section><script type="module">
 import {createBlockSupply} from '/js/modules/block-supply-controller.mjs';
 const root=document.querySelector('#game'),launcher=document.querySelector('#launcher');
 const mount=()=>{launcher.hidden=true;window.blockPreview=createBlockSupply(root,{seed:1,onExit:()=>{launcher.hidden=false;document.querySelector('#open').focus();}});};
 document.querySelector('#open').addEventListener('click',mount);mount();
 </script></body></html>`;
 const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');try{const path=new URL(req.url,'http://localhost').pathname.slice(1);if(!path){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}else if(assets.has(path)){res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(new URL(path,root)));}else{res.writeHead(404);res.end();}}catch{res.writeHead(500);res.end('Local preview error');}});
 return {server,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]===fileURLToPath(import.meta.url))createBlockPreview().server.listen(Number(process.env.BLOCK_PREVIEW_PORT||8792),'127.0.0.1',()=>console.log('Block supply preview: http://127.0.0.1:8792/ (no points or external API)'));
