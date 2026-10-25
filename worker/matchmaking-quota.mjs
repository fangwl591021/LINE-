// Directory work shares the existing 20-call budget, with at most 12 of those
// calls reserved for background discovery. No quota is cleared or increased.
export const DIRECTORY_DAILY_BATCH_LIMIT = 12;

export function nextMatchQuotaReset(now = Date.now()) {
  const day = new Date(now);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1)).toISOString();
}

export async function allowDirectoryMatchBatch(env, userId, consumeShared, now = Date.now()) {
  if (!userId || typeof consumeShared !== 'function') return false;
  const kv = env.ACTMASTER_KV;
  // Keep the existing no-KV behavior; no new quota authority is introduced.
  if (!kv) return await consumeShared();
  const day = new Date(now).toISOString().slice(0, 10);
  const key = `RL_matchmakeContacts_directory_${userId}_${day}`;
  const sharedKey = `RL_matchmakeContacts_${userId}_${day}`;
  let count;
  try {
    const [stored, sharedStored] = await Promise.all([kv.get(key), kv.get(sharedKey)]);
    count = stored == null ? 0 : Number(stored);
    const sharedCount = sharedStored == null ? 0 : Number(sharedStored);
    if (!Number.isSafeInteger(count) || count < 0 || count >= DIRECTORY_DAILY_BATCH_LIMIT) return false;
    // Also protect the release day and mixed foreground/background activity:
    // directory work may use only the first twelve shared slots, never the last eight.
    if (!Number.isSafeInteger(sharedCount) || sharedCount < 0 || sharedCount >= DIRECTORY_DAILY_BATCH_LIMIT) return false;
  } catch {
    return false; // Background discovery must not consume a foreground reserve on uncertainty.
  }
  if (!await consumeShared()) return false;
  try {
    await kv.put(key, String(count + 1), { expirationTtl: 86400 });
  } catch {
    // The shared call remains consumed; never perform unaccounted background AI.
    return false;
  }
  return true;
}
