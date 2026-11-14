import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleAdminOverviewStats } from '../worker/admin-overview-stats.mjs';
import entry from '../worker-entry.mjs';

const ADMIN='U'+'a'.repeat(32), USER='U'+'b'.repeat(32), STORE='U'+'c'.repeat(32), OTHER='U'+'d'.repeat(32);
const PATH='https://worker.test/v1/admin/overview-stats';
const mapper=row=>({role:row.role === 'admin' ? 'admin' : 'user'});

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT NOT NULL DEFAULT '',legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT DEFAULT 'user',name TEXT DEFAULT '',phone TEXT DEFAULT '',private_note TEXT DEFAULT 'SECRET');
    CREATE TABLE user_identity_links(old_line_id TEXT NOT NULL,new_line_id TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY);
    CREATE TABLE activities(activity_id TEXT PRIMARY KEY,status TEXT,series_id TEXT);
    CREATE TABLE registrants(row_id TEXT PRIMARY KEY,status TEXT);
  `);
  const add=sql.prepare('INSERT INTO users(row_id,line_id,role) VALUES(?,?,?)');
  add.run(ADMIN,ADMIN,'admin'); add.run(USER,USER,'user'); add.run(STORE,STORE,'store');
  add.run('unfinished','', 'user');
  sql.exec(`INSERT INTO card_contacts VALUES('a'),('b');
    INSERT INTO activities VALUES('root','上架',''),('child','上架','root'),('hidden','下架',''),('null-series','上架',NULL);
    INSERT INTO registrants VALUES('active','active'),('cancelled','cancelled'),('legacy',''),('null-status',NULL);`);
  const queries=[], sessions=[];
  const state={failStats:false,brokenStats:false};
  const db={
    withSession(name){sessions.push(name);return this;},
    prepare(query){return {bind(...args){return {async all(){
      queries.push(query);
      if(state.failStats && query.includes('memberRecordCount')) throw new Error('sensitive db failure');
      if(state.brokenStats && query.includes('memberRecordCount')) return {success:true,results:[{memberRecordCount:null}]};
      return {success:true,results:sql.prepare(query).all(...args)};
    }}}};}
  };
  const fetcher=async (_url,init)=>{
    assert.equal(init.redirect,'manual');
    const token=init.headers.Authorization.slice(7),uid={admin:ADMIN,user:USER,store:STORE}[token];
    return uid ? Response.json({userId:uid}) : new Response('',{status:401});
  };
  const request=(token='admin',options={})=>handleAdminOverviewStats(new Request(PATH+(options.query||''),{
    method:options.method||'GET', headers:{...(token?{Authorization:'Bearer '+token}:{}),...(options.headers||{})}
  }),{ACTMASTER_DB:db},mapper,fetcher);
  const snapshot=()=>['users','user_identity_links','card_contacts','activities','registrants'].map(table=>sql.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  return {sql,db,fetcher,queries,sessions,state,request,snapshot};
}

test('returns only four exact counts with explicit published and active definitions; no writes',async()=>{
  const f=fixture();try{
    const before=f.snapshot(),response=await f.request(),body=await response.json();
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(body,{success:true,data:{memberRecordCount:4,cardRecordCount:2,publishedActivityCount:2,activeRegistrationCount:3}});
    assert.deepEqual(f.snapshot(),before); assert.deepEqual(f.sessions,['first-primary']);
    assert.doesNotMatch(JSON.stringify(body),/SECRET|private_note|line_id|phone/);
  }finally{f.sql.close();}
});

test('rejects missing, ordinary, store, forged, revoked and conflicting identity before aggregate read',async()=>{
  const f=fixture();try{
    for(const token of ['', 'bad','user','store']){
      const response=await f.request(token,{headers:{'X-Role':'admin','X-User-Id':ADMIN}});
      assert.ok([401,403].includes(response.status));
    }
    f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run('user',ADMIN);
    assert.equal((await f.request()).status,403);
    f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run('admin',ADMIN);
    f.sql.prepare('INSERT INTO users(row_id,line_id,legacy_line_id,role) VALUES(?,?,?,?)').run(OTHER,OTHER,ADMIN,'user');
    assert.equal((await f.request()).status,409);
    assert.ok(f.queries.every(q=>!q.includes('memberRecordCount')));
  }finally{f.sql.close();}
});

test('database failure or incomplete counts fail closed; unrelated paths, methods and parameters are isolated',async()=>{
  const f=fixture();try{
    assert.equal(await handleAdminOverviewStats(new Request('https://worker.test/other'),{},mapper),null);
    assert.equal((await f.request('',{method:'OPTIONS'})).status,204);
    assert.equal((await f.request('admin',{method:'POST'})).status,405);
    assert.equal((await f.request('admin',{query:'?role=admin'})).status,400);
    f.state.failStats=true;
    let response=await f.request(); assert.equal(response.status,503); assert.doesNotMatch(JSON.stringify(await response.json()),/sensitive/);
    f.state.failStats=false; f.state.brokenStats=true;
    response=await f.request(); assert.equal(response.status,503); assert.equal((await response.json()).success,false);
  }finally{f.sql.close();}
});

test('Worker entry connects the new route without enabling the legacy finance action',()=>{
  const entry=readFileSync(new URL('../worker-entry.mjs',import.meta.url),'utf8');
  assert.match(entry,/handleAdminOverviewStats\(request, env, storeInviteProfileView\)/);
  assert.doesNotMatch(entry,/action\s*===\s*['"]getAdminStats['"]/);
});

test('actual Worker entry routes and rejects a synthetic non-admin before querying counts',async()=>{
  const f=fixture(),originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=f.fetcher;
    // The production mapper recognizes only established real identities;
    // use an ordinary synthetic identity to verify the real entry denies it.
    const response=await entry.fetch(new Request(PATH,{headers:{Authorization:'Bearer admin'}}),{ACTMASTER_DB:f.db},{waitUntil(){}});
    assert.equal(response.status,403); assert.equal((await response.json()).success,false);
    assert.ok(f.queries.every(q=>!q.includes('memberRecordCount')));
  }finally{globalThis.fetch=originalFetch;f.sql.close();}
});
