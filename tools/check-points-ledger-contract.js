const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const inbox = fs.readFileSync(path.join(root, 'js', 'modules', 'inbox.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs', 'contracts', 'points-ledger.md'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

function notIncludes(source, needle, message) {
  ok(!source.includes(needle), message);
}

ok(contract.includes('免費操作與免費傳送') && contract.includes('消費折抵') && contract.includes('每日簽到'), 'points ledger contract documents free operations and major point flows');
ok(contract.includes('新操作不得產生操作者 `-10` 或失敗退回 `+10` 事件'), 'contract forbids new operator debit and refund events');

ok(worker.includes('resolvePointUserId') && worker.includes('pointUserId') && worker.includes('pt_uid'), 'worker resolves canonical point identity bridge');
ok(auth.includes('ACTMASTER_POINT_UID_') && auth.includes('pointUserId') && auth.includes('pt_uid'), 'frontend sends bridged point uid');

ok(index.includes('掃描客戶 QR 碼或輸入電話可折抵扣點或消費贈點'), 'store point UI keeps the current cashier operation guidance');
ok(index.includes('一般訊息、課程邀約、訪談邀請與優惠券皆免費傳送'), 'inbox UI states free sends');
ok(auth.includes('母站已入帳'), 'store point client success requires mother posting confirmation');
ok(worker.includes('const operatorFee = 0'), 'store point worker uses zero operator fee');
ok(worker.includes('operatorFeeResult = { status: \'free\''), 'store point worker marks operator fee as free/skipped');
ok(worker.includes('母站點數錢包暫時無法讀取，無法建立收銀通道'), 'store point cashier session rejects unreadable mother wallet');
ok(worker.includes('此客戶目前尚未完成母站點數錢包同步'), 'store point cashier submit rejects local-only point source');
notIncludes(worker, "const result = customerPointSource === 'local'", 'store point cashier does not succeed through local wallet adjustment');
notIncludes(worker, "source: isReward ? 'store_reward_local_wallet'", 'store point cashier does not enqueue local wallet sync as success');
ok(worker.includes('const messageCost = 0'), 'message/coupon worker uses zero send cost');
ok(worker.includes("pointPayload.pointCharge = { pointType: 'gift_money', points: 0, status: 'free', messageType }"), 'inbox payload records free point charge');

notIncludes(worker, '店家點數操作扣點', 'worker does not create store operator debit event');
notIncludes(worker, '店家點數操作退點', 'worker does not create store operator refund event');
notIncludes(worker, '收件匣傳訊扣點', 'worker does not create inbox sender debit event');
notIncludes(worker, 'DELETE FROM inbox_items WHERE message_id', 'inbox items are not deleted because point debit failed');
notIncludes(index, '每次操作扣店家 10 點', 'index does not show store 10-point fee');
notIncludes(index, '一般訊息、課程邀約、訪談邀請與優惠券每次統一扣 10 點', 'index does not show inbox 10-point fee');
notIncludes(auth, '店家操作扣 10 點', 'auth preview does not show store 10-point fee');
notIncludes(auth, '店家已扣 10 點', 'auth success does not show store 10-point fee');
notIncludes(inbox, '預估扣', 'inbox does not show estimated point debit');
notIncludes(inbox, '扣除 ${totalCost} 點', 'inbox toast does not show point debit');

ok(worker.includes('deductPoints') && worker.includes('payableAmount'), 'manual discount points and payable amount are recorded');
ok(auth.includes('deductPoints') && auth.includes('payable'), 'manual discount client sends discount points and payable amount');
ok(worker.includes('dailyPointCheckin') && worker.includes('point_type'), 'daily checkin remains wired to point identity flow');
ok(worker.includes('singleUse: true'), 'coupon remains single-use');

console.log('\nPoints ledger contract passed.');
