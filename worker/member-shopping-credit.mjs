// Create entitlements in the same D1 transaction as the first completed profile.
const memberUid = /^U[0-9a-f]{32}$/i;
const kinds = { profile: ['member_profile_bonus', 50, '首次完成會員資料'], invitee: ['member_invitee_bonus', 300, '受邀加入會員'], inviter: ['member_inviter_bonus', 50, '分享好友加入'] };
const refs = Object.values(kinds).map(([kind]) => "'" + kind + "'").join(',');

export async function verifyRegistrationActor(token, expected) {
  if (!token || !memberUid.test(expected)) return false;
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000)
  });
  return res.ok && (await res.json()).userId === expected;
}

export async function writeRegistrationWithCredits(db, user, statement) {
  if (!memberUid.test(user.line_id) || !user.name || user.name === '未命名' ||
      !/^\+?\d{8,15}$/.test(String(user.phone || '').replace(/[\s()（）-]/g, ''))) {
    throw new Error('請填寫姓名及有效手機號碼');
  }
  const reservations = Object.entries(kinds).map(([role, [type, amount]]) => {
    const invited = role !== 'profile';
    return db.prepare(`WITH member AS (
      SELECT ? AS uid, COALESCE(NULLIF(u.point_line_id,''), ?) AS wallet,
        COALESCE(NULLIF(u.referrer_id,''), ?) AS sponsor
      FROM (SELECT 1) LEFT JOIN users u ON u.line_id=?
    ), eligible AS (
      SELECT m.*, COALESCE(NULLIF(s.point_line_id,''),s.line_id) AS sponsor_wallet
      FROM member m LEFT JOIN users s ON s.line_id=m.sponsor
      WHERE NOT EXISTS (
        SELECT 1 FROM users old WHERE (old.line_id IN (m.uid,m.wallet) OR old.point_line_id=m.wallet OR old.legacy_line_id=m.uid)
          AND trim(COALESCE(old.name,'')) NOT IN ('','未命名') AND trim(COALESCE(old.phone,''))<>''
      )
    )
    INSERT OR IGNORE INTO point_awards (award_id,user_id,card_id,award_type,points,point_type,status,response_json)
    SELECT ? || wallet, ${role === 'inviter' ? 'sponsor_wallet' : 'wallet'}, wallet, ?, ?, 'gift_money', 'member_ready','{}'
    FROM eligible WHERE length(wallet)=33 AND substr(wallet,1,1)='U' AND substr(wallet,2) NOT GLOB '*[^a-fA-F0-9]*'
    ${invited ? "AND sponsor<>uid AND sponsor_wallet<>wallet AND length(sponsor_wallet)=33 AND substr(sponsor_wallet,1,1)='U' AND substr(sponsor_wallet,2) NOT GLOB '*[^a-fA-F0-9]*'" : ''}`)
      .bind(user.line_id,user.line_id,user.referrer_id || '',user.line_id,'AWD_' + type + '_',type,amount);
  });
  return (await db.batch([...reservations, statement])).at(-1);
}

// Only the worker which durably claims a row can send it. A lost response is
// left for ledger reconciliation, never submitted a second time by the cron.
export async function deliverMemberCredits(db, credit) {
  const rows = await db.prepare(`SELECT award_id, user_id, award_type, points FROM point_awards
    WHERE status='member_ready' AND award_type IN (${refs}) ORDER BY created_at,award_id LIMIT 9`).all();
  for (const row of rows.results) {
    const rule = Object.values(kinds).find(([kind]) => kind === row.award_type);
    if (!rule || rule[1] !== row.points || !memberUid.test(row.user_id)) continue;
    const claim = await db.prepare("UPDATE point_awards SET status='member_sending',updated_at=CURRENT_TIMESTAMP WHERE award_id=? AND status='member_ready'").bind(row.award_id).run();
    if (claim.meta.changes !== 1) continue;
    let receipt;
    try {
      const result = await credit({ userId: row.user_id, pointType:'gift_money', points:row.points,
        eventName:rule[2], eventContent:rule[2] + ' ' + row.award_id, shop_remark:row.award_id, requireConfirmedResult:true });
      const id = Number(result?.data?.data?.insert_id);
      if (result?.success === true && Number.isSafeInteger(id) && id > 0) receipt = id;
    } catch { /* uncertain provider writes cannot be replayed */ }
    await db.prepare("UPDATE point_awards SET status=?, response_json=?,updated_at=CURRENT_TIMESTAMP WHERE award_id=? AND status='member_sending'")
      .bind(receipt ? 'sent' : 'member_review', JSON.stringify({receipt:receipt || null}), row.award_id).run();
  }
}
