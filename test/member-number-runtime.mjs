// Native workerd/D1 only. Synthetic members, no production network or point writes.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),runtime='C:/Users/User/AppData/Local/npm-cache/_npx/ab1883e807df3f8e/node_modules/';
const {Miniflare}=require(runtime+'miniflare'),esbuild=require(runtime+'esbuild');
const built=await esbuild.build({stdin:{resolveDir:fileURLToPath(new URL('.',import.meta.url)),contents:`
import {findMemberReferrer} from '../worker/member-number.mjs';
export default {async fetch(request,env){const url=new URL(request.url),id=url.searchParams.get('id');
 if(url.pathname==='/create'){await env.ACTMASTER_DB.prepare('INSERT INTO users(row_id,line_id,name) VALUES(?,?,?) ON CONFLICT(line_id) DO NOTHING').bind(id,id,'合成會員').run();return Response.json(await env.ACTMASTER_DB.prepare('SELECT member_number FROM users WHERE line_id=?').bind(id).first());}
 if(url.pathname==='/lookup')return Response.json(await findMemberReferrer(env.ACTMASTER_DB,id));
 return new Response('',{status:404});}};`},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const mf=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-04-23',d1Databases:{ACTMASTER_DB:'local-member-number-only'},outboundService:()=>{throw Error('Network forbidden')}});
try{
 const db=await mf.getD1Database('ACTMASTER_DB');
 await db.prepare("CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,name TEXT,legacy_line_id TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,role TEXT DEFAULT 'user',network_id TEXT DEFAULT 'admin',referrer_id TEXT DEFAULT '',points INTEGER DEFAULT 100)").run();
 await db.prepare('CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT)').run();
 await db.prepare("INSERT INTO users(row_id,line_id,name,created_at) VALUES('OLD','OLD','歷史合成會員','2026-10-18 16:00:00')").run();
 const migration=readFileSync(new URL('../migrations/0067_member_numbers.sql',import.meta.url),'utf8').replace(/--[^\n]*/g,'');
 let statement='';for(const chunk of migration.split(';')){statement+=chunk+';';if(/^\s*CREATE TRIGGER/i.test(statement)&&!/^\s*END\s*$/.test(chunk))continue;if(statement.trim()!==';')await db.prepare(statement).run();statement='';}
 const replies=await Promise.all(Array.from({length:40},(_,i)=>mf.dispatchFetch('https://local.test/create?id=LOCAL'+(i%30))));
 assert(replies.every(r=>r.status===200));const rows=(await db.prepare('SELECT * FROM users').all()).results;
 assert.equal(rows.length,31);assert.equal(new Set(rows.map(r=>r.member_number)).size,31);assert(rows.every(r=>r.points===100&&r.role==='user'&&r.network_id==='admin'&&r.referrer_id===''));
 assert.equal(rows.find(r=>r.line_id==='OLD').member_number,'20261019001');
 const first=rows.find(r=>r.line_id==='LOCAL0');const lookup=await(await mf.dispatchFetch('https://local.test/lookup?id='+first.member_number)).json();assert.equal(lookup.userId,'LOCAL0');
 console.log('PASS native workerd/D1: additive migration + triggers, 40 concurrent creates/retries => 30 unique new numbers, old dates preserved, protected data unchanged, exact lookup. No external network.');
}finally{await mf.dispose()}
