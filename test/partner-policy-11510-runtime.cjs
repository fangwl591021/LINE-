const assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
const {Miniflare}=require(process.env.LISTING_MINIFLARE_MODULE),{buildSync}=require(process.env.LISTING_ESBUILD_MODULE);
(async()=>{
 const bundle=buildSync({entryPoints:['test/fixtures/partner-bonus-v2-runtime.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-04-23',d1Databases:{ACTMASTER_DB:'partner-11510-isolated'},port:0});
 try{
  const db=await mf.getD1Database('ACTMASTER_DB'),A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),buyers=['c','d','e','f'].map(x=>'U'+x.repeat(32)),then=new Date(Date.now()-86400000).toISOString();
  await db.exec("CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',referrer_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT '',member_number TEXT DEFAULT ''); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);");
  await db.prepare("INSERT INTO users(row_id,line_id,role,referrer_id,member_number) VALUES(?,?,'admin','','20261026001'),(?,?,'user',?,'20261026002')").bind(A,A,B,B,A).run();
  for(const buyer of buyers)await db.prepare("INSERT INTO users(row_id,line_id,role,referrer_id) VALUES(?,?,'user',?)").bind(buyer,buyer,B).run();
  const schema=readFileSync('migrations/0001_core_schema.sql','utf8');for(const name of ['orders','bonus_transactions'])await db.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0].replace(/\s+/g,' '));
  for(const migration of ['0070_partner_bonus_v2.sql','0074_partner_policy_11510.sql','0075_partner_settlement_11510.sql'])for(const stmt of readFileSync('migrations/'+migration,'utf8').split(';').map(x=>x.trim()).filter(Boolean))await db.exec(stmt.replace(/--[^\n]*/g,'').replace(/\s+/g,' ')+';');
  const call=async(path,data)=>{const r=await mf.dispatchFetch('https://test'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {http:r.status,...await r.json()};};
  const enroll=(id,extra={})=>({target_uid:id,templateVersion:'115.10',signedAt:then,effectiveAt:then,documentSha256:'a'.repeat(64),evidenceRef:'synthetic signed11510 proof',confirmed:true,requestKey:crypto.randomUUID(),purchaseStatus:'not_purchased',partyType:'natural_person',partyName:'合成簽約人',representativeName:'',referrerName:id===A?'':'合成推薦人',referrerMemberNumber:id===A?'':'20261026001',bankName:'合成銀行',bankCode:'000',bankBranch:'合成分行',bankAccountHolder:'合成簽約人',bankAccount:'000001234567',...extra});
  for(const id of [A,B])assert.equal((await call('/v1/partner-contracts',enroll(id))).http,200);
  for(let n=0;n<2;n++){const id='seed-'+n;await db.prepare("INSERT INTO orders(order_id,order_type,buyer_id,payment_status) VALUES(?,'tenant_annual_fee',?,'paid')").bind(id,'synthetic-'+n).run();await db.prepare("INSERT INTO partner_bonus_deal_confirmations VALUES(?,?,?,'tenant_annual_fee','fixture',?,?,?,?,?,?,?,?)").bind(id,A,'synthetic-'+n,then,then,A,n+1,'{}','{}',crypto.randomUUID(),'{}').run();}
  const order=(id,buyer,type='tenant_annual_fee')=>({orderId:id,orderType:type,buyerId:buyer,grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5});
  const open=async(id,buyer,type)=>{const r=await call('/fixture/create',order(id,buyer,type));assert.equal(r.success,true,JSON.stringify(r));assert.equal((await call('/fixture/pay',{orderId:id,paymentNo:'isolated-'+id,authenticatedUserId:A})).success,true);};
  const year=v=>{const d=new Date(v);d.setUTCFullYear(d.getUTCFullYear()+1);return d.toISOString();};
  const proposal=async(id,extra={})=>{const captured=(await db.prepare('SELECT captured_at FROM partner_bonus_order_snapshots WHERE order_id=?').bind(id).first()).captured_at;return {orderId:id,receiptRef:'synthetic receipt/opening',serviceOpenedAt:captured,serviceYearStart:captured,serviceYearEnd:year(captured),serviceAdmission:'new',reviewReason:'當下歸屬尚待書面確認',reviewHandlingDueAt:new Date(Date.now()+7*86400000).toISOString(),confirmed:true,requestKey:crypto.randomUUID(),...extra};};
  await open('once',buyers[0]);const once=await proposal('once'),same=await Promise.all(Array.from({length:6},()=>call('/v1/partner-contracts/deals/confirm',once)));for(const r of same)assert.equal(r.http,200,JSON.stringify(r));assert.equal((await db.prepare("SELECT COUNT(*) n FROM partner_service_year_claims WHERE order_id='once'").first()).n,1);assert.equal((await db.prepare("SELECT COUNT(*) n FROM bonus_transactions WHERE order_id='once'").first()).n,2);
  for(const [i,buyer]of buyers.slice(1,3).entries())await open('parallel-'+i,buyer);
  const distinct=await Promise.all(['parallel-0','parallel-1'].map(async id=>call('/v1/partner-contracts/deals/confirm',await proposal(id))));for(const r of distinct)assert.equal(r.http,200,JSON.stringify(r));assert.deepEqual(distinct.map(r=>r.plan.ordinal).sort(),[2,3]);
  const nextYear=once.serviceYearEnd,renewals=['same-year-a','same-year-b'];for(const id of renewals)await open(id,buyers[0],'tenant_renewal_fee');
  const overlap=await Promise.all(renewals.map(async id=>call('/v1/partner-contracts/deals/confirm',await proposal(id,{serviceAdmission:'renewal',serviceYearStart:nextYear,serviceYearEnd:year(nextYear)}))));assert.deepEqual(overlap.map(r=>r.http).sort(),[200,409]);assert.equal((await db.prepare('SELECT COUNT(*) n FROM partner_service_year_claims WHERE buyer_uid=?').bind(buyers[0]).first()).n,2);
  const successful=renewals[overlap.findIndex(r=>r.http===200)];assert.equal((await db.prepare("SELECT COUNT(*) n FROM bonus_transactions WHERE order_id=? AND beneficiary_id=?").bind(successful,B).first()).n,1);
  const bContract=await db.prepare('SELECT id FROM partner_contract_enrollments WHERE member_uid=?').bind(B).first();
  // Actual production settlement route and lifecycle share the same D1 clock.
  const dateNow=new Date(),priorMonth=new Date(Date.UTC(dateNow.getUTCFullYear(),dateNow.getUTCMonth()-1,15,1)).toISOString();await db.prepare('UPDATE partner_bonus_deal_confirmations SET confirmed_at=? WHERE order_id=?').bind(priorMonth,successful).run();await db.prepare('UPDATE bonus_transactions SET created_at=? WHERE order_id=?').bind(priorMonth,successful).run();
  const statement=await call('/v1/partner-contracts/settlement/statements',{target_uid:B,month:priorMonth.slice(0,7),deliveredAt:new Date().toISOString(),evidenceRef:'isolated statement delivery',confirmed:true,requestKey:crypto.randomUUID()});
  if(statement.http===200){
   const claimPayload={statementId:statement.statement.id,completedAt:new Date().toISOString(),evidenceRef:'isolated legal claim',confirmed:true,requestKey:crypto.randomUUID()};
   const stopped={contractId:bContract.id,action:'termination',terminationGround:'breach',effectiveAt:new Date().toISOString(),evidenceSha256:'c'.repeat(64),evidenceRef:'isolated termination',reason:'合成重大違約測試',confirmed:true,requestKey:crypto.randomUUID()};
   const raced=await Promise.all([call('/v1/partner-contracts/settlement/claims',claimPayload),call('/v1/partner-contracts/lifecycle',stopped)]);assert.ok(raced.every(r=>[200,409].includes(r.http)),JSON.stringify(raced));if(raced[1].http===409)assert.equal((await call('/v1/partner-contracts/lifecycle',stopped)).http,200,JSON.stringify(raced));
  }else{
   assert.fail('Runtime settlement setup must succeed: '+JSON.stringify(statement));
  }
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM bonus_transactions WHERE beneficiary_id=? AND status IN ('payable','review_required','frozen')").bind(B).first()).n,0);
  const overlapId=buyers[3],parallelEnroll=await Promise.all([call('/v1/partner-contracts',enroll(overlapId,{referrerName:'合成推薦人',referrerMemberNumber:'20261026002'})),call('/v1/partner-contracts',enroll(overlapId,{referrerName:'合成推薦人',referrerMemberNumber:'20261026002',documentSha256:'b'.repeat(64)}))]);assert.deepEqual(parallelEnroll.map(r=>r.http).sort(),[200,409]);
  console.log('WORKERD11510 PASS: six repeated confirmations once; parallel deals ordinal2/3; same-customer service-year uniqueness; independent renewal quarter; termination-vs-claim fenced; concurrent enrollment no overlap; isolated D1 only');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
