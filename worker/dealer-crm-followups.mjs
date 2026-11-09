const fail = error => ({success: false, error});
const fields = {owner_name: 100, outcome: 1000, next_action: 250, due_date: 10};

export async function dealerCrmFollowups(action, payload, actor, db) {
  if (!actor?.token || actor.role !== 'admin') return fail('請以管理員身分登入');
  const member = await db.prepare('SELECT line_id FROM users WHERE line_id=? OR row_id=? LIMIT 1')
    .bind(payload.targetUserId || '', payload.targetUserId || '').first();
  if (!member) return fail('查無會員');
  const uid = member.line_id;
  if (action === 'adminAppendDealerFollowup') {
    const record = {};
    for (const [name, limit] of Object.entries(fields)) {
      const value = payload[name]?.trim?.();
      if (!value || value.length > limit) return fail('請確認跟進內容及欄位長度');
      record[name] = value;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.due_date) || !Number.isFinite(Date.parse(record.due_date)) ||
        new Date(record.due_date).toISOString().slice(0,10) !== record.due_date) return fail('跟進日期無效');
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(payload.requestId || '')) return fail('請重新開啟跟進表單');
    await db.prepare(`INSERT INTO dealer_crm_followups(member_uid,request_id,actor_uid,owner_name,outcome,next_action,due_date)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(member_uid,request_id) DO NOTHING`)
      .bind(uid, payload.requestId, actor.userId, record.owner_name, record.outcome, record.next_action, record.due_date).run();
    const saved = await db.prepare('SELECT * FROM dealer_crm_followups WHERE member_uid=? AND request_id=?').bind(uid,payload.requestId).first();
    if (!saved || saved.actor_uid !== actor.userId || Object.keys(fields).some(key => saved[key] !== record[key])) return fail('這筆跟進已送出，請重新載入');
  }
  const history = await db.prepare(`SELECT owner_name,outcome,next_action,due_date,created_at FROM dealer_crm_followups
    WHERE member_uid=? ORDER BY created_at DESC,rowid DESC LIMIT 100`).bind(uid).all();
  const signed = await db.prepare(`SELECT json_extract(snapshot_json,'$.fields.performance_owner_name') AS name,
    json_extract(snapshot_json,'$.fields.performance_owner_member_number') AS number FROM partner_applications
    WHERE owner_uid=? ORDER BY signed_at DESC,id DESC LIMIT 1`).bind(uid).first();
  return {success: true, data: {history: history.results, signed}};
}
