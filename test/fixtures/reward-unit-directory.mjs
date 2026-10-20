import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleRewardUnits} from '../../worker/reward-unit-directory.mjs';
import {listingTestEnv,listingTestFetch} from './store-listing-review.mjs';
export const ADMIN='U'+'a'.repeat(32),REWARD='U'+'b'.repeat(32),OTHER='U'+'c'.repeat(32);
export const mapper=row=>({role:row.role});
export function rewardFixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT NOT NULL UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT 'PRIVATE_PHONE',points INTEGER DEFAULT 333);
    CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
    CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,line_id TEXT,profile_user_id TEXT,owner_user_id TEXT,source_type TEXT,company_name TEXT,services TEXT,office_phone TEXT,address TEXT,website TEXT,archived_at TEXT DEFAULT '',merged_into_row_id TEXT DEFAULT '',updated_at TEXT DEFAULT '2026-10-20');`);
  sql.exec(readFileSync(new URL('../../migrations/0066_reward_unit_publications.sql',import.meta.url),'utf8'));
  for(const [id,role,name]of [[ADMIN,'admin','管理員'],[REWARD,'reward','CRM 私人姓名'],[OTHER,'user','一般會員']])sql.prepare('INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,?,?)').run(id,id,role,name);
  const calls=[],queries=[];let batchHook;
  const db={withSession(){return this;},prepare(query){queries.push(query);const stmt=(args=[])=>({bind(...a){return stmt(a);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async run(){return {success:true,meta:{changes:Number(sql.prepare(query).run(...args).changes)}};},query,args});return stmt();},async batch(statements){batchHook?.();sql.exec('BEGIN');try{const results=statements.map(s=>{const p=sql.prepare(s.query);return {success:true,results:p.columns().length?p.all(...s.args):[],meta:{changes:p.columns().length?0:Number(p.run(...s.args).changes)}};});sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const env=listingTestEnv(sql,db);
  const baseFetch=async(url,opts)=>{calls.push({url,opts});if(url==='https://api.line.me/v2/profile'){const token=opts.headers.Authorization.slice(7);return ['admin','reward','user'].includes(token)?Response.json({userId:{admin:ADMIN,reward:REWARD,user:OTHER}[token]}):new Response('',{status:401});}throw Error('Unexpected outbound request');};
  let provider=listingTestFetch(baseFetch);
  return {sql,db,env,calls,queries,setProvider(options){provider=listingTestFetch(baseFetch,options);},onBatch(fn){batchHook=fn;},async fetch(request){return handleRewardUnits(request,env,mapper,(...a)=>provider(...a));},async call(path='',data,token=''){
    const headers={};if(token)headers.Authorization='Bearer '+token;if(data)headers['Content-Type']='application/json';
    const response=await this.fetch(new Request('https://app.test/v1/reward-units'+path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined}));
    return {http:response.status,...await response.json()};
  }};
}
export const proposal=(overrides={})=>({target_uid:REWARD,version:0,request_key:crypto.randomUUID(),confirmed_public:true,unit:{name:'合成贈點公司',description:'提供生活服務，請洽公司了解合作方案。',image_url:'',phone:'0223456789',address:'新北市合成路1號',website_url:'https://example.com/company',reward_terms:'參加指定活動後，經服務人員核對資格贈點。',status:'active'},...overrides});
