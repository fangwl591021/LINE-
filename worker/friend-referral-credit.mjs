// Referral credit is intentionally separate from registration and the follow
// reward. Call completeFriendReferral only after verifying the LINE webhook.
const UID = /^U[0-9a-f]{32}$/i;
const PREFIX = 'AWD_member_inviter_bonus_';
const PENDING = 'friend_referral_pending';
const CHANNEL_ID = '1660923784';
const RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;
const TICKET_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 30 * 60 * 1000;
const clean = value => String(value || '').trim();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64 = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
const encoder = new TextEncoder();
async function signValue(domain, data, secret) {
  if (!secret || typeof secret !== 'string') throw new Error('邀請簽章尚未設定');
  const encoded = b64(encoder.encode(JSON.stringify(data)));
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig = await crypto.subtle.sign('HMAC',key,encoder.encode('friend-referral-v1:'+domain+':'+encoded));
  return encoded+'.'+b64(new Uint8Array(sig));
}
async function verifyValue(domain, value, secret, now) {
  if (!secret || typeof secret !== 'string') throw new Error('邀請簽章尚未設定');
  if (typeof value !== 'string' || value.length>2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const [encoded,sig] = value.split('.');
    const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    if (!await crypto.subtle.verify('HMAC',key,unb64(sig),encoder.encode('friend-referral-v1:'+domain+':'+encoded))) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64(encoded)));
    const max = domain === 'ticket' ? TICKET_TTL_MS : CHALLENGE_TTL_MS;
    if (!UID.test(data.ref || '') || !Number.isSafeInteger(data.iat) || !Number.isSafeInteger(data.exp) ||
        data.iat > now || data.exp <= now || data.exp-data.iat !== max || !/^[A-Za-z0-9_-]{20,30}$/.test(data.nonce || '')) return null;
    return data;
  } catch { return null; }
}
function nonce() { return b64(crypto.getRandomValues(new Uint8Array(16))); }

// Only call this with an identity from an already verified LINE webhook.
export async function issueFriendReferralForVerifiedUser(db, {userId,secret}, options={}) {
  const ref=clean(userId), now=(options.now || Date.now)();
  if (!UID.test(ref) || !Number.isSafeInteger(now) || now<=0) return {ticket:''};
  const sponsor=await sponsorIdentity(db,ref);
  if (!sponsor) return {ticket:''};
  // The same atomic guard used by reservations also rules out ambiguous payees.
  const valid=await db.prepare(`SELECT 1 AS ok WHERE ${sponsorGuard}`).bind(...sponsorGuardArgs(sponsor)).first();
  if (!valid?.ok) return {ticket:''};
  const net=clean(options.resolveNetwork ? await options.resolveNetwork(ref) : options.networkId || 'admin');
  if (!net || net.length>128) throw new Error('邀請網絡暫時無法確認');
  return {ticket:await signValue('ticket',{ref,net,iat:now,exp:now+TICKET_TTL_MS,nonce:nonce()},secret)};
}
export async function visitFriendReferral({ticket,secret}, options={}) {
  const now=(options.now || Date.now)(), data=await verifyValue('ticket',ticket,secret,now);
  if (!data) return {challenge:'',entryUrl:''};
  if (typeof data.net!=='string' || !data.net || data.net.length>128) return {challenge:'',entryUrl:''};
  const challenge=await signValue('challenge',{ref:data.ref,net:data.net,iat:now,exp:now+CHALLENGE_TTL_MS,nonce:nonce()},secret);
  const url=new URL('https://liff.line.me/1660923784-vViMTZ1y');
  url.searchParams.set('ref',data.ref);
  url.searchParams.set('net',data.net);
  url.searchParams.set('friend_referral_challenge',challenge);
  return {challenge,entryUrl:url.toString()};
}

