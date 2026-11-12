import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleCheckinChatDashboard} from '../worker/checkin-chat-dashboard.mjs';
import {defaultCheckinDashboardConfig,normalizeCheckinDashboardConfig} from '../worker/checkin-chat-dashboard-render.mjs';
import {handleCheckinMall} from '../worker/checkin-mall-card.mjs';

const OLD='U'+'a'.repeat(32), ADMIN='U'+'b'.repeat(32), OUTSIDER='U'+'c'.repeat(32);
const NOW=Date.parse('2026-10-25T04:00:00Z');
function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT '');
    CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
    CREATE TABLE store_shop_stores(id TEXT,owner_uid TEXT,name TEXT,status TEXT,version INTEGER);
    CREATE TABLE store_shop_products(id TEXT,shop_id TEXT,title TEXT,description TEXT,image_url TEXT,price_cents INTEGER,purchase_mode TEXT,redeem_type TEXT,redeem_value INTEGER,status TEXT,version INTEGER);`);
  for(const file of ['0063_checkin_mall_cards.sql','0071_checkin_chat_dashboard.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  sql.exec('BEGIN');try{sql.exec(readFileSync(new URL('../migrations/0073_checkin_mall_event_cards.sql',import.meta.url),'utf8'));sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}
  sql.prepare('INSERT INTO users(row_id,line_id,legacy_line_id,point_line_id,role,name) VALUES(?,?,?,?,?,?)').run(ADMIN,ADMIN,OLD,ADMIN,'admin','測試管理員');
  sql.prepare('INSERT INTO users(row_id,line_id,point_line_id,role,name) VALUES(?,?,?,?,?)').run(OUTSIDER,OUTSIDER,ADMIN,'user','一般會員');
  sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(OLD,ADMIN);
  const prepare=(query,args=[])=>({bind(...values){return prepare(query,values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async run(){throw Error('A read-only endpoint must not write');}});
  const db={prepare,withSession(){return this;}},env={ACTMASTER_DB:db,CHECKIN_MALL_CARD_ENABLED:'true'};
  const mapper=row=>({role:row.role});
  mapper.exactHardAdminIdentity=(uid,row)=>![OLD,ADMIN].includes(uid)?(row?false:[]):!row?[OLD,ADMIN]:row.line_id===ADMIN&&row.role==='admin'&&row.name==='測試管理員';
  const users={old:OLD,current:ADMIN,outsider:OUTSIDER};
  const fetcher=async(url,options)=>{
    if(url.startsWith('https://api.line.me/oauth2/v2.1/verify?access_token='))return Response.json({client_id:'1660923784',expires_in:600});
    if(url==='https://api.line.me/v2/profile')return Response.json({userId:users[options.headers.Authorization.slice(7)]||''});
    throw Error('Unexpected external request');
  };
  async function call(path,token,body){
    const request=new Request('https://worker.test/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const response=path.startsWith('checkin-mall/')?await handleCheckinMall(request,env,mapper,fetcher,NOW):await handleCheckinChatDashboard(request,env,mapper,fetcher,NOW);
    return {status:response.status,...await response.json()};
  }
  return {sql,call};
}

for(const [label,path,body] of [
  ['report','checkin-mall/report',null],
  ['catalog','checkin-chat-dashboard/catalog?view=shops',null],
  ['preview','checkin-chat-dashboard/preview',{config:normalizeCheckinDashboardConfig(defaultCheckinDashboardConfig())}]
])test('hard-admin conflict '+label+' permits only the direct established UID pair',async t=>{
  const f=fixture(t),before=f.sql.prepare('SELECT count(*) n FROM checkin_mall_cards').get().n;
  for(const token of ['old','current']){const result=await f.call(path,token,body);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.success,true);}
  const rejected=await f.call(path,'outsider',body);assert.equal(rejected.status,409,JSON.stringify(rejected));assert.equal(rejected.success,false);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM checkin_mall_cards').get().n,before);
});
