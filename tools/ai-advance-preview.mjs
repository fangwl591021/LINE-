// Local-only demonstration: production UI + production handlers with in-memory synthetic records.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { handleAiAdvance } from '../worker/ai-advance.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sql=new DatabaseSync(':memory:'),uid='U'+'a'.repeat(32);
sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,name TEXT,role TEXT);
CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,name TEXT,company_name TEXT,title TEXT,scanner_user_id TEXT,creator_id TEXT,owner_user_id TEXT,source_type TEXT,archived_at TEXT,merged_into_row_id TEXT);
INSERT INTO users VALUES('demo-member','${uid}','示範會員','user');
INSERT INTO card_contacts VALUES('demo-contact','陳怡君','好日子設計','專案經理','${uid}','','','ocr_scan','','');`);
sql.exec(readFileSync(path.join(root,'migrations/0054_ai_advance_tasks.sql'),'utf8'));
function prepare(query,args=[]){return{bind(...values){return prepare(query,values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return{success:true,results:sql.prepare(query).all(...args)};},async run(){return{success:true,meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}
const db={prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const env={ACTMASTER_DB:db,OPENAI_API_KEY:'local-fixture-not-a-real-key',OPENAI_MODEL:'local-fixture'};
const fetcher=async(url,options)=>{
  if(url==='https://api.line.me/v2/profile')return new Response(JSON.stringify({userId:uid}));
  if(url!=='https://api.openai.com/v1/responses')throw Error('UNEXPECTED_EXTERNAL_REQUEST');
  return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({createNextTask:true,title:'下週確認合作提案',description:'再次聯絡陳怡君，確認提案方向與預算。',dueInDays:7,priority:'normal',reason:'已寄出提案，對方希望下週再聯繫。'})}]}]}));
};
const html=readFileSync(path.join(root,'index.html'),'utf8');
const buttons=html.match(/<div class="home-teaching-row">[\s\S]*?<\/div>/)[0];
const page=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"><title>AI 推進 · 本機驗收</title><link rel="stylesheet" href="/css/tutorial-center.css"><link rel="stylesheet" href="/css/ai-advance.css"><style>body{font-family:system-ui,'Microsoft JhengHei',sans-serif;margin:0;background:#f1faf6;color:#123f34}main{max-width:600px;margin:0 auto;padding:12px}.demo-head{background:#00866b;color:#fff;border-radius:18px;padding:22px;font-size:22px;font-weight:700}.demo-shortcuts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.demo-shortcuts span{background:#fff;border-radius:16px;padding:16px 3px;text-align:center;font-size:14px}.demo-banner{background:#fff0ce;border-radius:16px;padding:24px;font-size:24px;font-weight:700;margin-top:12px}small{font-size:12px}</style></head><body><main><p><small>本機驗收｜虛構資料與 AI 示範回覆｜不連線正式會員資料</small></p><div class="demo-head">點數通<br><small>會員專區　購物金　簽到贈點　專屬 QR</small></div><div class="demo-shortcuts"><span>收藏名片</span><span>我的名片</span><span>星座運勢</span><span>加LINE好友</span></div>${buttons}<div class="demo-banner">把消費串起來<br><small>購物金 × 跨店折抵 × 更多優惠</small></div></main><script>window.currentUserProfile={userId:'${uid}'};window.liff={isLoggedIn:()=>true,getAccessToken:()=>'local-fixture'};window.Config={API_URL:location.origin};</script><script src="/js/modules/tutorial-center.js"></script><script src="/js/modules/ai-advance.js"></script></body></html>`;
const allowed=new Map([['/css/tutorial-center.css','text/css'],['/css/ai-advance.css','text/css'],['/js/modules/tutorial-center.js','text/javascript'],['/js/modules/ai-advance.js','text/javascript']]);
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  try{
    if(url.pathname==='/__reset' && req.method==='POST'){
      // Only synthetic in-memory fixture data; this server never binds publicly or uses real credentials.
      sql.exec('DELETE FROM ai_advance_events; DELETE FROM ai_advance_suggestions; DELETE FROM ai_advance_reminders; DELETE FROM ai_advance_preferences; DELETE FROM ai_advance_tasks;');res.writeHead(204);res.end();return;
    }
    if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(page);return;}
    if(allowed.has(url.pathname)){res.writeHead(200,{'Content-Type':allowed.get(url.pathname)+'; charset=utf-8'});res.end(readFileSync(path.join(root,url.pathname)));return;}
    if(url.pathname.startsWith('/v1/ai-advance/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
      const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body})});
      // Await background jobs before returning for deterministic synthetic demonstrations.
      const work=[];const response=await handleAiAdvance(request,env,{waitUntil(p){work.push(p);}},fetcher);await Promise.all(work);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    res.writeHead(404);res.end('Not found');
  }catch(e){console.error(e);res.writeHead(500);res.end('Local fixture failed');}
}).listen(Number(process.env.PORT||8828),'127.0.0.1',()=>console.log('Synthetic preview: http://127.0.0.1:'+Number(process.env.PORT||8828)));
