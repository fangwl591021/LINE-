// Loopback-only manual acceptance: real cashier UI; synthetic member and point responses.
// No production identity, transaction endpoint or external API is reachable.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../../'+path, import.meta.url), 'utf8');
const files = new Map([
  ['/css/store-shop.css','css/store-shop.css'],
  ['/js/modules/store-point-operation.js','js/modules/store-point-operation.js']
]);
createServer((req,res) => {
  const url = new URL(req.url,'http://127.0.0.1:8771');
  if (req.method !== 'GET') { res.writeHead(405);res.end();return; }
  if (files.has(url.pathname)) {
    res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');
    res.end(read(files.get(url.pathname)));return;
  }
  if (url.pathname !== '/') { res.writeHead(404);res.end();return; }
  const role = url.searchParams.get('role') === 'store' ? 'store' : 'reward';
  const source=read('index.html'),authSource=read('js/auth.js');
  const panel=source.slice(source.indexOf('<section id="store-point-cashier"'),source.indexOf('<section id="point-sync-diagnostics"'));
  const scanner=source.slice(source.indexOf('<div id="store-point-scanner-modal"'),source.indexOf('<div id="activity-share-modal"'));
  const auth=authSource.slice(authSource.indexOf('let storePointRewardScan ='),authSource.indexOf('window.claimDailyPointCheckin ='));
  res.setHeader('Content-Type','text/html;charset=utf-8');
  res.setHeader('Content-Security-Policy',"default-src 'self' data: https://cdn.tailwindcss.com; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src data:; frame-src 'none'; form-action 'none'");
  res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>贈點手機方式・本機驗收</title><script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="/css/store-shop.css"><style>body{font:16px system-ui;margin:0;padding:16px;background:#f5faf8}.hidden{display:none!important}.custom-input{width:100%;border:1px solid #cbd5e1;border-radius:14px;padding:12px}#toast-container{color:#b91c1c;padding:12px}button:disabled{opacity:.5}#fixture-status{font:14px system-ui}</style><body><h1>本機驗收：${role==='reward'?'贈點單位':'店長'}</h1><p>合成資料；不連正式點數。測試手機 0912345678</p><nav><a href="?role=reward">贈點單位</a> | <a href="?role=store">店長</a></nav><button id="open" type="button">開啟贈點</button><output id="fixture-status">查詢 0 次；模擬送出 0 次</output><div hidden>${panel}${scanner}<div id="toast-container" role="status"></div></div><script>
  window.currentUserProfile={userId:'U'+'a'.repeat(32)};window.currentUser={role:${JSON.stringify(role)}};window.userRole=${JSON.stringify(role)};
  window.liff={isLoggedIn:()=>true};window.escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.showToast=message=>document.getElementById('toast-container').textContent=message;
  </script><script>${auth.replace(/<\/script/gi,'<\\/script')}</script><script type="module">
  import {openStorePointOperationPopup} from '/js/modules/store-point-operation.js';
  let reads=0,writes=0;const customer='U'+'b'.repeat(32);
  const status=()=>document.getElementById('fixture-status').textContent='查詢 '+reads+' 次；模擬送出 '+writes+' 次';
  window.fetch=async()=>{throw Error('本機驗收禁止外部連線');};
  window.fetchAPI=async(action,payload)=>{
    if(action!=='getStorePointCustomer')throw Error('本機驗收不提供此 API');
    reads++;status();
    if(payload.customerUserId!=='0912345678')return {success:false,error:'查無會員，請確認完整手機號碼或改掃會員 QR'};
    if(window.userRole==='reward'&&(payload.customerPhone!=='0912345678'||payload.walletQr))throw Error('手機查詢格式錯誤');
    return {success:true,data:{customerPointUserId:customer,name:'合成測試會員',phone:'0912345678',balance:900,canAdjust:true,balanceSource:'mother',rewardScanToken:'rwd_'+'b'.repeat(64),rewardScanExpiresAt:Date.now()+180000}};
  };
  window.submitSafeCashier=async payload=>{
    if(payload.customerUserId!==customer||payload.mode!=='reward'||payload.deductPoints!==0||!payload.rewardScanToken)throw Error('合成贈點驗證失敗');
    writes++;status();return {success:true,data:{mode:'reward',changedPoints:payload.amount,customerPointSource:'mother'}};
  };
  window.loadStorePointCashierLogs=async()=>{};window.refreshPointBalanceBadge=async()=>{};
  window.openStorePointScanner=()=>window.showToast('本機不開啟相機，請使用測試手機');
  document.getElementById('open').onclick=()=>openStorePointOperationPopup({mode:'reward'});
  window.updateStorePointCashierPermissions();
  </script></body></html>`);
}).listen(8771,'127.0.0.1',()=>console.log('Reward phone preview: http://127.0.0.1:8771/'));
