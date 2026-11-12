import { sponsorGuard, sponsorGuardArgs, receiverGuard, receiverGuardArgs } from './friend-referral-credit.mjs';

// Create entitlements in the same D1 transaction as the first completed profile.
const memberUid = /^U[0-9a-f]{32}$/i;
// New registrations reserve only the profile bonus. Previously reserved
// referral bonuses remain payable at their original amounts.
const profileBonus = ['member_profile_bonus', 288, '首次完成會員資料'];
const deliveryRules = {
  member_profile_bonus: { amounts: [50, 288], label: '首次完成會員資料' },
  member_invitee_bonus: { amounts: [300], label: '受邀加入會員' },
  member_inviter_bonus: { amounts: [50], label: '分享好友加入' }
};
// Constants only: filter before LIMIT so malformed or unknown rows cannot
// starve valid historical and current rewards behind them.
const payable = Object.entries(deliveryRules).map(([type, rule]) =>
  `(award_type='${type}' AND points IN (${rule.amounts.join(',')}))`).join(' OR ');

// A new friend referral carries the verified identity and event snapshot that
// created it. Historical registration referrals have no signedReferral flag.
function friendReferralSnapshot(row, data) {
  const s = data?.sponsor, actor = data?.actor, wallet = data?.wallet;
  if (!memberUid.test(actor || '') || !memberUid.test(wallet || '') ||
      !memberUid.test(data?.referrer || '') || !memberUid.test(s?.old || '') ||
      !Array.isArray(s?.ids) || !memberUid.test(s?.ownerLine || '') || s.wallet !== wallet || !s.ids.includes(data.referrer) ||
      s.ids.includes(actor) || row.user_id !== wallet || row.card_id !== actor ||
      row.award_id !== 'AWD_member_inviter_bonus_' + actor ||
      typeof s.linked !== 'boolean' ||
      s.ownerLine !== (s.linked ? wallet : s.old) ||
      JSON.stringify(s.ids) !== JSON.stringify(s.old === wallet ? [wallet] : [s.old,wallet]) ||
      (s.linked && s.old === wallet) ||
      !Number.isSafeInteger(data.reservedAt) || !Number.isSafeInteger(data.followAt) ||
      data.reservedAt <= 0 || data.followAt <= data.reservedAt ||
      data.followAt >= data.reservedAt + 86400000 ||
      typeof data.followEventId !== 'string' || !data.followEventId.trim()) return null;
  return { actor, wallet, sponsor: s, eventId: data.followEventId, followAt: data.followAt };
}

function friendReferralClaimGuard(row, snapshot) {
  const { actor, wallet, sponsor, eventId, followAt } = snapshot;
  return {sql:`award_id=? AND user_id=? AND card_id=?
      AND award_type='member_inviter_bonus' AND points=50 AND point_type='gift_money' AND response_json=?
      AND ${sponsorGuard}
      AND ${receiverGuard}
      AND NOT EXISTS (SELECT 1 FROM point_awards a WHERE a.award_type='member_inviter_bonus' AND a.award_id<>? AND a.card_id=?)
      AND EXISTS (SELECT 1 FROM friend_referral_events e WHERE e.event_id=? AND e.user_id=? AND e.event_time_ms=? AND e.is_unblocked=0)`,
    args:[row.award_id, wallet, actor, row.response_json, ...sponsorGuardArgs(sponsor),
      ...receiverGuardArgs(actor), row.award_id, actor, eventId, actor, followAt]};
}

async function claimFriendReferral(db, row, snapshot) {
  const guard=friendReferralClaimGuard(row,snapshot);
  return db.prepare(`UPDATE point_awards SET status='member_sending',updated_at=CURRENT_TIMESTAMP
    WHERE status='member_ready' AND ${guard.sql}`).bind(...guard.args).run();
}

