import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,proposal,ADMIN,REWARD,OTHER} from './fixtures/reward-unit-directory.mjs';
import {listingCategories} from '../worker/store-listing-review.mjs';
const f=t=>{const s=rewardFixture();t.after(()=>s.sql.close());return s;};
test('CRM roles alone never publish units; public GET is bounded, no auth or private response',async t=>{
  const s=f(t);const before=s.sql.prepare('SELECT * FROM users').all();assert.deepEqual((await s.call()).units,[]);assert.equal(s.calls.length,0);
  const p=proposal(),saved=await s.call('/admin',p,'admin');assert.equal(saved.http,200,JSON.stringify(saved));
  const page=await s.call();assert.equal(page.units.length,1);assert.deepEqual(Object.keys(page.units[0]),['id','name','description','image_url','phone','address','website_url','reward_terms']);
  assert.doesNotMatch(JSON.stringify(page),/PRIVATE|CRM 私人|target_uid|actor_uid|request_key|points|U[ab]{32}/);
  assert.deepEqual((await s.call('?id='+saved.id)).unit,page.units[0]);assert.deepEqual(s.sql.prepare('SELECT * FROM users').all(),before);
  assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publication_audit').get().n,1);
});
test('public query whitelist, duplicate conditions and non-read methods are rejected',async t=>{
  const s=f(t);for(const q of ['?target='+REWARD,'?q=a&q=b','?id=bad','?after=bad','?id='+crypto.randomUUID()+'&q=a','?q='+'a'.repeat(81)])assert.equal((await s.call(q)).http,400,q);
  assert.equal((await s.call('',{})).http,405);assert.equal((await s.call('?id='+crypto.randomUUID())).http,404);
});
test('only current verified admin can read CRM prefill and save; role payload never authorizes',async t=>{
  const s=f(t);for(const token of ['','bad','reward','user']){assert.equal((await s.call('/admin?target='+REWARD,undefined,token)).http,token===''||token==='bad'?401:403);assert.equal((await s.call('/admin',proposal(),'user')).http,403);}
  const p=proposal({role:'admin'});assert.equal((await s.call('/admin',p,'admin')).http,400);
  assert.equal((await s.call('/admin',proposal({target_uid:OTHER}),'admin')).http,403);
  assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publications').get().n,0);
});
test('CRM prefill ignores scanned/other-owned cards and private user phone; GET never saves',async t=>{
  const s=f(t);s.sql.prepare('INSERT INTO card_contacts(row_id,line_id,profile_user_id,owner_user_id,source_type,company_name,services,office_phone,address,website) VALUES(?,?,?,?,?,?,?,?,?,?)').run('scanned',REWARD,REWARD,OTHER,'private_import','私人掃入公司','PRIVATE','','PRIVATE','');
  const initial=await s.call('/admin?target='+REWARD,undefined,'admin');assert.equal(initial.unit.name,'');assert.equal(initial.unit.phone,'');assert.equal(initial.unit.status,'draft');
  s.sql.prepare('INSERT INTO card_contacts(row_id,line_id,profile_user_id,owner_user_id,source_type,company_name,services,office_phone,address,website) VALUES(?,?,?,?,?,?,?,?,?,?)').run('own',REWARD,REWARD,REWARD,'self_profile','本人的公司','公司服務','0223456789','公司地址','https://example.com');
  const next=await s.call('/admin?target='+REWARD,undefined,'admin');assert.equal(next.unit.name,'本人的公司');assert.equal(next.unit.phone,'0223456789');assert.equal(next.unit.image_url,'');assert.equal(next.unit.reward_terms,'');assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publications').get().n,0);
});
test('active requires confirmation and actual terms, safe company contact and bounded URL fields',async t=>{
  const s=f(t);for(const mutate of [p=>p.confirmed_public=false,p=>p.unit.reward_terms='',p=>p.unit.description='',p=>{p.unit.phone='';p.unit.website_url='';},p=>p.unit.image_url='javascript:alert(1)',p=>p.unit.website_url='https://u:secret@example.com',p=>p.unit.phone='PRIVATE',p=>p.unit.target_uid=OTHER,p=>p.target_uid=[REWARD]]){
    const p=proposal();mutate(p);assert.equal((await s.call('/admin',p,'admin')).http,400);
  }assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publications').get().n,0);
});
test('draft/hidden never call AI; public endpoints recheck status and exact CRM reward role',async t=>{
  const s=f(t),p=proposal();p.unit.status='draft';assert.equal((await s.call('/admin',p,'admin')).http,200);assert.equal(s.sql.prepare('SELECT count(*) n FROM store_listing_reviews').get().n,0);assert.deepEqual((await s.call()).units,[]);
  p.version=1;p.request_key=crypto.randomUUID();p.unit.status='active';const r=await s.call('/admin',p,'admin');assert.equal(r.http,200);
  s.sql.prepare("UPDATE users SET role='store' WHERE line_id=?").run(REWARD);assert.deepEqual((await s.call()).units,[]);assert.equal((await s.call('?id='+r.id)).http,404);
  s.sql.prepare("UPDATE users SET role='reward' WHERE line_id=?").run(REWARD);assert.equal((await s.call()).units.length,1);
  p.version=2;p.request_key=crypto.randomUUID();p.unit.status='hidden';assert.equal((await s.call('/admin',p,'admin')).http,200);assert.equal((await s.call('?id='+r.id)).http,404);
});
test('manual/reject/provider failure never publish or overwrite existing snapshot',async t=>{
  const s=f(t);for(const kind of ['manual','reject','error']){
    s.setProvider({review:()=>kind==='error'?new Response('',{status:500}):{decision:kind,checked_categories:[...listingCategories],image_count:0,issues:[{category:'other',field:'name',evidence:'合成贈點公司',reason:'合成測試'}]}});
    const r=await s.call('/admin',proposal(),'admin');assert.ok(r.http>=400,JSON.stringify(r));assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publications').get().n,0);assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publication_audit').get().n,0);
  }
});
test('failed changed-content review preserves already published snapshot',async t=>{
  const s=f(t),p=proposal();assert.equal((await s.call('/admin',p,'admin')).http,200);
  s.setProvider({review:()=>new Response('',{status:500})});p.version=1;p.request_key=crypto.randomUUID();p.unit.description='修改後需要重新審核的公司服務介紹。';
  assert.equal((await s.call('/admin',p,'admin')).http,503);assert.equal((await s.call()).units[0].description,'提供生活服務，請洽公司了解合作方案。');assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publication_audit').get().n,1);
});
test('unchanged retry is idempotent; reused key and stale version cannot overwrite',async t=>{
  const s=f(t),p=proposal();const a=await s.call('/admin',p,'admin');const b=await s.call('/admin',p,'admin');assert.equal(a.id,b.id);assert.equal(b.replayed,true);assert.equal(b.version,1);
  p.unit.name='變更公司';assert.equal((await s.call('/admin',p,'admin')).http,409);p.request_key=crypto.randomUUID();assert.equal((await s.call('/admin',p,'admin')).http,409);
  assert.equal(s.sql.prepare('SELECT version FROM reward_unit_publications').get().version,1);assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publication_audit').get().n,1);
});
test('role/admin/CAS races during review prevent publication and audit writes',async t=>{
  for(const who of [REWARD,ADMIN]){const s=f(t);s.onBatch(()=>s.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(who));const r=await s.call('/admin',proposal(),'admin');assert.equal(r.http,409,JSON.stringify(r));assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publications').get().n,0);assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publication_audit').get().n,0);}
});
test('audit and publication are atomic on database failure',async t=>{
  const s=f(t);s.sql.exec("CREATE TRIGGER fail_publication BEFORE INSERT ON reward_unit_publications BEGIN SELECT RAISE(ABORT,'synthetic'); END");
  assert.equal((await s.call('/admin',proposal(),'admin')).http,503);assert.equal(s.sql.prepare('SELECT count(*) n FROM reward_unit_publication_audit').get().n,0);
});
test('public list filters and paginates all units without duplicates; never reads CRM private columns',async t=>{
  const s=f(t);for(let n=1;n<=25;n++){const id='00000000-0000-4000-8000-'+String(n).padStart(12,'0'),uid='U'+String(n).padStart(32,'0');s.sql.prepare("INSERT INTO users(row_id,line_id,role) VALUES(?,?,'reward')").run(uid,uid);s.sql.prepare("INSERT INTO reward_unit_publications(id,target_uid,name,description,reward_terms,status,version,updated_at) VALUES(?,?,?,?,?,'active',1,'now')").run(id,uid,'合成單位'+n,'測試單位介紹','請洽單位');}
  const a=await s.call(),b=await s.call('?after='+a.next);assert.equal(a.units.length,20);assert.equal(b.units.length,5);assert.equal(new Set([...a.units,...b.units].map(u=>u.id)).size,25);assert.equal((await s.call('?q='+encodeURIComponent('合成單位25'))).units.length,1);
  const publicQueries=s.queries.filter(q=>q.includes('FROM reward_unit_publications p'));assert.ok(publicQueries.length);for(const q of publicQueries)assert.doesNotMatch(q,/users\.phone|socials|points|SELECT \*/);
});
test('Worker route and both CRM surfaces expose explicit publication, not role mutation',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  assert.match(read('worker-entry.mjs'),/handleRewardUnits\(request, env, storeInviteProfileView\)/);
  for(const file of ['index.html','admin.html','admin-v2.html']){assert.match(read(file),/reward-unit-editor\.js\?v=1/);assert.match(read(file),/reward-unit-editor\.css\?v=1/);}
  assert.match(read('admin.html'),/role==='reward'&&adminRole==='admin'[^\n]*openRewardUnitEditor/);assert.match(read('js/modules/admin.js'),/role === 'reward' && window.userRole === 'admin'[^\n]*openRewardUnitEditor/);
});
