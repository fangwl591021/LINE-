// Display-only LINE pictures for the already authorized member-directory page.
// No account/card/OA writes and no client-provided profile URLs.
const UID = /^U[0-9a-f]{32}$/i;
const PREFIX = 'MEMBER_CHAT_LINE_AVATAR_';
const CACHE_SECONDS = 86400;
const REFRESH_MS = 6 * 60 * 60 * 1000;
const text = value => String(value ?? '').trim();

export function lineAvatarUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return '';
    // LINE Login and Messaging API profile images use these LINE CDN families.
    if (!['line-scdn.net', 'line-apps.com'].some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) return '';
    return url.href;
  } catch { return ''; }
}

// null means malformed, while an empty string is a verified profile without a picture.
function profilePicture(value) {
  if (value === undefined || value === '') return '';
  return lineAvatarUrl(value) || null;
}
async function cachedPicture(kv, uid, now) {
  if (!kv?.get) return null;
  try {
    const value = await kv.get(PREFIX + uid, 'json');
    if (!value || !Number.isFinite(value.updatedAt) || value.updatedAt > now + 60000 || now - value.updatedAt >= CACHE_SECONDS * 1000) return null;
    if (typeof value.pictureUrl !== 'string' || (value.pictureUrl && !lineAvatarUrl(value.pictureUrl))) return null;
    return { pictureUrl: value.pictureUrl ? lineAvatarUrl(value.pictureUrl) : '', updatedAt: value.updatedAt };
  } catch { return null; }
}
async function cachePicture(kv, uid, pictureUrl, previous, now) {
  if (!kv?.put || !UID.test(uid) || pictureUrl === null) return;
  if (previous?.pictureUrl === pictureUrl && now - previous.updatedAt < REFRESH_MS) return;
  try { await kv.put(PREFIX + uid, JSON.stringify({ pictureUrl, updatedAt: now }), { expirationTtl: CACHE_SECONDS }); }
  catch { /* A display cache never blocks membership or discovery. */ }
}
async function boundedProfile(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('profile body');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw Error('profile size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('profile format');
  return value;
}

export async function hydrateMemberAvatars(db, env, actor, members, fetcher = fetch, now = Date.now()) {
  const kv = env.ACTMASTER_KV, pictures = new Map();
  const ids = [...new Set(members.slice(0, 30).map(row => text(row.avatar_line_id)).filter(uid => UID.test(uid)))];
  const ownId = text(actor.user?.line_id), ownPicture = profilePicture(actor.pictureUrl);
  if (UID.test(ownId) && ownPicture !== null && kv) {
    const previous = await cachedPicture(kv, ownId, now);
    await cachePicture(kv, ownId, ownPicture, previous, now);
  }
  await Promise.all(ids.map(async uid => {
    const cached = await cachedPicture(kv, uid, now);
    if (cached) pictures.set(uid, cached.pictureUrl); // A known empty picture must not revive an older OA image.
  }));
  const missing = ids.filter(uid => !pictures.has(uid));
  if (missing.length) {
    try {
      const result = await db.prepare(`SELECT user_id,picture_url FROM line_oa_threads
        WHERE source_type='user' AND user_id IN (SELECT value FROM json_each(?))
        ORDER BY updated_at DESC,thread_id DESC`).bind(JSON.stringify(missing)).all();
      if (result.success !== false && Array.isArray(result.results)) {
        for (const row of result.results) {
          const uid = text(row.user_id), pictureUrl = lineAvatarUrl(row.picture_url);
          if (missing.includes(uid) && !pictures.has(uid) && pictureUrl) pictures.set(uid, pictureUrl);
        }
      }
    } catch { /* Older environments may have no OA monitoring table. */ }
    await Promise.all(missing.filter(uid => pictures.has(uid)).map(uid => cachePicture(kv, uid, pictures.get(uid), null, now)));
  }
  const token = text(env.LINE_CHANNEL_ACCESS_TOKEN), pending = missing.filter(uid => !pictures.has(uid));
  if (token) {
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(6, pending.length) }, async () => {
      while (index < pending.length) {
        const uid = pending[index++];
        try {
          const response = await fetcher(`https://api.line.me/v2/bot/profile/${uid}`, {
            headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(1500)
          });
          if (!response.ok) { await response.body?.cancel(); continue; }
          const profile = await boundedProfile(response);
          if (profile.userId !== uid) continue;
          const pictureUrl = profilePicture(profile.pictureUrl);
          if (pictureUrl === null) continue;
          pictures.set(uid, pictureUrl);
          await cachePicture(kv, uid, pictureUrl, null, now);
        } catch { /* Missing friendship, expiry and outages retain the initials fallback. */ }
      }
    }));
  }
  return pictures;
}