async function verifyFriendReferralPointIdentity(db, row, snapshot) {
  const guard=friendReferralClaimGuard(row,snapshot);
  const verified=await db.prepare(`SELECT 1 AS verified FROM point_awards WHERE status='member_sending' AND ${guard.sql}`)
    .bind(...guard.args).first();
  if (verified?.verified !== 1) throw new Error('推薦獎勵點數身分無法確認');
  return snapshot.wallet;
}

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
  const [type, amount] = profileBonus;
  const reservation = db.prepare(`WITH member AS (
      SELECT ? AS uid, COALESCE(NULLIF(u.point_line_id,''), ?) AS wallet
      FROM (SELECT 1) LEFT JOIN users u ON u.line_id=?
    ), eligible AS (
      SELECT m.* FROM member m
      WHERE NOT EXISTS (
        SELECT 1 FROM users old WHERE (old.line_id IN (m.uid,m.wallet) OR old.point_line_id=m.wallet OR old.legacy_line_id=m.uid)
          AND trim(COALESCE(old.name,'')) NOT IN ('','未命名') AND trim(COALESCE(old.phone,''))<>''
      )
    )
    INSERT OR IGNORE INTO point_awards (award_id,user_id,card_id,award_type,points,point_type,status,response_json)
    SELECT ? || wallet, wallet, wallet, ?, ?, 'gift_money', 'member_ready','{}'
    FROM eligible WHERE length(wallet)=33 AND substr(wallet,1,1)='U' AND substr(wallet,2) NOT GLOB '*[^a-fA-F0-9]*'`)
      .bind(user.line_id,user.line_id,user.line_id,'AWD_' + type + '_',type,amount);
  return (await db.batch([reservation, statement])).at(-1);
}

// Only the worker which durably claims a row can send it. A lost response is
// left for ledger reconciliation, never submitted a second time by the cron.
export async function deliverMemberCredits(db, credit) {
  const rows = await db.prepare(`SELECT award_id, user_id, card_id, award_type, points, response_json FROM point_awards
    WHERE status='member_ready' AND point_type='gift_money' AND (${payable})
      AND length(user_id)=33 AND upper(substr(user_id,1,1))='U'
      AND substr(user_id,2) NOT GLOB '*[^a-fA-F0-9]*'
    ORDER BY created_at,award_id LIMIT 9`).all();
  for (const row of rows.results) {
    const rule = deliveryRules[row.award_type];
    if (!rule || !rule.amounts.includes(row.points) || !memberUid.test(row.user_id)) continue;
    let data;
    try { data = JSON.parse(row.response_json); } catch { data = null; }
    let claim, strictIdentity;
    if (row.award_type === 'member_inviter_bonus' && data?.signedReferral === true) {
      const snapshot = friendReferralSnapshot(row, data);
      claim = snapshot ? await claimFriendReferral(db, row, snapshot) : {meta:{changes:0}};
      if (claim.meta.changes !== 1) {
        // Quarantine unchanged rows so invalid referrals cannot starve the queue.
        await db.prepare("UPDATE point_awards SET status='member_review',updated_at=CURRENT_TIMESTAMP WHERE award_id=? AND status='member_ready' AND response_json=?")
          .bind(row.award_id,row.response_json).run();
        continue;
      }
      strictIdentity = () => verifyFriendReferralPointIdentity(db, row, snapshot);
    } else {
      claim = await db.prepare("UPDATE point_awards SET status='member_sending',updated_at=CURRENT_TIMESTAMP WHERE award_id=? AND status='member_ready'")
        .bind(row.award_id).run();
    }
    if (claim.meta.changes !== 1) continue;
    let receipt;
    try {
      const result = await credit({ userId: row.user_id, pointType:'gift_money', points:row.points,
        eventName:rule.label, eventContent:rule.label + ' ' + row.award_id, shop_remark:row.award_id, requireConfirmedResult:true },
        strictIdentity ? {strictIdentity} : undefined);
      const id = Number(result?.data?.data?.insert_id);
      if (result?.success === true && Number.isSafeInteger(id) && id > 0) receipt = id;
    } catch { /* uncertain provider writes cannot be replayed */ }
    await db.prepare("UPDATE point_awards SET status=?, response_json=?,updated_at=CURRENT_TIMESTAMP WHERE award_id=? AND status='member_sending'")
      .bind(receipt ? 'sent' : 'member_review', JSON.stringify({receipt:receipt || null}), row.award_id).run();
  }
}