// A single established old -> new mapping is supported. Recheck this entire
// guard inside each write so a concurrent identity change cannot redirect pay.
export const sponsorGuard = `EXISTS (SELECT 1 FROM users s WHERE s.line_id=?
      AND COALESCE(NULLIF(s.point_line_id,''),s.line_id)=?
      AND COALESCE(s.legacy_line_id,'') IN ('',?,?))
    AND NOT EXISTS (SELECT 1 FROM users s WHERE
      (s.line_id IN (SELECT value FROM json_each(?)) OR s.point_line_id IN (SELECT value FROM json_each(?))
       OR s.legacy_line_id IN (SELECT value FROM json_each(?)) OR s.row_id IN (SELECT value FROM json_each(?)))
      AND (COALESCE(s.line_id,'') NOT IN (SELECT value FROM json_each(?))
       OR COALESCE(s.point_line_id,'') NOT IN ('',?)
       OR COALESCE(s.legacy_line_id,'') NOT IN ('',?,?)
       OR (s.line_id=? AND s.line_id<>? AND COALESCE(s.legacy_line_id,'') NOT IN ('',?))))
    AND (SELECT COUNT(*) FROM user_identity_links l WHERE
      l.old_line_id IN (SELECT value FROM json_each(?)) OR l.new_line_id IN (SELECT value FROM json_each(?)))=?
    AND (?=0 OR EXISTS (SELECT 1 FROM user_identity_links l WHERE
      l.old_line_id=? AND l.new_line_id=? AND l.status='active'))
    AND (?=0 OR (SELECT COUNT(*) FROM users u WHERE u.line_id IN (SELECT value FROM json_each(?)))=1)`;
export function sponsorGuardArgs(s) {
  const ids = JSON.stringify(s.ids);
  return [s.ownerLine,s.wallet,s.old,s.wallet,ids,ids,ids,ids,ids,s.wallet,s.old,s.wallet,
    s.old,s.wallet,s.old,ids,ids,s.linked ? 1 : 0,s.linked ? 1 : 0,s.old,s.wallet,
    !s.linked && s.old!==s.wallet ? 1 : 0,ids];
}
export const receiverGuard = `NOT EXISTS (SELECT 1 FROM users u WHERE
      (u.line_id=? AND (COALESCE(u.point_line_id,'') NOT IN ('',?) OR COALESCE(u.legacy_line_id,'') NOT IN ('',?)
       OR (length(u.row_id)=33 AND upper(substr(u.row_id,1,1))='U' AND substr(u.row_id,2) NOT GLOB '*[^a-fA-F0-9]*' AND u.row_id<>?)))
      OR (u.line_id<>? AND (u.point_line_id=? OR u.legacy_line_id=? OR u.row_id=?)))
    AND NOT EXISTS (SELECT 1 FROM user_identity_links l WHERE (l.old_line_id=? OR l.new_line_id=?))`;
export function receiverGuardArgs(actor) { return Array(10).fill(actor); }
async function sponsorIdentity(db, ref) {
  const links = await db.prepare('SELECT old_line_id,new_line_id,status FROM user_identity_links WHERE old_line_id=? OR new_line_id=?').bind(ref,ref).all();
  if (links?.success === false || !Array.isArray(links?.results)) throw new Error('推薦人身分暫時無法確認');
  if (links.results.length > 1) return null;
  const link = links.results[0];
  if (link) {
    const old = clean(link.old_line_id), wallet = clean(link.new_line_id);
    if (link.status !== 'active' || !UID.test(old) || !UID.test(wallet) || old === wallet) return null;
    return { old, wallet, ownerLine:wallet, ids: [old,wallet], linked: true };
  }
  const rows=await db.prepare(`SELECT line_id,point_line_id,legacy_line_id FROM users
    WHERE line_id=? OR point_line_id=? LIMIT 2`).bind(ref,ref).all();
  if (rows?.success===false || !Array.isArray(rows?.results)) throw new Error('推薦人身分暫時無法確認');
  if (rows.results.length!==1) return null;
  const row=rows.results[0], old=clean(row.line_id), wallet=clean(row.point_line_id)||old, legacy=clean(row.legacy_line_id);
  if (!UID.test(old) || !UID.test(wallet) || (legacy && legacy!==old) || (wallet!==old && legacy!==old)) return null;
  return { old, wallet, ownerLine:old, ids: old===wallet ? [old] : [old,wallet], linked:false };
}

