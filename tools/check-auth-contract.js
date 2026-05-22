const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');

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
