const fs = require('fs');
const path = require('path');
const { assertCacheBust } = require('./check-cache-bust-contract');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const checks = [
  {
    name: 'dailyPointCheckin explicitly allows D1 identity fallback in action policy',
    pass: /dailyPointCheckin:\s*\{[^}]*allowD1Fallback:\s*true/.test(worker)
  },
  {
    name: 'extractLineVoomMedia explicitly allows D1 identity fallback in action policy',
    pass: /extractLineVoomMedia:\s*\{[^}]*allowD1Fallback:\s*true/.test(worker)
  },
  {
    name: 'D1 identity fallback accepts pointUserId',
    pass: /payload\.pointUserId/.test(worker) && /data\.pointUserId/.test(worker)
  },
  {
    name: 'D1 identity fallback accepts pt_uid',
    pass: /payload\.pt_uid/.test(worker) && /data\.pt_uid/.test(worker)
  },
  {
    name: 'daily checkin sends userId, pointUserId, and pt_uid',
    pass: /dailyPointCheckin[\s\S]*\{\s*userId,\s*pointUserId,\s*pt_uid:\s*pointUserId\s*\}/.test(auth)
  },
  {
    name: 'daily checkin reads ACTMASTER_POINT_UID cache',
    pass: /ACTMASTER_POINT_UID_/.test(auth)
  },
  {
    name: 'point wallet query sends bridged point uid',
    pass: /queryUserPoints[\s\S]*pointUserId[\s\S]*pt_uid:\s*pointUserId[\s\S]*point_type:\s*['"]gift_money['"]/.test(auth)
  },
  {
    name: 'same LIFF no longer clears point uid bridge',
    pass: !/removeItem\(['"]ACTMASTER_POINT_UID_/.test(auth)
  },
  {
    name: 'point uid bridge accepts URL point identifiers',
    pass: /readPointUidFromParams[\s\S]*pt_uid[\s\S]*wallet_uid[\s\S]*pointUserId[\s\S]*LINE_user_id/.test(auth)
  },
  {
    name: 'queryUserPoints resolves D1 point identity bridge',
    pass: /queryUserPoints[\s\S]*explicitPointUserId[\s\S]*fallbackUserId[\s\S]*resolvePointUserId/.test(worker)
  },
  {
    name: 'fresh cached member session is not downgraded by an inconclusive checkUser',
    pass: /let cachedUserInfo = null/.test(auth) &&
      /usedCachedUser && cachedUserInfo[\s\S]*keeping cached session/.test(auth) &&
      /!checkRes\.isRegistered/.test(auth)
  },
  {
    name: 'token refresh does not show a red login toast',
    pass: /LINE 授權更新中/.test(core) &&
      !/LINE 授權已失效，正在重新登入\.\.\.', true/.test(core)
  },
  {
    name: 'LIFF init automatically handles external browser login',
    pass: /initActmasterLiff\(LIFF_ID, \{ withLoginOnExternalBrowser: true \}\)/.test(auth)
  },
  {
    name: 'invalid LIFF authorization code safely recovers once with clean URL',
    pass: /recoverActmasterInvalidLiffAuthorization/.test(config) &&
      /invalid authorization code/.test(config) &&
      /ACTMASTER_LIFF_INVALID_CODE_RECOVERY_V1/.test(config) &&
      /location\.replace\(window\.buildActmasterCleanLiffUrl\(\)\)/.test(config) &&
      /recoverActmasterInvalidLiffAuthorization\?\.\(err\)/.test(auth)
  },
  {
    name: 'LIFF recovery removes OAuth parameters but preserves application parameters',
    pass: /'code', 'state', 'liff\.state', 'liffClientId', 'liffRedirectUri'/.test(config) &&
      /hasOAuthParams/.test(config) &&
      !/new URL\(window\.location\.origin \+ window\.location\.pathname\)/.test(config)
  },
  {
    name: 'auth and core cache bust versions were bumped',
    pass: (() => { try { assertCacheBust('js/config.js'); assertCacheBust('js/core.js'); assertCacheBust('js/auth.js'); return true; } catch (e) { return false; } })()
  }
];

const failed = checks.filter(check => !check.pass);

for (const check of checks) {
  console.log(`${check.pass ? 'OK' : 'FAIL'} ${check.name}`);
}

if (failed.length) {
  console.error('\nAuth stability contract failed. Do not deploy until this is fixed.');
  process.exit(1);
}

console.log('\nAuth stability contract passed.');