async function lineJson(fetcher, url, token) {
  const response = await fetcher(url, {
    headers: { Authorization: 'Bearer ' + token },
    redirect: 'manual', signal: AbortSignal.timeout(8000)
  });
  if ([400, 401, 403].includes(response.status)) return null;
  if (!response.ok) throw new Error('LINE 驗證暫時無法完成');
  return response.json();
}
async function verifyActor(token, options={}) {
  if (!clean(token)) return '';
  const fetcher=options.fetcher || fetch;
  const verify=await lineJson(fetcher,'https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(token),token);
  if (!verify || String(verify.client_id)!==String(options.channelId || CHANNEL_ID) || !(Number(verify.expires_in)>0)) return '';
  const profile=await lineJson(fetcher,'https://api.line.me/v2/profile',token);
  const actor=clean(profile?.userId);
  return UID.test(actor) ? actor : '';
}
export async function issueFriendReferralForToken(db,{token,secret},options={}) {
  const userId=await verifyActor(token,options);
  if (!userId) return {ticket:''};
  return issueFriendReferralForVerifiedUser(db,{userId,secret},options);
}

// A referral URL is attribution information, not proof of who shared it.
// Identity and friendship are obtained from LINE; no client flag is accepted.
export async function reserveFriendReferral(db, { token, challenge, secret }, options = {}) {
  const now=(options.now || Date.now)();
  const challengeData=await verifyValue('challenge',challenge,secret,now);
  if (!challengeData || typeof challengeData.net!=='string' || !challengeData.net || challengeData.net.length>128 || !clean(token)) return { reserved: false, reason: 'invalid_input' };
  const ref=challengeData.ref;
  const fetcher = options.fetcher || fetch;
  const actor = await verifyActor(token,options);
  if (!actor) return { reserved: false, reason: 'invalid_token' };
  if (actor === ref) return { reserved: false, reason: 'self' };
  const sponsor = await sponsorIdentity(db, ref);
  if (!sponsor || sponsor.ids.includes(actor)) return { reserved: false, reason: 'invalid_referrer' };
  const wallet = sponsor.wallet;
  // A redirect after following may beat the webhook. A verified retry of the
  // same challenge can acknowledge the already-durable reservation safely.
  const existing=await db.prepare(`SELECT status,response_json FROM point_awards WHERE award_id=?
    AND ${sponsorGuard} AND ${receiverGuard}`).bind(PREFIX+actor,...sponsorGuardArgs(sponsor),...receiverGuardArgs(actor)).first();
  let existingData;
  try { existingData=JSON.parse(existing?.response_json || 'null'); } catch { existingData=null; }
  if (['friend_referral_pending','member_ready','member_sending','member_review'].includes(existing?.status) &&
      existingData?.actor===actor && existingData.referrer===ref && existingData.networkId===challengeData.net &&
      JSON.stringify(existingData.sponsor)===JSON.stringify(sponsor) && Number.isSafeInteger(existingData.reservedAt) &&
      existingData.reservedAt <= now && (existing.status!==PENDING || existingData.reservedAt > now-RESERVATION_TTL_MS)) {
    return {reserved:true,reason:'already_reserved',referrerId:ref,networkId:challengeData.net};
  }
  const friendship = await lineJson(fetcher, 'https://api.line.me/friendship/v1/status', token);
  if (!friendship || typeof friendship.friendFlag !== 'boolean') throw new Error('LINE 好友狀態暫時無法確認');
  const follow = friendship.friendFlag ? await db.prepare(`SELECT * FROM friend_referral_events
    WHERE user_id=? AND is_unblocked=0 AND event_time_ms>? AND event_time_ms<? ORDER BY event_time_ms,event_id LIMIT 1`)
    .bind(actor,challengeData.iat,challengeData.exp).first() : null;

  const reservedAt = challengeData.iat;
  if (!Number.isSafeInteger(reservedAt) || reservedAt <= 0) throw new Error('時間無法確認');
  const metadata = JSON.stringify({ actor, referrer: ref, networkId:challengeData.net, wallet, sponsor, reservedAt, signedReferral:true });

  // Require an unambiguous identity mapping. Missing tables or failed reads
  // propagate rather than quietly relaxing the historical-reward checks.
  const result = await db.prepare(`INSERT OR IGNORE INTO point_awards
    (award_id,user_id,card_id,award_type,points,point_type,status,response_json)
    SELECT ?,?,?, 'member_inviter_bonus',50,'gift_money',?,?
    WHERE ${sponsorGuard}
    AND ${receiverGuard}
    AND NOT EXISTS (SELECT 1 FROM point_awards a WHERE
      (a.award_type='member_inviter_bonus' AND (a.card_id=? OR a.award_id=?)
       AND NOT (a.award_id=? AND a.status=? AND json_valid(a.response_json)
         AND json_type(a.response_json,'$.reservedAt')='integer'
         AND json_extract(a.response_json,'$.reservedAt')<=?)) OR
      (a.award_type='line_oa_follow' AND a.user_id=? AND (?=0 OR
       julianday(a.created_at)<julianday(CAST(? / 1000 AS INTEGER),'unixepoch'))))
    AND NOT EXISTS (SELECT 1 FROM line_oa_messages m WHERE m.user_id=? AND m.event_type IN ('follow','unfollow')
      AND (?=0 OR julianday(m.created_at) IS NULL OR julianday(m.created_at)<julianday(? / 1000.0,'unixepoch')))
    AND NOT EXISTS (SELECT 1 FROM friend_referral_events e WHERE e.user_id=? AND e.event_time_ms<=?)
    ON CONFLICT(award_id) DO UPDATE SET user_id=excluded.user_id, card_id=excluded.card_id,
      response_json=excluded.response_json,updated_at=CURRENT_TIMESTAMP
    WHERE point_awards.status=? AND json_valid(point_awards.response_json)
      AND json_type(point_awards.response_json,'$.reservedAt')='integer'
      AND json_extract(point_awards.response_json,'$.reservedAt')<=?`)
    .bind(PREFIX + actor, wallet, actor, PENDING, metadata,
      ...sponsorGuardArgs(sponsor),
      ...receiverGuardArgs(actor),
      actor, PREFIX + actor, PREFIX + actor, PENDING, reservedAt - RESERVATION_TTL_MS,
      actor, friendship.friendFlag ? 1 : 0, reservedAt,
      actor, friendship.friendFlag ? 1 : 0, follow?.event_time_ms || reservedAt,
      actor, reservedAt,
      PENDING, reservedAt - RESERVATION_TTL_MS).run();
  if (!result || result.success === false || !result.meta) throw new Error('推薦資格暫時無法儲存');
  if (Number(result.meta.changes || 0) === 1) {
    if (follow) await completeFriendReferral(db,{type:'follow',source:{type:'user',userId:actor},
      webhookEventId:follow.event_id,timestamp:follow.event_time_ms,follow:{isUnblocked:false}});
    return {reserved:true,reason:'reserved',referrerId:ref,networkId:challengeData.net};
  }
  // A client timeout can occur after a successful commit. Only acknowledge
  // the same, still-current referral; never disclose a competing referrer.
  const after=await db.prepare(`SELECT status,response_json FROM point_awards WHERE award_id=?
    AND ${sponsorGuard} AND ${receiverGuard}`).bind(PREFIX+actor,...sponsorGuardArgs(sponsor),...receiverGuardArgs(actor)).first();
  let afterData;
  try { afterData=JSON.parse(after?.response_json || 'null'); } catch { afterData=null; }
  if (after?.status === PENDING && afterData?.actor === actor && afterData.referrer === ref &&
      afterData.networkId===challengeData.net && JSON.stringify(afterData.sponsor) === JSON.stringify(sponsor) &&
      Number.isSafeInteger(afterData.reservedAt) && afterData.reservedAt <= now &&
      afterData.reservedAt > now - RESERVATION_TTL_MS) {
    return {reserved:true,reason:'already_reserved',referrerId:ref,networkId:challengeData.net};
  }
  return {reserved:false,reason:'ineligible_or_recorded'};
}

// The caller must verify x-line-signature before passing the unmodified event.
// Return only after the CAS is durable, so a failure can be retried safely.
export async function completeFriendReferral(db, event) {
  const actor = clean(event?.source?.userId);
  const eventId = clean(event?.webhookEventId);
  const at = Number(event?.timestamp);
  if (event?.type !== 'follow' || event?.source?.type !== 'user' || !UID.test(actor) ||
      event?.follow?.isUnblocked !== false || !eventId || !Number.isSafeInteger(at) || at <= 0) {
    return { completed: false, reason: 'ineligible_event' };
  }
  const saved=await db.prepare(`INSERT OR IGNORE INTO friend_referral_events(event_id,user_id,event_time_ms,is_unblocked)
    VALUES(?,?,?,0)`).bind(eventId,actor,at).run();
  if (!saved || saved.success===false || !saved.meta) throw new Error('好友事件暫時無法儲存');
  const durable=await db.prepare('SELECT user_id,event_time_ms,is_unblocked FROM friend_referral_events WHERE event_id=?').bind(eventId).first();
  if (!durable || durable.user_id!==actor || durable.event_time_ms!==at || durable.is_unblocked!==0) throw new Error('好友事件識別衝突');
  const id = PREFIX + actor;
  const row = await db.prepare('SELECT * FROM point_awards WHERE award_id=?').bind(id).first();
  if (!row || row.status !== PENDING) return { completed: false, reason: 'not_pending' };
  let data;
  try { data = JSON.parse(row.response_json); } catch { throw new Error('推薦資料無法確認'); }
  const ref = clean(data?.referrer), wallet = clean(data?.wallet), sponsor = data?.sponsor;
  if (data?.actor !== actor || !UID.test(ref) || !UID.test(wallet) || actor === ref || actor === wallet ||
      row.user_id !== wallet || row.card_id !== actor || row.award_type !== 'member_inviter_bonus' ||
      row.points !== 50 || row.point_type !== 'gift_money' || !Number.isSafeInteger(data.reservedAt) || at <= data.reservedAt ||
      at >= data.reservedAt + RESERVATION_TTL_MS ||
      !sponsor || sponsor.wallet !== wallet || !UID.test(sponsor.old) || !Array.isArray(sponsor.ids) ||
      !UID.test(sponsor.ownerLine) || sponsor.ownerLine !== (sponsor.linked === true ? wallet : sponsor.old) ||
      sponsor.ids.length !== (sponsor.old===wallet ? 1 : 2) ||
      JSON.stringify(sponsor.ids) !== JSON.stringify(sponsor.old===wallet ? [wallet] : [sponsor.old,wallet]) ||
      !sponsor.ids.includes(ref) || sponsor.ids.includes(actor) ||
      (sponsor.linked !== true && sponsor.linked !== false) || (sponsor.linked===true && sponsor.old===wallet)) {
    return { completed: false, reason: 'mismatch_or_out_of_order' };
  }
  const confirmed = JSON.stringify({ ...data, followEventId: eventId, followAt: at });
  const result = await db.prepare(`UPDATE point_awards SET status='member_ready',response_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE award_id=? AND status=? AND response_json=?
    AND ${sponsorGuard}
    AND ${receiverGuard}
    AND NOT EXISTS (SELECT 1 FROM point_awards a WHERE a.award_type='member_inviter_bonus'
      AND a.award_id<>? AND a.card_id=?)
    AND NOT EXISTS (SELECT 1 FROM point_awards a WHERE a.award_type='line_oa_follow' AND a.user_id=?
      AND CASE WHEN json_valid(a.response_json) THEN
        (json_extract(a.response_json,'$.createdAt') IS NULL OR json_extract(a.response_json,'$.createdAt')<>?) ELSE 1 END)
    AND NOT EXISTS (SELECT 1 FROM friend_referral_events e WHERE e.user_id=? AND e.event_id<>? AND e.event_time_ms<=?)
    AND NOT EXISTS (SELECT 1 FROM line_oa_messages m WHERE m.user_id=? AND m.event_type IN ('follow','unfollow')
      AND (julianday(m.created_at) IS NULL OR julianday(m.created_at) < julianday(? / 1000.0, 'unixepoch')))`)
    .bind(confirmed, id, PENDING, row.response_json, ...sponsorGuardArgs(sponsor),
      ...receiverGuardArgs(actor), id, actor, actor, new Date(at).toISOString(), actor, eventId, at, actor, at).run();
  if (!result || result.success === false || !result.meta) throw new Error('推薦資格暫時無法確認');
  return { completed: Number(result?.meta?.changes || 0) === 1,
    reason: Number(result?.meta?.changes || 0) === 1 ? 'ready' : 'identity_or_history_changed' };
}

// Process persisted events again after transient failures or a delayed follow
// award write. Calling this repeatedly cannot replay a sent/member_ready row.
export async function reconcileFriendReferralInbox(db, limit=100) {
  const n=Math.max(1,Math.min(500,Number(limit)||100));
  const rows=await db.prepare(`SELECT e.* FROM friend_referral_events e JOIN point_awards a
    ON a.award_id='AWD_member_inviter_bonus_'||e.user_id AND a.status=?
    WHERE e.is_unblocked=0 AND json_valid(a.response_json)
      AND e.event_time_ms>json_extract(a.response_json,'$.reservedAt')
      AND e.event_time_ms<json_extract(a.response_json,'$.reservedAt')+86400000
    ORDER BY CASE WHEN e.last_attempt_at IS NULL THEN 0 ELSE 1 END,
      e.last_attempt_at,e.event_time_ms,e.event_id LIMIT ?`).bind(PENDING,n).all();
  if (rows?.success===false || !Array.isArray(rows?.results)) throw new Error('好友事件暫時無法讀取');
  let completed=0, errors=0;
  for (const row of rows.results) {
    try {
      const result=await completeFriendReferral(db,{type:'follow',source:{type:'user',userId:row.user_id},
        webhookEventId:row.event_id,timestamp:row.event_time_ms,follow:{isUnblocked:false}});
      if (result.completed) completed++;
    } catch { errors++; }
    const marked=await db.prepare('UPDATE friend_referral_events SET last_attempt_at=CURRENT_TIMESTAMP WHERE event_id=?').bind(row.event_id).run();
    if (!marked || marked.success===false || !marked.meta) throw new Error('好友事件重試狀態無法儲存');
  }
  return {completed,scanned:rows.results.length,errors};
}
