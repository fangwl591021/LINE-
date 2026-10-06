import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleMemberEvents} from '../../worker/member-hosted-events.mjs';
export const UIDS={host:'U'+'a'.repeat(32),guest:'U'+'b'.repeat(32),other:'U'+'c'.repeat(32),old:'U'+'d'.repeat(32)};
export function fixture(t){
  const sql=new DatabaseSync(':memory:');t?.after(()=>sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,name TEXT,role TEXT);CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
    INSERT INTO users VALUES('host','${UIDS.host}','範例主辦','user'),('guest','${UIDS.guest}','範例來賓','user'),('other','${UIDS.other}','其他主辦','admin');
    INSERT INTO user_identity_links VALUES('${UIDS.old}','${UIDS.host}','active');
    CREATE TABLE points_ledger(id TEXT);CREATE TABLE activities(id TEXT);CREATE TABLE personal_tasks(id TEXT);`);
  sql.exec(readFileSync(new URL('../../migrations/0055_member_hosted_events.sql',import.meta.url),'utf8'));
  const writes=[];let authStatus=200,beforeRun=null,badWrite=false;
  function prepare(query,args=[]){return {bind(...a){return prepare(query,a);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async run(){beforeRun?.(query,args);if(badWrite)return {success:false};if(!/^\s*(?:INSERT(?: OR IGNORE)? INTO|UPDATE|DELETE FROM) member_(?:hosted_events|event_registrations)/.test(query))throw Error('Unexpected write: '+query);writes.push(query);const r=sql.prepare(query).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}};}
  const db={prepare,withSession(){return this;}},env={ACTMASTER_DB:db};
  const fetcher=async(url,init)=>{if(url!=='https://api.line.me/v2/profile')throw Error('Unexpected outbound '+url);const member=init.headers.Authorization.slice(7);return Response.json({userId:UIDS[member]},{status:UIDS[member]?authStatus:401});};
  async function api(path,{member='host',data,method=data===undefined?'GET':'POST'}={}){const response=await handleMemberEvents(new Request('https://point.test/v1/member-events'+path,{method,headers:{...(member?{Authorization:'Bearer '+member}:{}),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),env,fetcher);return {httpStatus:response.status,...(response.status===204?{}:await response.json())};}
  const input=()=>({requestKey:crypto.randomUUID(),title:'會員交流測試',description:'介紹服務，交流合作需求',location:'範例會議室',startsAt:new Date(Date.now()+2*86400000).toISOString(),endsAt:new Date(Date.now()+2*86400000+7200000).toISOString(),registrationClosesAt:new Date(Date.now()+86400000).toISOString(),capacity:2,feeText:'免費',coverUrl:''});
  const create=async(data=input(),member='host')=>{const r=await api('/events',{member,data});if(!r.success)throw Error(JSON.stringify(r));return r.event;};
  return {sql,db,env,api,fetcher,input,create,writes,setAuth:v=>authStatus=v,setBeforeRun:f=>beforeRun=f,setBadWrite:v=>badWrite=v};
}
