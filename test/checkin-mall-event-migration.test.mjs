// Isolated schema/data preservation tests only. No production database, LINE or points API.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
const migration=read('0073_checkin_mall_event_cards.sql');
const TABLES=['checkin_mall_cards','checkin_mall_clicks','checkin_chat_dashboard_snapshots','checkin_chat_dashboard_product_snapshots','checkin_mall_product_clicks'];
function fixture(t,{empty=false,products=true}={}){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('PRAGMA foreign_keys=ON;');
 for(const name of ['0063_checkin_mall_cards.sql','0071_checkin_chat_dashboard.sql',...(products?['0072_checkin_dashboard_products.sql']:[])])db.exec(read(name));
 if(!empty){
  db.exec(`INSERT INTO checkin_mall_cards(rowid,id,event_id,recipient_uid,taipei_day,created_at,state,retry_key,balance,accepted_at) VALUES
   (-4,'card-a','event-a','member-a','2026-10-25',1000,'accepted','key-a',0,1001),
   (0,'card-b','event-b','member-b','2026-10-25',2000,'unknown','key-b',NULL,NULL),
   (17,'card-c','event-c','member-c','2026-10-25',3000,'failed','key-c',9223372036854775806,NULL),
   (25,'card-d','event-d','member-d','2026-10-25',4000,'preparing','key-d',-1,NULL),
   (40,'card-e','event-e','member-e','2026-10-25',5000,'sending','key-e',12867,NULL);
   INSERT INTO checkin_mall_clicks(id,card_id,actor_uid,actor_name,action,clicked_at,minute_bucket) VALUES
   (8,'card-a','opener-a','合成甲','mall',1002,0),(23,'card-a','opener-b','合成乙','details',1003,0);
   INSERT INTO checkin_chat_dashboard_snapshots(card_id,template_revision,config_json,message_json,created_at) VALUES
   ('card-a',3,'{"schemaVersion":1,"literal":"原卡片"}','{"type":"flex","literal":"原訊息，不改寫"}',1000),
   ('card-b',0,'{}','{}',2000);`);
  if(products)db.exec(`INSERT INTO checkin_chat_dashboard_product_snapshots(card_id,page_id,product_id,shop_id,product_json,available,created_at) VALUES
   ('card-a','product-a','item-a','shop-a','{"title":"原商品","priceCents":1180000}',1,1000),
   ('card-b','product-b','item-b','shop-b',NULL,0,2000);
   INSERT INTO checkin_mall_product_clicks(id,card_id,page_id,actor_uid,actor_name,clicked_at,minute_bucket) VALUES
   (13,'card-a','product-a','opener-c','原點擊者',1004,0);`);
 }
 return db;
}
function rows(db,table){const statement=db.prepare('SELECT rowid AS physical_rowid,* FROM '+table+' ORDER BY rowid');statement.setReadBigInts(true);return statement.all();}
function snapshot(db,tables=TABLES){return Object.fromEntries(tables.map(table=>[table,rows(db,table)]));}
function schema(db){return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_autoindex_%' ORDER BY type,name").all();}
function apply(db,sql=migration){db.exec('BEGIN');try{db.exec(sql);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
function clean(db){assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'checkin_mall_cards_%_0073'").all(),[]);assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);}
test('0073 preserves every old value, physical rowid and all five foreign-key-related tables',t=>{
 const db=fixture(t),before=snapshot(db),sequences=rows(db,'sqlite_sequence'),foreignKeys=Object.fromEntries(TABLES.map(table=>[table,db.prepare('PRAGMA foreign_key_list('+table+')').all()]));
 apply(db);assert.deepEqual(snapshot(db),before);assert.deepEqual(rows(db,'sqlite_sequence'),sequences);
 for(const table of TABLES)assert.deepEqual(db.prepare('PRAGMA foreign_key_list('+table+')').all(),foreignKeys[table]);
 assert.equal(db.prepare('PRAGMA table_info(checkin_mall_cards)').all().length,9);
 const indexes=db.prepare('PRAGMA index_list(checkin_mall_cards)').all();
 assert(indexes.some(index=>index.name==='checkin_mall_cards_created'&&index.unique===0));assert(indexes.some(index=>index.name==='checkin_mall_cards_recipient_day'&&index.unique===0));
 assert.deepEqual(db.prepare('PRAGMA index_info(checkin_mall_cards_recipient_day)').all().map(row=>row.name),['recipient_uid','taipei_day']);clean(db);
});
test('new same-day events are allowed while duplicate event IDs, retry keys and invalid states remain rejected',t=>{
 const db=fixture(t);apply(db);
 const insert=db.prepare("INSERT INTO checkin_mall_cards(id,event_id,recipient_uid,taipei_day,created_at,state,retry_key) VALUES(?,?,?,'2026-10-25',6000,?,?)");
 insert.run('new-card','new-event','member-a','preparing','new-key');assert.equal(db.prepare("SELECT count(*) n FROM checkin_mall_cards WHERE recipient_uid='member-a' AND taipei_day='2026-10-25'").get().n,2);
 assert.throws(()=>insert.run('duplicate-event','event-a','another-member','preparing','distinct-key'),/UNIQUE constraint failed: checkin_mall_cards.event_id/);
 assert.throws(()=>insert.run('duplicate-key','another-event','another-member','preparing','key-a'),/UNIQUE constraint failed: checkin_mall_cards.retry_key/);
 assert.throws(()=>insert.run('invalid-state','invalid-event','another-member','invalid','invalid-key'),/CHECK constraint failed/);
 assert.throws(()=>insert.run('null-event',null,'another-member','preparing','null-key'),/NOT NULL constraint failed/);clean(db);
});
for(const point of ['after_drop','after_reinsert'])test('transaction rollback '+point+' restores exact schema, rowids and content with no staging residue',t=>{
 const db=fixture(t),before=snapshot(db),beforeSchema=schema(db),sequences=rows(db,'sqlite_sequence');
 const marker=point==='after_drop'?'DROP TABLE checkin_mall_cards;':'DROP TABLE checkin_mall_cards_stage_0073;';
 assert(migration.includes(marker));const failed=migration.replace(marker,marker+'\nINSERT INTO synthetic_failure_0073 VALUES(1);');
 assert.throws(()=>apply(db,failed),/synthetic_failure_0073/);assert.deepEqual(snapshot(db),before);assert.deepEqual(schema(db),beforeSchema);assert.deepEqual(rows(db,'sqlite_sequence'),sequences);clean(db);
});
test('an already-converted schema fails the one-time precondition instead of blindly rebuilding again',t=>{
 const db=fixture(t);apply(db);const before=snapshot(db),beforeSchema=schema(db);
 assert.throws(()=>apply(db),/checkin_mall_0073_original_schema_required/);assert.deepEqual(snapshot(db),before);assert.deepEqual(schema(db),beforeSchema);clean(db);
});
test('an empty original schema migrates and still refuses a second direct application',t=>{
 const db=fixture(t,{empty:true});apply(db);assert.equal(db.prepare('SELECT count(*) n FROM checkin_mall_cards').get().n,0);
 assert.throws(()=>apply(db),/checkin_mall_0073_original_schema_required/);clean(db);
});
test('the additive rebuild works without optional product tables and leaves ordinary old card snapshots intact',t=>{
 const db=fixture(t,{products:false}),tables=TABLES.slice(0,3),before=snapshot(db,tables);apply(db);assert.deepEqual(snapshot(db,tables),before);clean(db);
});
test('migration text leaves the referenced parent name intact and relies on the runner transaction',()=>{
 const executable=migration.replace(/^--.*$/gm,'');assert.match(executable,/PRAGMA defer_foreign_keys = ON/);
 assert.doesNotMatch(executable,/\bRENAME\b|PRAGMA\s+foreign_keys\s*=\s*(?:OFF|0)|PRAGMA\s+defer_foreign_keys\s*=\s*(?:OFF|0)/i);
 assert.doesNotMatch(executable,/\b(?:BEGIN|COMMIT|ROLLBACK)\b/i);assert.match(executable,/SELECT rowid AS source_rowid/);assert.match(executable,/INSERT INTO checkin_mall_cards\(rowid,id,event_id/);
});
