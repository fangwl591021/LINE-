// Self-only consumer journal. Transaction sources are SELECT-only; only viewer metadata is written.
const BASE = '/v1/store-consumption-journal';
const UID = /^U[0-9a-f]{32}$/i;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ID_FIELDS = ['line_id', 'row_id', 'point_line_id', 'legacy_line_id'];
const HEADERS = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const text = value => String(value ?? '').trim();
const reply = (value,status=200) => new Response(JSON.stringify(value),{status,headers:HEADERS});
const stmt = (db,sql,...args) => db.prepare(sql).bind(...args);
class JournalError extends Error { constructor(code,message,status=400){super(message);this.code=code;this.status=status;} }
const fail = (code,message,status) => {throw new JournalError(code,message,status);};
async function rows(db,sql,...args){const result=await stmt(db,sql,...args).all();if(result.success===false||!Array.isArray(result.results))throw Error('D1_READ_FAILED');return result.results;}
async function boundedJson(message,max=4096){
  const reader=message.body?.getReader();if(!reader)fail('INVALID_BODY','資料格式不正確');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();fail('BODY_TOO_LARGE','資料過長',413);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
  try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{fail('INVALID_BODY','資料格式不正確');}
}
async function authenticate(request,db,fetcher){
  const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if(!token||token.length>4096)fail('AUTH_REQUIRED','請先使用 LINE 登入',401);
  let response;try{response=await fetcher('https://api.line.me/v2/profile',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});}catch{fail('AUTH_UNAVAILABLE','LINE 驗證暫時無法完成',503);}
  if(!response.ok)fail('AUTH_EXPIRED','登入已失效，請重新登入',401);
  const profile=await boundedJson(response,8192);if(!UID.test(profile.userId||''))fail('AUTH_INVALID','無法確認登入身分',401);
  const ids=new Set([profile.userId]);let members=[],links=[];
  // Follow only persisted identities. Ambiguity fails closed; no phone/name guessing or payload UID.
  for(let pass=0;pass<4;pass++){
    const before=ids.size,encoded=JSON.stringify([...ids]);
    links=await rows(db,"SELECT old_line_id,new_line_id FROM user_identity_links WHERE status='active' AND (old_line_id IN (SELECT value FROM json_each(?1)) OR new_line_id IN (SELECT value FROM json_each(?1))) LIMIT 3",encoded);
    if(links.length>1)fail('IDENTITY_CONFLICT','會員身分對應不唯一，請聯絡管理員',409);
    for(const link of links){if(!UID.test(link.old_line_id)||!UID.test(link.new_line_id)||link.old_line_id===link.new_line_id)fail('IDENTITY_CONFLICT','會員身分對應不唯一',409);ids.add(link.old_line_id);ids.add(link.new_line_id);}
    members=await rows(db,`SELECT line_id,row_id,point_line_id,legacy_line_id FROM users WHERE ${ID_FIELDS.map(field=>`${field} IN (SELECT value FROM json_each(?1))`).join(' OR ')} LIMIT 3`,JSON.stringify([...ids]));
    if(members.length>1)fail('IDENTITY_CONFLICT','會員身分對應不唯一，請聯絡管理員',409);
    for(const member of members)for(const field of ID_FIELDS)if(text(member[field]))ids.add(text(member[field]));
    if(ids.size>8)fail('IDENTITY_CONFLICT','會員身分對應過多',409);
    if(ids.size===before){
      if(!members.length)fail('MEMBER_REQUIRED','請先完成會員登入',403);
      const viewer=links[0]?.new_line_id||members[0].line_id;
      if(!UID.test(viewer||''))fail('IDENTITY_CONFLICT','無法確認會員主帳號',409);
      const sorted=[...ids].sort();return {viewer,uid:profile.userId,ids:sorted,key:JSON.stringify(sorted),identityKey:JSON.stringify([profile.userId,...sorted])};
    }
  }
  fail('IDENTITY_CONFLICT','會員身分對應不唯一',409);
}
function day(value){if(!/^20\d{2}-\d{2}-\d{2}$/.test(value))return NaN;const ms=Date.parse(value+'T00:00:00+08:00');return Number.isFinite(ms)&&new Date(ms+28800000).toISOString().slice(0,10)===value?ms:NaN;}
function filters(params){
  const type=params.get('type')||'all',start=params.get('start')||'',end=params.get('end')||'',unread=params.get('unread')||'';
  if(!['all','store','online'].includes(type)||!['','0','1'].includes(unread))fail('INVALID_FILTER','篩選條件不正確');
  if((start&&!Number.isFinite(day(start)))||(end&&!Number.isFinite(day(end)))||(start&&end&&(day(end)<day(start)||day(end)-day(start)>=366*86400000)))fail('INVALID_DATE','請選擇有效日期，最多 366 天');
  return {type,start,end,unread:unread==='1'};
}
const HIGH_WATER = `COALESCE((SELECT MAX(rowid) FROM store_point_cashier_logs),0),COALESCE((SELECT MAX(rowid) FROM store_commerce_orders),0),COALESCE((SELECT MAX(rowid) FROM store_commerce_events),0)`;
async function snapshotFor(db,actor,params,now){
  const requested=params.get('snapshot');
  if(requested){
    if(!UUID.test(requested))fail('INVALID_SNAPSHOT','請重新整理日誌');
    const snapshot=await stmt(db,'SELECT * FROM store_consumption_journal_snapshots WHERE id=? AND viewer_uid=? AND identity_key=? AND expires_at>?',requested,actor.viewer,actor.identityKey,now).first();
    if(!snapshot)fail('SNAPSHOT_EXPIRED','日誌已更新或逾時，請重新整理',409);
    // The snapshot owns its filters; do not let cursors silently change the read-all scope.
    if(['type','start','end','unread'].some(key=>params.has(key))&&JSON.stringify(filters(params))!==snapshot.filter_json)fail('SNAPSHOT_FILTER_MISMATCH','篩選條件已變更，請重新整理',409);
    return snapshot;
  }
  const id=crypto.randomUUID(),filter=filters(params),expires=new Date(Date.parse(now)+15*60000).toISOString();
  await db.batch([
    // Bounded housekeeping of this viewer's expired list snapshots only; read state is retained.
    stmt(db,`DELETE FROM store_consumption_journal_snapshots WHERE viewer_uid=?1 AND expires_at<=?2
      AND id IN (SELECT id FROM store_consumption_journal_snapshots WHERE viewer_uid=?1 AND expires_at<=?2 ORDER BY expires_at,id LIMIT 100)`,actor.viewer,now),
    stmt(db,`INSERT INTO store_consumption_journal_snapshots(id,viewer_uid,identity_key,cashier_max,order_max,event_max,filter_json,created_at,expires_at) SELECT ?,?,?,${HIGH_WATER},?,?,?`,id,actor.viewer,actor.identityKey,JSON.stringify(filter),now,expires),
    stmt(db,`INSERT INTO store_consumption_journal_viewers(viewer_uid,cashier_baseline,order_baseline,event_baseline,initialized_at) SELECT viewer_uid,cashier_max,order_max,event_max,created_at FROM store_consumption_journal_snapshots WHERE id=? ON CONFLICT(viewer_uid) DO NOTHING`,id)
  ]);
  return stmt(db,'SELECT * FROM store_consumption_journal_snapshots WHERE id=? AND viewer_uid=?',id,actor.viewer).first();
}
// All source IDs are namespaced. Cashier requests enrich one ledger entry, never become a second entry.
function journalQuery(actor,snapshot,includeRead=false){
  const f=JSON.parse(snapshot.filter_json),args=[actor.key,actor.viewer,snapshot.cashier_max,snapshot.order_max,snapshot.event_max,actor.uid];
  let filter="1=1";
  if(f.type!=='all'){filter+=' AND source=?';args.push(f.type);}
  if(f.start){filter+=' AND occurredAt>=?';args.push(new Date(day(f.start)).toISOString());}
  if(f.end){filter+=' AND occurredAt<?';args.push(new Date(day(f.end)+86400000).toISOString());}
  if(f.unread&&!includeRead)filter+=' AND unread=1';
  return {args,sql:`WITH ledger AS (
    SELECT l.*,l.rowid AS source_pos,CASE WHEN json_valid(l.point_response_json) THEN l.point_response_json ELSE '{}' END AS safe_response,
      r.request_id,r.status AS request_status,CASE WHEN json_valid(r.fingerprint) THEN r.fingerprint ELSE '{}' END AS safe_fingerprint,
      s.name AS shop_name
    FROM store_point_cashier_logs l LEFT JOIN store_cashier_requests r ON l.log_id='SPC_'||r.actor_id||'_'||r.request_id
      AND r.actor_id=l.actor_user_id AND r.customer_id=l.customer_point_user_id
    LEFT JOIN store_shop_stores s ON s.owner_uid=l.actor_user_id
    WHERE l.rowid<=?3 AND l.customer_point_user_id IN (SELECT value FROM json_each(?1))
      AND l.amount>0 AND l.amount<=1000000 AND l.amount=CAST(l.amount AS INTEGER)
      AND l.mode IN ('redeem','reward')
  ), entries AS (
    SELECT 'store:'||log_id AS id,'store' AS source,log_id AS sourceId,1 AS version,source_pos,0 AS event_pos,
      strftime('%Y-%m-%dT%H:%M:%fZ',created_at) AS occurredAt,COALESCE(NULLIF(shop_name,''),'店家消費') AS shopName,
      CASE WHEN mode='redeem' THEN '店內消費折抵' ELSE '店內消費贈點' END AS title,
      CAST(amount*100 AS INTEGER) AS amountCents,CASE WHEN mode='redeem' THEN ABS(points) ELSE 0 END AS discountPoints,
      CASE WHEN mode='reward' THEN points ELSE 0 END AS earnedPoints,CAST(payable_amount*100 AS INTEGER) AS payableCents,
      'unconfirmed' AS paymentStatus,'' AS fulfillmentStatus,request_id AS transactionId,'' AS detail_json
    FROM ledger WHERE json_extract(safe_response,'$.rewardPoints') IS NULL AND json_extract(safe_fingerprint,'$.rewardPoints') IS NULL
      AND points=CAST(points AS INTEGER) AND ((mode='redeem' AND points<0 AND -points<=amount AND payable_amount=amount+points)
        OR (mode='reward' AND points>0 AND payable_amount=amount))
    UNION ALL
    SELECT 'online:'||o.id,'online',o.id,o.version,o.rowid,COALESCE((SELECT MAX(e.rowid) FROM store_commerce_events e WHERE e.order_id=o.id),0),
      strftime('%Y-%m-%dT%H:%M:%fZ',o.created_at),COALESCE(NULLIF(json_extract(o.snapshot_json,'$.shop_name'),''),'網路商城'),
      '網路訂單',o.total_cents,0,0,o.total_cents,o.payment_status,o.fulfillment_status,o.id,o.snapshot_json
    FROM store_commerce_orders o WHERE o.rowid<=?4 AND o.buyer_uid=?6
      AND json_valid(o.snapshot_json) AND o.total_cents>0 AND o.total_cents=CAST(o.total_cents AS INTEGER)
      AND NOT EXISTS(SELECT 1 FROM store_commerce_events e WHERE e.order_id=o.id AND e.rowid>?5)
  ), marked AS (
    SELECT e.*,CASE WHEN COALESCE(r.read_version,0)>=e.version OR
      (e.source='store' AND e.source_pos<=v.cashier_baseline) OR
      (e.source='online' AND e.source_pos<=v.order_baseline AND e.event_pos<=v.event_baseline)
      THEN 0 ELSE 1 END AS unread
    FROM entries e JOIN store_consumption_journal_viewers v ON v.viewer_uid=?2
    LEFT JOIN store_consumption_journal_reads r ON r.viewer_uid=?2 AND r.entry_id=e.id
    WHERE occurredAt IS NOT NULL
  ), filtered AS (SELECT * FROM marked WHERE ${filter}) `};
}
const listItem = row => ({id:row.id,source:row.source,sourceId:row.sourceId,version:row.version,occurredAt:row.occurredAt,
  shopName:text(row.shopName).slice(0,160),title:row.title,amountCents:row.amountCents,discountPoints:row.discountPoints,
  earnedPoints:row.earnedPoints,payableCents:row.payableCents,paymentStatus:row.paymentStatus,fulfillmentStatus:row.fulfillmentStatus,unread:row.unread===1});
