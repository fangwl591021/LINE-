import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { reserveFriendReferral, completeFriendReferral, issueFriendReferralForVerifiedUser, visitFriendReferral, reconcileFriendReferralInbox } from '../worker/friend-referral-credit.mjs';
import { deliverMemberCredits } from '../worker/member-shopping-credit.mjs';

const uid = c => 'U' + c.repeat(32);
const actor = uid('a'), sponsor = uid('b'), other = uid('c');
const now = 1760000000000;
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(line_id TEXT PRIMARY KEY,point_line_id TEXT,legacy_line_id TEXT,row_id TEXT DEFAULT '');
    CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
    CREATE TABLE line_oa_messages(user_id TEXT,event_type TEXT,created_at TEXT);
    CREATE TABLE point_awards(award_id TEXT PRIMARY KEY,user_id TEXT,card_id TEXT,award_type TEXT,points INT,point_type TEXT,status TEXT,response_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT);
    CREATE UNIQUE INDEX award_key ON point_awards(user_id,card_id,award_type);
  `);
  sql.exec(readFileSync(new URL('../migrations/0086_friend_referral_inbox.sql',import.meta.url),'utf8'));
  sql.prepare('INSERT INTO users(line_id,point_line_id,legacy_line_id) VALUES(?,?,?)').run(sponsor, '', '');
  sql.prepare('INSERT INTO users(line_id,point_line_id,legacy_line_id) VALUES(?,?,?)').run(other, '', '');
  function prepare(query, values=[]) {
    const stmt = sql.prepare(query);
    return { bind: (...args) => prepare(query,args), run: () => ({meta:{changes:stmt.run(...values).changes}}),
      first: () => stmt.get(...values), all: () => ({results:stmt.all(...values)}) };
  }
  const db = {prepare};
  const fetcher = async url => ({ok:true, json:async () => url.includes('/verify?')
    ? {client_id:'1660923784',expires_in:60} : url.endsWith('/profile') ? {userId:actor} : {friendFlag:false}});
  const reserve = async (ref=sponsor, extra={}) => {
    const clock=extra.now || (()=>now), secret='synthetic-secret';
    const {ticket}=await issueFriendReferralForVerifiedUser(db,{userId:ref,secret},{now:clock});
    const {challenge}=await visitFriendReferral({ticket,secret},{now:clock});
    return reserveFriendReferral(db,{token:'synthetic-token',challenge,secret}, {fetcher,now:clock,...extra});
  };
  const event = (extra={}) => ({type:'follow',source:{type:'user',userId:actor},follow:{isUnblocked:false},webhookEventId:'synthetic-event',timestamp:now+1000,...extra});
  const rows = () => sql.prepare('SELECT * FROM point_awards').all();
  return {sql,db,fetcher,reserve,event,rows};
}
test('first verified follow creates one ready credit delivered without registration', async () => {
  const f=fixture();
  assert.equal((await f.reserve()).reserved,true);
  assert.equal((await f.reserve(other)).reserved,false);
  assert.equal((await completeFriendReferral(f.db,f.event())).completed,true);
  assert.equal((await completeFriendReferral(f.db,f.event())).completed,false);
  const calls=[];
  await deliverMemberCredits(f.db,async p=>{calls.push(p);return {success:true,data:{data:{insert_id:123}}};});
  assert.equal(calls.length,1);
  assert.equal(calls[0].userId,sponsor);
  assert.equal(calls[0].points,50);
  assert.equal(f.rows()[0].status,'sent');
  assert(!f.rows()[0].response_json.includes('synthetic-token'));
  f.sql.close();
});
test('no token, wrong channel, existing friend, self, and missing ref do not reserve',async()=>{
  const f=fixture();
  assert.equal((await reserveFriendReferral(f.db,{token:'',secret:'synthetic-secret'}, {now:()=>now})).reserved,false);
  assert.equal((await f.reserve(sponsor,{fetcher:async()=>({ok:true,json:async()=>({client_id:'0',expires_in:60})})})).reserved,false);
  f.sql.prepare("INSERT INTO line_oa_messages VALUES(?,'follow','2020-01-01')").run(actor);
  assert.equal((await f.reserve(sponsor,{fetcher:async url=>({ok:true,json:async()=>url.includes('/verify?')?{client_id:'1660923784',expires_in:60}:url.endsWith('/profile')?{userId:actor}:{friendFlag:true}})})).reserved,false);
  f.sql.prepare('INSERT INTO users(line_id,point_line_id,legacy_line_id) VALUES(?,?,?)').run(actor,'','');
  assert.equal((await f.reserve(actor)).reason,'self');
  assert.equal((await f.reserve(uid('d'))).reserved,false);
  assert.equal(f.rows().length,0); f.sql.close();
});
test('old referral/follow awards and historical follow prevent new reservation',async()=>{
  for(const kind of ['referral','follow','event']){
    const f=fixture();
    if(kind==='referral') f.sql.prepare("INSERT INTO point_awards VALUES(?,?,?,?,50,'gift_money','sent','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run('legacy',other,actor,'member_inviter_bonus');
    if(kind==='follow') f.sql.prepare("INSERT INTO point_awards VALUES(?,?,?,?,600,'gift_money','sent','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run('old-follow',actor,'line_oa_follow','line_oa_follow');
    if(kind==='event') f.sql.prepare("INSERT INTO line_oa_messages VALUES(?,'follow','2020-01-01')").run(actor);
    assert.equal((await f.reserve()).reserved,false,kind); f.sql.close();
  }
});
test('missing unblock flag, unblock, wrong user, and old or equal events cannot confirm',async()=>{
  const f=fixture();await f.reserve();
  let i=0;
  for(const change of [{follow:{}},{follow:{isUnblocked:true}},{source:{type:'user',userId:other}},{timestamp:now},{timestamp:now-1},{webhookEventId:''}])
    assert.equal((await completeFriendReferral(f.db,f.event({webhookEventId:'e'+i++,...change}))).completed,false);
  assert.equal(f.rows()[0].status,'friend_referral_pending'); f.sql.close();
});
test('identity migration, shared wallets and historical conflict fail closed',async()=>{
  for(const kind of ['link','inactive-link','shared','actor-wallet','changed','old-prior-event','unknown-prior-time']){
    const f=fixture();
    if(kind==='link') f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(actor,uid('d'));
    if(kind==='inactive-link') f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'inactive')").run(actor,uid('d'));
    if(kind==='shared') f.sql.prepare('INSERT INTO users(line_id,point_line_id,legacy_line_id) VALUES(?,?,?)').run(uid('d'),sponsor,'');
    if(kind==='actor-wallet') f.sql.prepare('INSERT INTO users(line_id,point_line_id,legacy_line_id) VALUES(?,?,?)').run(actor,uid('d'),'');
    if(['link','inactive-link','shared','actor-wallet'].includes(kind)) assert.equal((await f.reserve()).reserved,false,kind);
    else {
      assert.equal((await f.reserve()).reserved,true);
      if(kind==='changed') f.sql.prepare('UPDATE users SET point_line_id=? WHERE line_id=?').run(uid('d'),sponsor);
      if(kind==='old-prior-event') f.sql.prepare("INSERT INTO line_oa_messages VALUES(?,'follow','2020-01-01')").run(actor);
      if(kind==='unknown-prior-time') f.sql.prepare("INSERT INTO line_oa_messages VALUES(?,'follow','unknown')").run(actor);
      assert.equal((await completeFriendReferral(f.db,f.event())).completed,false,kind);
    }
    f.sql.close();
  }
});
test('LINE and database failures propagate, without granting points',async()=>{
 const f=fixture();
 await assert.rejects(f.reserve(sponsor,{fetcher:async()=>{throw Error('offline')}}));
 f.sql.exec('DROP TABLE line_oa_messages');
 await assert.rejects(f.reserve());
 assert.equal(f.rows().length,0); f.sql.close();
});
test('a single consistent sponsor identity migration pays the canonical wallet',async()=>{
  for (const useOldRef of [false,true]) {
    const f=fixture(), old=uid('d');
    f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(old,sponsor);
    f.sql.prepare('UPDATE users SET point_line_id=?,legacy_line_id=? WHERE line_id=?').run(sponsor,old,sponsor);
    f.sql.prepare('INSERT INTO users(line_id,point_line_id,legacy_line_id) VALUES(?,?,?)').run(old,sponsor,'');
    assert.equal((await f.reserve(useOldRef ? old : sponsor)).reserved,true);
    assert.equal((await completeFriendReferral(f.db,f.event())).completed,true);
    assert.equal(f.rows()[0].user_id,sponsor); f.sql.close();
  }
});
test('a unique legacy sponsor row with a point wallet and no link resolves safely',async()=>{
 for(const useNewRef of [false,true]){
  const f=fixture(),wallet=uid('d');
  f.sql.prepare('UPDATE users SET point_line_id=?,legacy_line_id=? WHERE line_id=?').run(wallet,sponsor,sponsor);
  assert.equal((await f.reserve(useNewRef?wallet:sponsor)).reserved,true);
  assert.equal((await completeFriendReferral(f.db,f.event())).completed,true);
  assert.equal(f.rows()[0].user_id,wallet); f.sql.close();
 }
});
test('ambiguous sponsor mappings and self-referrals fail closed before and after reservation',async()=>{
 for(const kind of ['self-old','extra-link','shared-wallet','changed-link']){
  const f=fixture(),old=kind==='self-old'?actor:uid('d');
  f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(old,sponsor);
  f.sql.prepare('UPDATE users SET point_line_id=?,legacy_line_id=? WHERE line_id=?').run(sponsor,old,sponsor);
  if(kind==='extra-link')f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(sponsor,uid('e'));
  if(kind==='shared-wallet')f.sql.prepare('INSERT INTO users(line_id,point_line_id,legacy_line_id) VALUES(?,?,?)').run(uid('e'),sponsor,'');
  if(kind==='changed-link'){
   assert.equal((await f.reserve()).reserved,true);
   f.sql.prepare("UPDATE user_identity_links SET status='inactive' WHERE old_line_id=?").run(old);
   assert.equal((await completeFriendReferral(f.db,f.event())).completed,false);
  }else assert.equal((await f.reserve()).reserved,false,kind);
  f.sql.close();
 }
});
test('same referral retry is idempotent; expired pending can be replaced but completed awards cannot',async()=>{
 const f=fixture(),ttl=86400000;
 assert.equal((await f.reserve()).reason,'reserved');
 assert.equal((await f.reserve()).reason,'already_reserved');
 assert.equal((await f.reserve(other)).reserved,false);
 assert.equal((await completeFriendReferral(f.db,f.event({timestamp:now+ttl+1}))).completed,false);
 assert.equal((await f.reserve(other,{now:()=>now+ttl})).reserved,true);
 assert.equal(f.rows()[0].user_id,other);
 assert.equal((await completeFriendReferral(f.db,f.event({timestamp:now+ttl+1}))).completed,true);
 assert.equal((await f.reserve(sponsor,{now:()=>now+ttl*2})).reserved,false);
 assert.equal(f.rows()[0].status,'member_ready'); f.sql.close();
});
test('the same referral can renew after expiry',async()=>{
 const f=fixture(),ttl=86400000;
 assert.equal((await f.reserve()).reserved,true);
 assert.equal((await f.reserve(sponsor,{now:()=>now+ttl})).reserved,true);
 assert.equal(JSON.parse(f.rows()[0].response_json).reservedAt,now+ttl);
 f.sql.close();
});
test('UID-shaped legacy row_id cannot be used to change the receiver award key',async()=>{
 const f=fixture(),legacy=uid('d');
 f.sql.prepare('INSERT INTO users(line_id,point_line_id,legacy_line_id,row_id) VALUES(?,?,?,?)').run(actor,'','',legacy);
 f.sql.prepare("INSERT INTO point_awards VALUES(?,?,?,?,50,'gift_money','sent','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
  .run('AWD_member_inviter_bonus_'+legacy,sponsor,legacy,'member_inviter_bonus');
 assert.equal((await f.reserve()).reserved,false);
 assert.equal((await completeFriendReferral(f.db,f.event())).completed,false);
 assert.equal(f.rows().length,1); f.sql.close();
});
test('signed entry challenge supports follow arriving before LIFF authentication',async()=>{
 const f=fixture(),secret='synthetic-secret', clock=()=>now;
 const {ticket}=await issueFriendReferralForVerifiedUser(f.db,{userId:sponsor,secret},{now:clock});
 const {challenge,entryUrl}=await visitFriendReferral({ticket,secret},{now:clock});
 assert.equal(new URL(entryUrl).searchParams.get('ref'),sponsor);
 const event=f.event();
 assert.equal((await completeFriendReferral(f.db,event)).reason,'not_pending');
 f.sql.prepare("INSERT INTO line_oa_messages VALUES(?,'follow',?)").run(actor,new Date(event.timestamp).toISOString());
 f.sql.prepare("INSERT INTO point_awards VALUES(?,?,?,?,600,'gift_money','sent',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
  .run('follow-current',actor,'line_oa_follow','line_oa_follow',JSON.stringify({createdAt:new Date(event.timestamp).toISOString()}));
 const friendFetcher=async url=>({ok:true,json:async()=>url.includes('/verify?')?{client_id:'1660923784',expires_in:60}:url.endsWith('/profile')?{userId:actor}:{friendFlag:true}});
 const r=await reserveFriendReferral(f.db,{token:'synthetic-token',challenge,secret},{fetcher:friendFetcher,now:()=>now+2000});
 assert.equal(r.reserved,true);
 assert.equal(f.rows().find(x=>x.award_type==='member_inviter_bonus').status,'member_ready');
 assert.equal((await reconcileFriendReferralInbox(f.db)).completed,0); f.sql.close();
});
test('unsigned, expired, or tampered referral tickets and challenges cannot reserve',async()=>{
 const f=fixture(),secret='synthetic-secret';
 const {ticket}=await issueFriendReferralForVerifiedUser(f.db,{userId:sponsor,secret},{now:()=>now});
 assert.equal((await visitFriendReferral({ticket:ticket+'x',secret},{now:()=>now})).challenge,'');
 assert.equal((await visitFriendReferral({ticket,secret},{now:()=>now+365*86400000})).challenge,'');
 const {challenge}=await visitFriendReferral({ticket,secret},{now:()=>now});
 assert.equal((await reserveFriendReferral(f.db,{token:'synthetic-token',challenge:challenge+'x',secret},{fetcher:f.fetcher,now:()=>now+1})).reserved,false);
 assert.equal((await reserveFriendReferral(f.db,{token:'synthetic-token',challenge,secret},{fetcher:f.fetcher,now:()=>now+1800000})).reserved,false);
 assert.equal((await reserveFriendReferral(f.db,{token:'synthetic-token',referrerId:sponsor,secret},{fetcher:f.fetcher,now:()=>now+1})).reserved,false);
 f.sql.close();
});
test('inbox retains follow while the 600-point record is in flight and retries after confirmation',async()=>{
 const f=fixture(); await f.reserve(); const event=f.event();
 f.sql.prepare("INSERT INTO point_awards VALUES(?,?,?,?,600,'gift_money','pending','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
  .run('current-follow',actor,'line_oa_follow','line_oa_follow');
 assert.equal((await completeFriendReferral(f.db,event)).completed,false);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM friend_referral_events').get().n,1);
 assert.equal((await reconcileFriendReferralInbox(f.db)).completed,0);
 f.sql.prepare('UPDATE point_awards SET response_json=? WHERE award_id=?').run(JSON.stringify({createdAt:new Date(event.timestamp).toISOString()}),'current-follow');
 assert.equal((await reconcileFriendReferralInbox(f.db)).completed,1);
 assert.equal((await reconcileFriendReferralInbox(f.db)).completed,0);
 assert.equal(f.rows().find(x=>x.award_type==='member_inviter_bonus').status,'member_ready');
 await assert.rejects(completeFriendReferral(f.db,f.event({timestamp:event.timestamp+1})),/識別衝突/);
 f.sql.close();
});
test('old follow award does not become eligible merely because a newer inbox event arrives',async()=>{
 const f=fixture();await f.reserve();const event=f.event();
 f.sql.prepare("INSERT INTO point_awards VALUES(?,?,?,?,600,'gift_money','sent',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
  .run('previous-follow',actor,'line_oa_follow','line_oa_follow',JSON.stringify({createdAt:'2020-01-01T00:00:00.000Z'}));
 assert.equal((await completeFriendReferral(f.db,event)).completed,false);
 assert.equal((await reconcileFriendReferralInbox(f.db)).completed,0);
 assert.equal(f.rows().find(x=>x.award_type==='member_inviter_bonus').status,'friend_referral_pending');
 f.sql.close();
});
test('earlier verified inbox event blocks a later invitation and reused event IDs',async()=>{
 const f=fixture();
 await completeFriendReferral(f.db,f.event({timestamp:now-10000,webhookEventId:'old-event'}));
 assert.equal((await f.reserve()).reserved,false);
 await assert.rejects(completeFriendReferral(f.db,f.event({timestamp:now+1,webhookEventId:'old-event'})),/識別衝突/);
 assert.equal(f.rows().length,0);f.sql.close();
});
test('verified same-invitation retry survives a follow before webhook delivery and retains signed network',async()=>{
 const f=fixture(),secret='synthetic-secret',net='trusted-network';
 const {ticket}=await issueFriendReferralForVerifiedUser(f.db,{userId:sponsor,secret},{now:()=>now,networkId:net});
 const {challenge,entryUrl}=await visitFriendReferral({ticket,secret},{now:()=>now});
 assert.equal(new URL(entryUrl).searchParams.get('net'),net);
 const first=await reserveFriendReferral(f.db,{token:'synthetic-token',challenge,secret},{fetcher:f.fetcher,now:()=>now+1});
 assert.equal(first.reserved,true);assert.equal(first.networkId,net);
 const friendFetcher=async url=>({ok:true,json:async()=>url.includes('/verify?')?{client_id:'1660923784',expires_in:60}:url.endsWith('/profile')?{userId:actor}:{friendFlag:true}});
 const retry=await reserveFriendReferral(f.db,{token:'synthetic-token',challenge,secret},{fetcher:friendFetcher,now:()=>now+2});
 assert.equal(retry.reason,'already_reserved');assert.equal(retry.networkId,net);
 assert.equal(f.rows().length,1);f.sql.close();
});
test('follow in authorization is kept pending until the verified delayed webhook arrives',async()=>{
 const f=fixture(),secret='synthetic-secret';
 const {ticket}=await issueFriendReferralForVerifiedUser(f.db,{userId:sponsor,secret},{now:()=>now});
 const {challenge}=await visitFriendReferral({ticket,secret},{now:()=>now});
 const friendFetcher=async url=>({ok:true,json:async()=>url.includes('/verify?')?{client_id:'1660923784',expires_in:60}:url.endsWith('/profile')?{userId:actor}:{friendFlag:true}});
 const result=await reserveFriendReferral(f.db,{token:'synthetic-token',challenge,secret,friendFlag:true,event:f.event()},
   {fetcher:friendFetcher,now:()=>now+2000});
 assert.equal(result.reserved,true);
 assert.equal(f.rows()[0].status,'friend_referral_pending');
 assert.equal((await reconcileFriendReferralInbox(f.db)).completed,0);
 assert.equal((await completeFriendReferral(f.db,f.event({follow:{}}))).completed,false);
 assert.equal(f.rows()[0].status,'friend_referral_pending');
 assert.equal((await completeFriendReferral(f.db,f.event())).completed,true);
 assert.equal(f.rows()[0].status,'member_ready');f.sql.close();
});
test('previous friend cannot earn a referral from a new challenge or an older webhook',async()=>{
 const f=fixture(),secret='synthetic-secret';
 const {ticket}=await issueFriendReferralForVerifiedUser(f.db,{userId:sponsor,secret},{now:()=>now});
 const {challenge}=await visitFriendReferral({ticket,secret},{now:()=>now});
 const friendFetcher=async url=>({ok:true,json:async()=>url.includes('/verify?')?{client_id:'1660923784',expires_in:60}:url.endsWith('/profile')?{userId:actor}:{friendFlag:true}});
 const result=await reserveFriendReferral(f.db,{token:'synthetic-token',challenge,secret},{fetcher:friendFetcher,now:()=>now+2000});
 assert.equal(result.reserved,true);
 assert.equal((await completeFriendReferral(f.db,f.event({timestamp:now-1}))).completed,false);
 assert.equal((await reconcileFriendReferralInbox(f.db)).completed,0);
 assert.equal(f.rows()[0].status,'friend_referral_pending');f.sql.close();
});
test('inbox retry rotates past a stalled event instead of starving later eligible rewards',async()=>{
 const f=fixture(); await f.reserve();
 const actor2=uid('d'), first=f.rows()[0], data=JSON.parse(first.response_json);data.actor=actor2;
 f.sql.prepare('INSERT INTO point_awards VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)')
  .run('AWD_member_inviter_bonus_'+actor2,sponsor,actor2,'member_inviter_bonus',50,'gift_money','friend_referral_pending',JSON.stringify(data));
 f.sql.prepare("INSERT INTO point_awards VALUES(?,?,?,?,600,'gift_money','pending','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
  .run('current-follow',actor,'line_oa_follow','line_oa_follow');
 f.sql.prepare('INSERT INTO friend_referral_events(event_id,user_id,event_time_ms,is_unblocked) VALUES(?,?,?,0)').run('a',actor,now+1000);
 f.sql.prepare('INSERT INTO friend_referral_events(event_id,user_id,event_time_ms,is_unblocked) VALUES(?,?,?,0)').run('b',actor2,now+2000);
 assert.equal((await reconcileFriendReferralInbox(f.db,1)).completed,0);
 assert.equal((await reconcileFriendReferralInbox(f.db,1)).completed,1);
 assert.equal(f.sql.prepare('SELECT status FROM point_awards WHERE card_id=?').get(actor2).status,'member_ready');f.sql.close();
});
