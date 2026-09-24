// Durable, opt-in LINE reminders. Never includes private message contents in push payloads.
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
const session = env => env.ACTMASTER_DB.withSession ? env.ACTMASTER_DB.withSession('first-primary') : env.ACTMASTER_DB;
const retryKey = id => `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
export async function notificationPreference(db, memberId) {
  const row = await stmt(db, 'SELECT enabled FROM member_chat_notifications WHERE member_id=?', memberId).first();
  return row?.enabled === 1;
}
export async function saveNotificationPreference(db, actor, enabled) {
  await stmt(db, `INSERT INTO member_chat_notifications(member_id,enabled,line_id) VALUES(?,?,?)
    ON CONFLICT(member_id) DO UPDATE SET enabled=excluded.enabled,line_id=excluded.line_id,updated_at=CURRENT_TIMESTAMP`, actor.memberId, Number(enabled), actor.uid).run();
}
const ELIGIBLE = `SELECT j.id FROM member_chat_notification_jobs j
  JOIN member_chat_notifications p ON p.member_id=j.recipient_id AND p.enabled=1 AND p.line_id=j.line_id
  JOIN member_chat_threads t ON t.id=j.thread_id AND j.recipient_id IN (t.member_a,t.member_b)
  WHERE j.id=?1 AND j.status='pending' AND j.lease_until=?2
  AND NOT EXISTS(SELECT 1 FROM member_chat_blocks b WHERE
    (b.member_id=t.member_a AND b.blocked_id=t.member_b) OR (b.member_id=t.member_b AND b.blocked_id=t.member_a))
  AND EXISTS(SELECT 1 FROM member_chat_messages m WHERE m.thread_id=j.thread_id
    AND m.sender_id<>j.recipient_id AND m.seq BETWEEN j.first_seq AND j.last_seq AND m.read_at IS NULL)`;

export async function deliverChatNotifications(env, resolveRecipient, fetcher = fetch) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return;
  const db = session(env), now = Math.floor(Date.now()/1000);
  const liffId = String(env.POINT_LIFF_ID || env.LIFF_ID || '1660923784-vViMTZ1y');
  if (!/^\d+-[A-Za-z0-9]+$/.test(liffId)) return;
  // A failed/expired job is never retried outside LINE's 24-hour idempotency window.
  await stmt(db, "UPDATE member_chat_notification_jobs SET status='failed' WHERE status='pending' AND (attempts>=5 AND lease_until<=? OR created_at<?)", now, now-23*3600).run();
  await stmt(db, "DELETE FROM member_chat_notification_jobs WHERE id IN (SELECT id FROM member_chat_notification_jobs WHERE status<>'pending' AND created_at<? LIMIT 500)", now-7*86400).run();
  const result = await stmt(db, "SELECT * FROM member_chat_notification_jobs WHERE status='pending' AND due_at<=? AND lease_until<=? AND attempts<5 ORDER BY due_at LIMIT 10", now, now).all();
  if (result.success === false) throw Error('CHAT_NOTIFICATION_READ_FAILED');
  await Promise.all((result.results || []).map(async job => {
    const lease = now+120;
    const url = `https://liff.line.me/${liffId}?memberChat=${encodeURIComponent(job.thread_id)}`;
    const claim = await stmt(db, `UPDATE member_chat_notification_jobs SET lease_until=?,attempts=attempts+1,target_url=COALESCE(target_url,?)
      WHERE id=? AND status='pending' AND due_at<=? AND lease_until<=? AND attempts<5`, lease, url, job.id, now, now).run();
    if (claim.meta?.changes !== 1) return;
    const finish = status => stmt(db, 'UPDATE member_chat_notification_jobs SET status=?,lease_until=0 WHERE id=? AND lease_until=? AND status=\'pending\'', status, job.id, lease).run();
    try {
      // Check both before and after identity lookup, including a concurrent read/mute/block.
      if (!await stmt(db, ELIGIBLE, job.id, lease).first() || !await resolveRecipient(db, job.line_id, job.recipient_id, env)) {
        await finish('cancelled'); return;
      }
      if (!await stmt(db, ELIGIBLE, job.id, lease).first()) { await finish('cancelled'); return; }
      const response = await fetcher('https://api.line.me/v2/bot/message/push', {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'X-Line-Retry-Key': retryKey(job.id) },
        body: JSON.stringify({ to: job.line_id, notificationDisabled: false, messages: [{ type: 'template', altText: '點數通：您有新的會員私訊',
          template: { type: 'buttons', text: '您有新的會員私訊。請回到點數通查看。', actions: [{ type: 'uri', label: '查看私訊', uri: job.target_url || url }] } }] })
      });
      await response.body?.cancel();
      if (response.ok || (response.status === 409 && response.headers.get('x-line-accepted-request-id'))) { await finish('sent'); return; }
      if (response.status < 500) { await finish('failed'); console.warn('member_chat_notification_rejected', response.status); return; }
      throw Error('LINE_TEMPORARY_FAILURE');
    } catch {
      // A timeout might have succeeded at LINE. Keep destination, payload and retry key fixed.
      await stmt(db, `UPDATE member_chat_notification_jobs SET lease_until=0,due_at=? WHERE id=? AND lease_until=? AND status='pending'`, now+60*2**job.attempts, job.id, lease).run();
      console.warn('member_chat_notification_retry');
    }
  }));
}
