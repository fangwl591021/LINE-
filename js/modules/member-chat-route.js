// Only a pure notification view route. Never accepts an identity or writes membership.
export function memberChatRoute(params) {
  const allowed = new Set(['memberChat', 'code', 'state', 'liffClientId', 'liffRedirectUri', 'liff.state', 'liff.referrer']);
  // The existing initial-params reader also parses a plain OAuth state as an empty query key.
  // Ignore only that exact transport artifact, never feature parameters with values.
  const state = params.get('state') || '';
  for (const key of params.keys()) {
    if (key === state && /^[A-Za-z0-9_-]+$/.test(state) && params.get(key) === '' && params.getAll(key).length === 1) continue;
    if (!allowed.has(key) || params.getAll(key).length !== 1) return '';
  }
  const id = params.get('memberChat') || '';
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ? id : '';
}
