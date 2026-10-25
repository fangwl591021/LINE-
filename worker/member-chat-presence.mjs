// Recent activity in this app only. KV is approximate/eventually consistent, not LINE presence.
export const PRESENCE_TTL_SECONDS = 180;
export const PRESENCE_HEARTBEAT_SECONDS = 60;
const PREFIX = 'MEMBER_CHAT_ISLAND_PRESENCE_V1:';
const MAX_MEMBERS = 100;
const CLOCK_SKEW_MS = 5000;
const unknown = () => ({ online: false, onlineKnown: false });
async function presenceKey(memberId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(memberId)));
  return PREFIX + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function validRecord(value, now) {
  return value && typeof value === 'object' && !Array.isArray(value) && value.v === 1
    && Number.isSafeInteger(value.seenAt) && value.seenAt >= 0 && value.seenAt <= now + CLOCK_SKEW_MS;
}
function status(value, now) {
  if (value === null) return { online: false, onlineKnown: true };
  if (!validRecord(value, now)) return unknown();
  return { online: now - value.seenAt < PRESENCE_TTL_SECONDS * 1000, onlineKnown: true };
}
export async function readIslandPresence(env, members, now = Date.now()) {
  const peers = [...new Set(members.map(row => String(row.peer ?? '')).filter(Boolean))];
  const states = new Map(peers.map(peer => [peer, unknown()]));
  const kv = env?.ACTMASTER_KV;
  if (!kv?.get || peers.length > MAX_MEMBERS) return { states, available: false };
  if (!peers.length) return { states, available: true };
  try {
    const keys = await Promise.all(peers.map(presenceKey));
    let values;
    try {
      // The current Workers binding supports up to 100 JSON keys in a single get().
      values = await kv.get(keys, { type: 'json', cacheTtl: 30 });
    } catch { /* Older bindings/test doubles use bounded single-key reads below. */ }
    if (values instanceof Map) {
      for (let index = 0; index < peers.length; index++) states.set(peers[index], status(values.has(keys[index]) ? values.get(keys[index]) : null, now));
    } else {
      let index = 0;
      await Promise.all(Array.from({ length: Math.min(6, peers.length) }, async () => {
        while (index < peers.length) {
          const at = index++;
          try { states.set(peers[at], status(await kv.get(keys[at], { type: 'json', cacheTtl: 30 }), now)); }
          catch { states.set(peers[at], unknown()); }
        }
      }));
    }
    return { states, available: [...states.values()].every(value => value.onlineKnown) };
  } catch { return { states, available: false }; }
}
export async function recordIslandPresence(env, actor, now = Date.now()) {
  const kv = env?.ACTMASTER_KV;
  if (!kv?.get || !kv?.put || !actor?.memberId) return { available: false };
  try {
    const key = await presenceKey(actor.memberId);
    const previous = await kv.get(key, { type: 'json', cacheTtl: 30 });
    // Multiple visible tabs share the canonical key. Never intentionally renew it more than once/minute.
    if (!validRecord(previous, now) || now - previous.seenAt >= PRESENCE_HEARTBEAT_SECONDS * 1000) {
      await kv.put(key, JSON.stringify({ v: 1, seenAt: now }), { expirationTtl: PRESENCE_TTL_SECONDS });
    }
    return { available: true, heartbeat: true, retryAfterSeconds: PRESENCE_HEARTBEAT_SECONDS };
  } catch { return { available: false }; } // A KV rate limit/outage never affects cards or conversations.
}
