// A project records an administrative grant separately from member payments.
export async function grantPartnerProject(c, data) {
  c.keys(data, ['target_uid', 'waiveFee', 'independent', 'reason', 'confirmed', 'requestKey']);
  if (data.confirmed !== true || typeof data.waiveFee !== 'boolean' || typeof data.independent !== 'boolean' ||
      !(data.waiveFee || data.independent) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(data.requestKey || '')) {
    c.fail('請選擇並確認專案資格');
  }
  const reason = c.text(data.reason, 500);
  const {db, actor, uid} = c;
  const target = await c.member(db, data.target_uid);
  const details = JSON.stringify({target: target.line_id, waiveFee: data.waiveFee, independent: data.independent, reason, actor: uid});
  const eventId = 'project:' + data.requestKey;
  const event = () => c.first(db, 'SELECT event_json FROM partner_bonus_v2_status_events WHERE id=?', eventId);
  const prior = await event();
  if (prior) {
    if (prior.event_json !== details) c.fail('同一筆專案申請的內容已變更', 409);
    return {success:true, replayed:true};
  }
  const at = c.stamp(), nonce = crypto.randomUUID(), revision = (await c.clock(db)).revision;
  const orderId = 'PROJECT-' + data.requestKey;
  const ownEvent = 'EXISTS(SELECT 1 FROM partner_bonus_v2_status_events WHERE id=? AND event_json=?)';
  const statements = [c.clockClaim(db, revision, nonce, actor),
    db.prepare(`INSERT INTO partner_bonus_v2_status_events(id,order_id,status,created_at,event_json)
      SELECT ?,?,'project_approved',?,? FROM users WHERE line_id=? AND ${c.gate}
      AND (?=0 OR crm_project_fee_waived_at IS NULL) AND (?=0 OR crm_project_independent_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id=? OR new_line_id=?))
      AND (?=0 OR NOT EXISTS(SELECT 1 FROM orders WHERE buyer_id=? AND order_type='tenant_annual_fee' AND payment_status IN ('pending_payment','paid','project_waived')))`)
      .bind(eventId, data.waiveFee ? orderId : '', at, details, target.line_id, revision+1, nonce, +data.waiveFee, +data.independent, target.line_id,target.line_id,+data.waiveFee,target.line_id),
    db.prepare(`UPDATE users SET crm_project_independent_at=CASE WHEN ? THEN ? ELSE crm_project_independent_at END,
      crm_project_fee_waived_at=CASE WHEN ? THEN ? ELSE crm_project_fee_waived_at END WHERE line_id=? AND ${c.gate} AND ${ownEvent}`)
      .bind(+data.independent,at,+data.waiveFee,at,target.line_id,revision+1,nonce,eventId,details)];
  if (data.waiveFee) {
    statements.push(db.prepare(`INSERT INTO orders(order_id,order_type,buyer_id,buyer_name,network_id,product_name,payment_status,
      payment_provider,bonus_status,bonus_policy_type,created_at,updated_at) SELECT ?,'tenant_annual_fee',?,?,?,'專案年費',
      'project_waived','project','not_applicable','project_exception',?,? WHERE ${c.gate} AND ${ownEvent}`)
      .bind(orderId,target.line_id,target.name || '',target.network_id || 'admin',at,at,revision+1,nonce,eventId,details));
  }
  await db.batch(statements);
  if ((await event())?.event_json !== details) c.fail('資格已登錄、已有年費訂單或會員資料變更，請重新整理核對',409);
  return {success:true};
}
