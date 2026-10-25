const assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
const {Miniflare}=require(process.env.LISTING_MINIFLARE_MODULE),{buildSync}=require(process.env.LISTING_ESBUILD_MODULE);
(async()=>{
 const bundle=buildSync({entryPoints:['test/fixtures/partner-bonus-v2-runtime.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-04-23',compatibilityFlags:[],d1Databases:{ACTMASTER_DB:'partner-v2-isolated'},port:0});
 try{
  const db=await mf.getD1Database('ACTMASTER_DB'),A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),buyers=['c','d','e'].map(x=>'U'+x.repeat(32));
  await db.exec("CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',referrer_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT ''); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);");
  await db.prepare("INSERT INTO users(row_id,line_id,role,referrer_id) VALUES(?,?,'admin',''),(?,?,'user',?)").bind(A,A,B,B,A).run();
  for(const buyer of buyers)await db.prepare("INSERT INTO users(row_id,line_id,role,referrer_id) VALUES(?,?,'user',?)").bind(buyer,buyer,B).run();
  const schema=readFileSync('migrations/0001_core_schema.sql','utf8');
  for(const name of ['orders','bonus_transactions'])await db.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0].replace(/\s+/g,' '));
  for(const stmt of readFileSync('migrations/0070_partner_bonus_v2.sql','utf8').split(';').map(x=>x.trim()).filter(Boolean))await db.exec(stmt.replace(/--[^\n]*/g,'').replace(/\s+/g,' ')+';');
  const call=async(path,data,token='admin')=>{const r=await mf.dispatchFetch('https://test'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {http:r.status,...await r.json()};};
  const then=new Date(Date.now()-86400000).toISOString();
  for(const id of [A,B]){const r=await call('/v1/partner-contracts',{target_uid:id,signedAt:then,effectiveAt:then,documentSha256:'a'.repeat(64),evidenceRef:'synthetic signed proof',confirmed:true,requestKey:crypto.randomUUID(),purchaseStatus:'not_purchased'});assert.equal(r.http,200,JSON.stringify(r));}
  for(let n=0;n<2;n++){const id='seed-'+n;await db.prepare("INSERT INTO orders(order_id,order_type,buyer_id,payment_status) VALUES(?,'tenant_annual_fee',?,'paid')").bind(id,'synthetic-'+n).run();await db.prepare("INSERT INTO partner_bonus_deal_confirmations VALUES(?,?,?,'tenant_annual_fee','fixture',?,?,?,?,?,?,?,?)").bind(id,A,'synthetic-'+n,then,then,A,n+1,'{}','{}',crypto.randomUUID(),'{}').run();}
  const order=(id,buyer)=>({orderId:id,orderType:'tenant_annual_fee',buyerId:buyer,recruiterId:B,grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5,bv:3000});
  const first=order('same-order',buyers[0]);const creates=await Promise.all(Array.from({length:5},()=>call('/fixture/create',first)));for(const r of creates)assert.equal(r.success,true,JSON.stringify(r));
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM partner_bonus_order_snapshots WHERE order_id='same-order'").first()).n,1);
  const pays=await Promise.all(Array.from({length:5},()=>call('/fixture/pay',{orderId:first.orderId,paymentNo:'receipt-first',authenticatedUserId:A})));for(const r of pays)assert.equal(r.success,true,JSON.stringify(r));
  const confirm=async id=>({orderId:id,receiptRef:'synthetic verified receipt/opening',serviceOpenedAt:(await db.prepare('SELECT captured_at FROM partner_bonus_order_snapshots WHERE order_id=?').bind(id).first()).captured_at,confirmed:true,requestKey:crypto.randomUUID()});
  const proposal=await confirm(first.orderId);const confirmations=await Promise.all(Array.from({length:5},()=>call('/v1/partner-contracts/deals/confirm',proposal)));for(const r of confirmations)assert.equal(r.http,200,JSON.stringify(r));
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM bonus_transactions').first()).n,2);
  for(const [n,buyer]of buyers.slice(1).entries()){const id='parallel-'+n;await call('/fixture/create',order(id,buyer));await call('/fixture/pay',{orderId:id,paymentNo:'receipt-'+id,authenticatedUserId:A});}
  const distinct=await Promise.all(['parallel-0','parallel-1'].map(async id=>call('/v1/partner-contracts/deals/confirm',await confirm(id))));for(const r of distinct)assert.equal(r.http,200,JSON.stringify(r));
  assert.deepEqual(distinct.map(r=>r.plan.ordinal).sort(),[2,3]);
  const direct=(await db.prepare("SELECT beneficiary_id,amount FROM bonus_transactions WHERE bonus_type='direct_full'").all()).results;assert.deepEqual(direct,[{beneficiary_id:B,amount:3000}]);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM partner_bonus_deal_confirmations WHERE recruiter_uid=?').bind(B).first()).n,3);
  await db.prepare("UPDATE bonus_transactions SET status='paid' WHERE order_id='same-order'").run();const before=JSON.stringify((await db.prepare("SELECT * FROM bonus_transactions WHERE order_id='same-order'").all()).results);
  await call('/fixture/refund',{orderId:'same-order',authenticatedUserId:A});assert.equal(JSON.stringify((await db.prepare("SELECT * FROM bonus_transactions WHERE order_id='same-order'").all()).results),before);
  assert.equal((await call('/v1/partner-contracts?target='+B)).validDealCount,2);
  for(let n=5;n<8;n++){
   const target='U'+String(n).repeat(32),key=crypto.randomUUID();await db.prepare("INSERT INTO users(row_id,line_id,role,referrer_id) VALUES(?,?,'user',?)").bind(target,target,A).run();
   const results=await Promise.all([call('/v1/partner-contracts',{target_uid:target,signedAt:then,effectiveAt:then,documentSha256:'b'.repeat(64),evidenceRef:'synthetic cross-route proof',confirmed:true,requestKey:key,purchaseStatus:'not_purchased'}),call('/v1/partner-contracts/attribution',{target_uid:target,manager_uid:A,effectiveAt:then,consentSha256:'c'.repeat(64),evidenceRef:'synthetic consent',confirmed:true,requestKey:key})]);
   for(const [i,r]of results.entries()){assert.ok([200,409].includes(r.http),JSON.stringify(r));const table=i?'partner_attribution_events':'partner_contract_enrollments';assert.equal((await db.prepare('SELECT count(*) n FROM '+table+' WHERE request_key=?').bind(key).first()).n,r.http===200?1:0,'A failed CAS may not leave a cross-route phantom insert');}
  }
  const recruiter='U'+'f'.repeat(32),buyer='U'+'0'.repeat(32);await db.prepare("INSERT INTO users(row_id,line_id,role,referrer_id) VALUES(?,?,'user',?),(?,?,'user',?)").bind(recruiter,recruiter,A,buyer,buyer,recruiter).run();
  const contractProposal={target_uid:recruiter,signedAt:then,effectiveAt:then,documentSha256:'d'.repeat(64),evidenceRef:'synthetic racing signature',confirmed:true,requestKey:crypto.randomUUID(),purchaseStatus:'not_purchased'};
  const raced=await Promise.all([call('/v1/partner-contracts',contractProposal),call('/fixture/create',{...order('enrollment-order-race',buyer),recruiterId:recruiter,authenticatedUserId:A})]);assert.equal(raced[1].success,true,JSON.stringify(raced));
  if(raced[0].http===409)assert.equal((await call('/v1/partner-contracts',contractProposal)).http,200);else assert.equal(raced[0].http,200,JSON.stringify(raced));
  const contract=await db.prepare('SELECT * FROM partner_contract_enrollments WHERE member_uid=?').bind(recruiter).first(),created=await db.prepare("SELECT * FROM orders WHERE order_id='enrollment-order-race'").first(),capture=JSON.parse(created.raw_json);
  assert.equal(created.bonus_policy_type,capture.partnerPolicyRevision<contract.verified_revision?'left_right_independent_split':'cocreator-2026-10-25-v2','Classification must follow actual serialized contract/order revision');
  const unsigned='U'+'1'.repeat(32),unsignedBuyer='U'+'2'.repeat(32);await db.prepare("INSERT INTO users(row_id,line_id,role,referrer_id) VALUES(?,?,'user',?),(?,?,'user',?)").bind(unsigned,unsigned,A,unsignedBuyer,unsignedBuyer,unsigned).run();await db.prepare("INSERT INTO user_identity_links VALUES(?,?,'active'),(?,?,'active')").bind('U'+'8'.repeat(32),unsigned,'U'+'9'.repeat(32),unsignedBuyer).run();
  const legacyLinked=await call('/fixture/create',{...order('unsigned-linked',unsignedBuyer),recruiterId:unsigned,authenticatedUserId:A});assert.equal(legacyLinked.success,true,JSON.stringify(legacyLinked));assert.equal(legacyLinked.data.bonusPolicyType,'left_right_independent_split');
  console.log('WORKERD PASS: five concurrent creates/payments/confirms once; distinct confirmations get ordinals 2/3 and correct 50%; refund preserves paid ledger; same-key cross-route CAS has no phantom writes; enrollment/order race classifies by serialized revision; no live services');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
