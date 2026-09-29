// One activity/form owns its date options; registrations keep their existing QR/payment IDs.
const text = v => String(v ?? '').trim();
export function activityBatchRows(row) {
  const options = JSON.parse(row.batch_options || '[]');
  if (!Array.isArray(options)) throw Error('Invalid activity date options');
  return options.map(b => ({...row,...b,network_id:row.network_id,creator_id:row.creator_id,
    name:`${row.name}｜${b.batch_name}`,is_series:0,series_id:row.activity_id,batch_options:'[]',
    fee_type:b.price?'收費':'免費',status:row.status==='上架'?b.status:row.status}));
}
export function batchTime(value) {
  const s = text(value).replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return '';
  const d = new Date(s + ':00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,16) === s ? s.replace('T',' ') : '';
}
export function normalizeActivityBatches(values) {
  if (!Array.isArray(values) || !values.length || values.length > 24) throw Error('請勾選 1–24 個梯次');
  const seen = new Set();
  return values.map((v, i) => {
    const name = text(v?.name).slice(0,120), startTime = batchTime(v?.startTime), endTime = batchTime(v?.endTime);
    const price = Number(v?.price), limit = text(v?.limit) ? Number(v.limit) : null;
    if (!name || !startTime) throw Error(`第 ${i+1} 梯次需填寫名稱與完整開始時間`);
    if (text(v?.endTime) && (!endTime || endTime <= startTime)) throw Error(`第 ${i+1} 梯次結束時間需晚於開始時間`);
    if (v?.price === null || text(v?.price) === '' || !Number.isSafeInteger(price) || price < 0) throw Error(`第 ${i+1} 梯次費用待確認（免費填 0）`);
    if (limit !== null && (!Number.isSafeInteger(limit) || limit <= 0)) throw Error('梯次名額需為正整數或留空');
    const key = `${name}:${startTime}`;
    if (seen.has(key)) throw Error('請勿重複勾選相同梯次');
    seen.add(key);
    return {name,startTime,endTime,price,limit,nfcCheckinStart:text(v.nfcCheckinStart),nfcCheckinEnd:text(v.nfcCheckinEnd)};
  });
}
export async function createActivityBatches(payload, env, module) {
  if (!env.ACTMASTER_DB) return {success:false,error:'梯次資料庫暫時無法使用，請稍後重試'};
  let batches;
  try { batches = normalizeActivityBatches(payload.batches); } catch(e) { return {success:false,error:e.message}; }
  if (payload.names?.length) return {success:false,error:'系列請建立後再逐梯次管理報名名單'};
  const root = module.normalizeActivity({...payload,isBatch:true});
  root.creator_id = text(payload.authenticatedUserId || payload.userId);
  root.network_id = text(payload.authenticatedNetworkId || 'admin');
  if (!root.creator_id || !/^[\w-]{1,130}$/.test(root.activity_id)) return {success:false,error:'活動身分或編號無效'};
  await module.ensureActivityNetworkScope(env);
  const db=env.ACTMASTER_DB;
  const existing = async () => {
    const row=await db.prepare('SELECT * FROM activities WHERE activity_id=?').bind(root.activity_id).first();
    if (!row) return null;
    const count=activityBatchRows(row).length || (await db.prepare('SELECT activity_id FROM activities WHERE series_id=? AND network_id=?').bind(root.activity_id,root.network_id).all()).results.length;
    return row.creator_id===root.creator_id && row.network_id===root.network_id && row.is_series===1 && count
      ? {success:true,data:{activityId:root.activity_id,batchCount:count,existed:true}}
      : {success:false,error:'此活動編號已存在；不會覆蓋原活動或報名，請重新整理確認'};
  };
  const found=await existing(); if(found)return found;
  root.start_time=batches.map(b=>b.startTime).sort()[0];
  root.end_time=batches.map(b=>b.endTime || b.startTime).sort().at(-1);
  root.price=Math.max(...batches.map(b=>b.price));root.fee_type=root.price?'收費':'免費';
  const fields=['activity_id','name','type','fee_type','price','start_time','end_time','description','image_url','image_ratio','creator_id','network_id','status','is_series','series_id','batch_name','batch_limit','nfc_checkin_start','nfc_checkin_end','nfc_same_day_only','batch_options'];
  root.batch_options=JSON.stringify(batches.map((b,i)=>({
    activity_id:`${root.activity_id}_B${String(i+1).padStart(2,'0')}`,batch_name:b.name,
    start_time:b.startTime,end_time:b.endTime,price:b.price,batch_limit:b.limit,status:'上架',
    nfc_checkin_start:b.nfcCheckinStart,nfc_checkin_end:b.nfcCheckinEnd})));
  const rows=[{...root,series_id:'',batch_name:'',batch_limit:null}];
  try {
    // A concurrent retry loses the root PK insert; the entire batch rolls back, then reads the winner.
    await db.batch(rows.map(row=>db.prepare(`INSERT INTO activities (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).bind(...fields.map(k=>row[k]))));
    return {success:true,data:{activityId:root.activity_id,batchCount:batches.length}};
  } catch (_) { return await existing() || {success:false,error:'梯次尚未建立成功，可重試同一筆；不會退回單場建立'}; }
}
export async function activityWithBatches(row, env, module) {
  const activity=module.activityRow(row);
  if (row.is_series && !row.series_id && !activity.batches?.length) {
    const result=await env.ACTMASTER_DB.prepare('SELECT * FROM activities WHERE series_id=? AND network_id=? ORDER BY start_time,activity_id LIMIT 25').bind(row.activity_id,row.network_id || 'admin').all();
    activity.batches=result.results.map(r=>module.activityRow(r));
  }
  return activity;
}
export async function joinActivityBatches(payload, env, request, security, module) {
  const db=env.ACTMASTER_DB;
  if (!db) return payload.batchIds ? {success:false,error:'梯次資料庫無法使用'} : null;
  const row=await db.prepare('SELECT * FROM activities WHERE activity_id=?').bind(text(payload.activityId)).first();
  if (!row?.is_series && !row?.series_id) return payload.batchIds ? {success:false,error:'活動不是系列梯次'} : null;
  const actor=await security.getActor(payload,request,env);
  if (!actor?.userId || !actor.token) return {success:false,error:'請重新從 LINE 登入後報名'};
  const root=row.series_id ? await db.prepare('SELECT * FROM activities WHERE activity_id=?').bind(row.series_id).first() : row;
  if (!root || root.status!=='上架') return {success:false,error:'系列活動未開放'};
  const visible=await module.getActivityById({...payload,activityId:root.activity_id},env,actor);
  if (!visible?.success) return {success:false,error:'系列活動不在您的可查看範圍'};
  const ids=row.series_id ? [row.activity_id] : Array.isArray(payload.batchIds) ? [...new Set(payload.batchIds.map(text))] : [];
  if (!ids.length || ids.length>24) return {success:false,error:'請勾選要報名的梯次'};
  const embedded=activityBatchRows(root);
  const children=embedded.length ? embedded : (await db.prepare('SELECT * FROM activities WHERE series_id=? AND network_id=?').bind(root.activity_id,root.network_id).all()).results;
  const selected=ids.map(id=>children.find(c=>c.activity_id===id && c.status==='上架'));
  if (selected.some(c=>!c)) return {success:false,error:'勾選的梯次已下架或不屬於此活動，請重新整理'};
  const member=await db.prepare('SELECT name,phone FROM users WHERE line_id=? LIMIT 1').bind(actor.userId).first();
  if (!member?.name || !member?.phone) return {success:false,error:'請先確認會員姓名及手機'};
  // Each SELECT/INSERT is inside a transactional batch. A full or closed slot is not inserted;
  // return explicit partial results so retries only fill missing slots, never claim false success.
  const statements=selected.map(c=>embedded.length ? db.prepare(`INSERT INTO registrants
    (row_id,line_id,activity_id,batch_id,activity_name,name,phone,identity,amount,payment_status,start_time,description,image_url,status)
    SELECT ?,?,a.activity_id,json_extract(b.value,'$.activity_id'),a.name || '｜' || json_extract(b.value,'$.batch_name'),?,?,'會員',
      json_extract(b.value,'$.price'),CASE WHEN json_extract(b.value,'$.price')>0 THEN '待付款' ELSE '免費' END,
      json_extract(b.value,'$.start_time'),a.description,a.image_url,'active'
    FROM activities a, json_each(a.batch_options) b
    WHERE a.activity_id=? AND a.network_id=? AND a.status='上架'
      AND json_extract(b.value,'$.activity_id')=? AND json_extract(b.value,'$.status')='上架'
      AND NOT EXISTS (SELECT 1 FROM registrants r WHERE r.activity_id=a.activity_id AND r.batch_id=json_extract(b.value,'$.activity_id') AND r.line_id=? AND r.status<>'cancelled')
      AND (COALESCE(json_extract(b.value,'$.batch_limit'),0)<=0 OR
        (SELECT COUNT(*) FROM registrants r WHERE r.activity_id=a.activity_id AND r.batch_id=json_extract(b.value,'$.activity_id') AND r.status<>'cancelled')<json_extract(b.value,'$.batch_limit'))`)
    .bind(`REG_${crypto.randomUUID()}`,actor.userId,member.name,member.phone,root.activity_id,root.network_id,c.activity_id,actor.userId)
    : db.prepare(`INSERT INTO registrants
    (row_id,line_id,activity_id,activity_name,name,phone,identity,amount,payment_status,start_time,description,image_url,status)
    SELECT ?,?,a.activity_id,a.name,?,?,'會員',a.price,CASE WHEN a.price>0 THEN '待付款' ELSE '免費' END,a.start_time,a.description,a.image_url,'active'
    FROM activities a JOIN activities p ON p.activity_id=a.series_id
    WHERE a.activity_id=? AND a.network_id=? AND p.network_id=a.network_id AND a.status='上架' AND p.status='上架'
    AND NOT EXISTS (SELECT 1 FROM registrants r WHERE r.activity_id=a.activity_id AND r.line_id=? AND r.status<>'cancelled')
    AND (COALESCE(a.batch_limit,0)<=0 OR (SELECT COUNT(*) FROM registrants r WHERE r.activity_id=a.activity_id AND r.status<>'cancelled')<a.batch_limit)`)
    .bind(`REG_${crypto.randomUUID()}`,actor.userId,member.name,member.phone,c.activity_id,root.network_id,actor.userId));
  const results=await db.batch(statements);
  const registrations=embedded.length
    ? (await db.prepare(`SELECT * FROM registrants WHERE line_id=? AND activity_id=? AND batch_id IN (${ids.map(()=>'?').join(',')}) AND status<>'cancelled'`).bind(actor.userId,root.activity_id,...ids).all()).results
    : (await db.prepare(`SELECT * FROM registrants WHERE line_id=? AND activity_id IN (${ids.map(()=>'?').join(',')}) AND status<>'cancelled'`).bind(actor.userId,...ids).all()).results;
  const missing=selected.filter(c=>!registrations.some(r=>(r.batch_id || r.activity_id)===c.activity_id));
  return {success:!missing.length,...(missing.length?{error:`${missing.map(c=>c.batch_name).join('、')} 已額滿或下架；其餘已成功的報名仍保留，重試不會重報。`}:{}),
    data:{activityId:root.activity_id,registrations:registrations.map(r=>module.registrantRow(r))},existed:results.every(r=>!r.meta.changes)};
}