function decodeCursor(raw){try{const c=JSON.parse(atob(raw));if(!c||typeof c.time!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(c.time)||typeof c.id!=='string'||c.id.length>200)throw Error();return c;}catch{fail('INVALID_CURSOR','分頁資料不正確，請重新整理');}}
function validEntryId(id){return typeof id==='string'&&/^(store|online):[^\s]{1,180}$/.test(id);}
async function countUnread(db,query){const row=await stmt(db,query.sql+'SELECT COUNT(*) AS total FROM filtered WHERE unread=1',...query.args).first();return Number(row?.total||0);}
function detailItem(row){
  const base=listItem(row),detail={...base,transactionId:text(row.transactionId||row.sourceId),notice:row.source==='store'?'應收金額不代表店家已收到現金；店家名稱為目前資料。':'訂單金額與付款、出貨狀態分別顯示；未付款及取消訂單不是已完成消費。'};
  if(row.source==='online'){
    let data={};try{const parsed=JSON.parse(row.detail_json);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))data=parsed;}catch{}
    const integer=(value,min=0)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min?value:null;
    detail.items=(Array.isArray(data.items)?data.items:[]).slice(0,100).map(item=>({title:text(item?.title).slice(0,200),quantity:integer(item?.quantity,1),priceCents:integer(item?.price_cents),lineTotalCents:integer(item?.line_total_cents)}));
    detail.shippingFeeCents=integer(data.shipping_fee_cents);
  }
  return detail;
}
export async function handleStoreConsumptionJournal(request,env,fetcher=fetch,clock=()=>new Date()){
  const url=new URL(request.url);if(url.pathname!==BASE&&!url.pathname.startsWith(BASE+'/'))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  try{
    if(!env.ACTMASTER_DB)fail('JOURNAL_UNAVAILABLE','消費日誌尚未開放',503);
    const db=env.ACTMASTER_DB.withSession?env.ACTMASTER_DB.withSession('first-primary'):env.ACTMASTER_DB;
    const actor=await authenticate(request,db,fetcher),now=clock().toISOString(),path=url.pathname.slice(BASE.length);
    const allowed=path===''&&request.method==='GET'||path==='/detail'&&request.method==='GET'||['/read','/read-all'].includes(path)&&request.method==='POST';
    if(!allowed)fail('METHOD_NOT_ALLOWED','不支援此日誌操作',405);
    let body=null;
    if(request.method==='POST'){
      body=await boundedJson(request);
      if(Object.keys(body).some(key=>!['id','snapshot'].includes(key))||!UUID.test(body.snapshot||''))fail('INVALID_BODY','請從消費日誌操作已讀狀態');
      url.searchParams.set('snapshot',body.snapshot);
    }
    if(path==='/detail'&&!url.searchParams.get('snapshot'))fail('SNAPSHOT_REQUIRED','請先開啟消費日誌');
    if(url.searchParams.get('cursor')&&!url.searchParams.get('snapshot'))fail('SNAPSHOT_REQUIRED','請重新整理後再分頁');
    const snapshot=await snapshotFor(db,actor,url.searchParams,now),query=journalQuery(actor,snapshot,path==='/detail'||path==='/read');
    if(path===''){
      const raw=url.searchParams.get('cursor');if(raw&&raw.length>1024)fail('INVALID_CURSOR','分頁資料過長');
      const cursor=raw?decodeCursor(raw):null,args=[...query.args];
      let where='';if(cursor){where='WHERE occurredAt<? OR (occurredAt=? AND id<?)';args.push(cursor.time,cursor.time,cursor.id);}
      const found=await rows(db,query.sql+`SELECT * FROM filtered ${where} ORDER BY occurredAt DESC,id DESC LIMIT 21`,...args);
      const page=found.slice(0,20),last=page.at(-1);
      return reply({success:true,items:page.map(listItem),nextCursor:found.length>20?btoa(JSON.stringify({time:last.occurredAt,id:last.id})):null,snapshot:snapshot.id,unreadCount:await countUnread(db,query),timeZone:'Asia/Taipei'});
    }
    if(path==='/detail'||path==='/read'){
      const id=body?.id||url.searchParams.get('id');if(!validEntryId(id))fail('INVALID_ID','交易編號不正確');
      const row=await stmt(db,query.sql+'SELECT * FROM filtered WHERE id=? LIMIT 1',...query.args,id).first();
      if(!row)fail('ENTRY_UNAVAILABLE','找不到此筆紀錄或內容已更新，請重新整理',404);
      if(path==='/detail')return reply({success:true,item:detailItem(row)});
      // Re-select inside the write to avoid marking a changed order version after the snapshot.
      const saved=await stmt(db,query.sql+`INSERT INTO store_consumption_journal_reads(viewer_uid,entry_id,read_version,read_at)
        SELECT ?,id,version,? FROM filtered WHERE id=? ON CONFLICT(viewer_uid,entry_id)
        DO UPDATE SET read_version=MAX(read_version,excluded.read_version),read_at=excluded.read_at`,...query.args,actor.viewer,now,id).run();
      if(saved.success===false)throw Error('D1_WRITE_FAILED');
      if(Number(saved.meta?.changes)!==1)fail('ENTRY_UPDATED','紀錄已更新，請重新整理後再標示已讀',409);
    }else{
      const saved=await stmt(db,query.sql+`INSERT INTO store_consumption_journal_reads(viewer_uid,entry_id,read_version,read_at)
        SELECT ?,id,version,? FROM filtered WHERE unread=1 ON CONFLICT(viewer_uid,entry_id)
        DO UPDATE SET read_version=MAX(read_version,excluded.read_version),read_at=excluded.read_at`,...query.args,actor.viewer,now).run();
      if(saved.success===false)throw Error('D1_WRITE_FAILED');
    }
    return reply({success:true,snapshot:snapshot.id,unreadCount:await countUnread(db,query)});
  }catch(error){
    if(error instanceof JournalError)return reply({success:false,code:error.code,error:error.message},error.status);
    // Schema is migration-owned; never execute runtime DDL or leak SQL/PII in errors.
    return reply({success:false,code:'JOURNAL_UNAVAILABLE',error:'消費日誌資料尚未就緒，請稍後重試或聯絡管理員'},503);
  }
}
