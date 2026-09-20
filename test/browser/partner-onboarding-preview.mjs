// Loopback-only preview of actual admin markup/adapters/API with synthetic data.
// No real credentials, external requests, persisted stores or points.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {handlePartnerOnboarding,fieldLimits} from '../../worker/partner-onboarding-ai.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),origin='http://127.0.0.1:8776',uid='U'+'1'.repeat(32);
const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE users(row_id TEXT,line_id TEXT,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT,phone TEXT DEFAULT '');
CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,scanner_user_id TEXT,creator_id TEXT,owner_user_id TEXT,source_type TEXT DEFAULT 'private_import',name TEXT DEFAULT '',company_name TEXT DEFAULT '',office_phone TEXT DEFAULT '',mobile TEXT DEFAULT '',email TEXT DEFAULT '',tax_id TEXT DEFAULT '',website TEXT DEFAULT '',address TEXT DEFAULT '',services TEXT DEFAULT '',title TEXT DEFAULT '');`);
sql.exec(await readFile(resolve(root,'migrations/0041_partner_onboarding_ai_usage.sql'),'utf8'));
sql.prepare('INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,?,?)').run(uid,uid,'admin','本機測試管理員');
for(let n=1;n<=235;n++)sql.prepare('INSERT INTO card_contacts(row_id,scanner_user_id,creator_id,owner_user_id,name,company_name,mobile,address,services) VALUES(?,?,?,?,?,?,?,?,?)').run(String(n).padStart(3,'0'),uid,uid,uid,'測試聯絡人 '+n,'測試咖啡 '+n,'0900-000-'+String(n).padStart(3,'0'),'測試縣測試路 '+n+' 號','咖啡、甜點');
const db={withSession(){return this;},prepare(query){const statement=(args=[])=>({bind(...v){return statement(v);},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async run(){return {success:true,meta:{changes:sql.prepare(query).run(...args).changes}};}});return statement();}};
const modelFields={...Object.fromEntries(Object.keys(fieldLimits).map(k=>[k,''])),name:'測試咖啡店',category:'食',summary:'咖啡與手作甜點',description:'提供咖啡、茶飲與手作甜點。',phone:'0900-000-235',contactName:'測試聯絡人',address:'測試縣測試路 235 號',branchName:'測試咖啡店'};
const fakeFetch=async(url)=>{
  if(url==='https://api.line.me/v2/profile')return Response.json({userId:uid});
  if(url.startsWith('https://cloudflare-dns.com/'))return Response.json({Status:0,Answer:[{type:1,data:'93.184.216.34'}]});
  if(url==='https://www.merchant.com/')return new Response('<h1>測試咖啡店</h1><p>提供咖啡與手作甜點及下午茶，位於測試縣測試路 235 號，歡迎光臨。</p>',{headers:{'Content-Type':'text/html'}});
  if(url==='https://api.openai.com/v1/responses')return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({fields:modelFields,warnings:['來源未載明營業時間，請人工確認。']})}]}]});
  throw new Error('Preview blocks external fetch');
};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/v1/store-shop/admin/onboarding/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const response=await handlePartnerOnboarding(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),{ACTMASTER_DB:db,OPENAI_API_KEY:'local-mock-only'},()=>({role:'admin'}),fakeFetch);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(url.pathname==='/'||url.pathname==='/liff'){
      const liff=url.pathname==='/liff',page=await readFile(resolve(root,liff?'index.html':'admin.html'),'utf8');
      const section=liff?page.slice(page.indexOf('<div id="page-admin-partners"'),page.indexOf('<div id="page-admin-partners"')+page.slice(page.indexOf('<div id="page-admin-partners"')).indexOf('<div id="page-',10)):
        page.slice(page.indexOf('<!-- Tab: Point Redemption Partners -->'),page.indexOf('<!-- Tab: Finance -->'));
      const content=section.replace(/class="([^"]*)\bhidden\b([^"]*)"/, 'class="$1$2"');
      res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
      res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 開店本機測試</title><script src="https://cdn.tailwindcss.com"></script><style>body{padding:16px;background:#f7faf9;font-family:Arial,sans-serif}.custom-input{display:block;width:100%;padding:12px;border:1px solid #ddd;border-radius:12px}.material-symbols-outlined{font-size:0}#page-admin-partners{display:block!important}</style><p style="color:#965b00">本機測試：235 張假名片、模擬 AI，儲存停用；不連正式站。</p>${content}<script>window.WORKER_URL=${JSON.stringify(origin)};window.liff={getAccessToken:()=> 'mock'};window.userRole='admin';window.showToast=message=>{document.getElementById('preview-message').textContent=message};window.fetchAPI=async()=>({success:true,partners:[]});</script><p id="preview-message"></p><script src="js/modules/partner-onboarding.js"></script><script src="js/modules/${liff?'admin-partners.js':'admin-partners-dashboard.js'}"></script><script>${liff?'window.loadAdminPointRedemptionPartners()':'loadPartnerAdmin()'};document.querySelectorAll('button[onclick*="save"]').forEach(b=>b.disabled=true);</script>`);return;
    }
    const path=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(req.method!=='GET'||!path.startsWith(root.endsWith(sep)?root:root+sep)||!/^\/(js\/modules\/|css\/)/.test(url.pathname)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(path));
  }catch(e){res.writeHead(500);res.end('Preview error: '+e.message);}
});
server.listen(8776,'127.0.0.1',()=>console.log(origin));
