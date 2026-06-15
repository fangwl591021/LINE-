const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs', 'contracts', 'points-ledger.md'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

ok(contract.includes('統一扣點') && contract.includes('消費折抵') && contract.includes('每日簽到'), 'points ledger contract documents major point flows');

ok(worker.includes('resolvePointUserId') && worker.includes('pointUserId') && worker.includes('pt_uid'), 'worker resolves canonical point identity bridge');
ok(auth.includes('ACTMASTER_POINT_UID_') && auth.includes('pointUserId') && auth.includes('pt_uid'), 'frontend sends bridged point uid');

ok(index.includes('每次操作扣店家 10 點'), 'store point tool states 10-point operation fee');
ok(index.includes('一般訊息、課程邀約、訪談邀請與優惠券每次統一扣 10 點'), 'inbox send/coupon UI states 10-point fee');
ok(auth.includes('店家操作扣 10 點') && auth.includes('店家已扣 10 點'), 'store point client preview and success use 10-point fee copy');
ok(worker.includes('const operatorFee = 10') || worker.includes('operatorFee = 10'), 'store point worker uses 10-point operator fee');
ok(worker.includes('const messageCost = 10') || worker.includes('messageCost = 10'), 'message/coupon worker uses 10-point cost');

ok(worker.includes('deductPoints') && worker.includes('payableAmount'), 'manual discount points and payable amount are recorded');
ok(auth.includes('deductPoints') && auth.includes('payable'), 'manual discount client sends discount points and payable amount');
ok(worker.includes('dailyPointCheckin') && worker.includes('point_type'), 'daily checkin remains wired to point identity flow');

console.log('\nPoints ledger contract passed.');
