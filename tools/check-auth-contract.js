const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const checks = [
  {
    name: 'dailyPointCheckin is in D1 identity fallback actions',
    pass: /d1IdentityFallbackActions[\s\S]*['"]dailyPointCheckin['"]/.test(worker)
  },
  {
    name: 'extractLineVoomMedia is in D1 identity fallback actions',
    pass: /d1IdentityFallbackActions[\s\S]*['"]extractLineVoomMedia['"]/.test(worker)
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
    name: 'auth and core cache bust versions were bumped',
    pass: /js\/core\.js\?v=7\.24/.test(index) && /js\/auth\.js\?v=10\.28/.test(index)
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
