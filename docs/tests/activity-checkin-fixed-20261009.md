# 活動／課程核銷修復驗收

範圍：LINE- 活動與課程，不含商城點數。所有可寫測試使用合成登入身分、本機 SQLite／D1，正式資料寫入 0。

## 實際執行

- `node --test test/activity-checkin.test.mjs`：13 項 PASS。驗證 token／本場權限、偽造 role/network、錯場、取消／下架、歸屬及父梯次競態、12 次並行防重、保留首次核銷時間、手動取消獨立、DB 錯誤不回退 GAS。
- 活動／會員活動／報名／分類／可見性／梯次相關回歸：104 項 PASS，後續新增父梯次競態項目也 PASS；公開不擴大主辦權限。
- `node test/browser/activity-checkin-flow.mjs`：11 組 PASS。會員自建活動／課程均用真實 UI 報名、出示新本機 QR、讀取實際像素、重發舊碼失效、主辦相機核銷、回讀名單、鏡頭釋放；專區活動／課程均實際解碼 QR、開啟相容 LIFF URL、重掃不取消、手機內建掃碼器與取消後同場刷新、相機拒絕→QR 圖片備援、無效 URL 提示及切帳號關閉。掃描器 320/390/768/1200px 無控制項溢出；無頁面例外或非預期外部請求。
- `node test/browser/admin-activity-registration.mjs`：完整實際 admin shell PASS。新增掃描入口、貼碼核銷、名單刷新、錯誤 QR 不送 API、返回／關閉與 320/390/1440px；既有分類、DM、多梯次、報名網址、付款、CSV、重試、遲到回應及公開 POP 回歸也通過。此 fixture 的 API 使用合成回應，後端正確性另由 SQL／runtime 驗證。
- local Wrangler 用 `test/fixtures/activity-checkin-runtime.wrangler.toml`，虛構 D1 UUID 11111111-1111-4111-8111-111111111111，無正式 KV/R2/secrets；包裹實際 `worker-entry.mjs`，只允許合成身份的三個核銷相關 action。`node test/activity-checkin-runtime.mjs http://127.0.0.1:8963` PASS：活動／課程／父子梯次各 8 次並行核銷，跨店、會員、无 token、錯場、取消拒絕，手動取消獨立。只用本機 D1。
- `npm run guard:before` PASS；`npm run guard:after` PASS；`wrangler deploy --dry-run --keep-vars --strict` PASS。版本字串契約同步快取升版，未放寬權限或跳過檢查。

## 證據與限制

瀏覽器 JSON／截圖：`.wrangler/activity-checkin-fixed-20261009/report.json`；admin 截圖：Windows Temp `admin-activity-registration-20260928/activity-checkin-scanner-*.png`；guard 記錄：Windows Temp `activity-checkin-before-20261009.log` / `activity-checkin-after-20261009.log`。本機診斷資料不納入 Pages。

相機以實際 QR 像素轉 canvas MediaStream 模擬，不代表 iOS/Android 真實鏡頭、LINE OAuth 或既有正式會員已親自跑過。部署後用正式資產版本／SHA256、Worker bindings/secrets 名稱比對及無 token 的拒絕檢查驗證上線，不用真實學員核銷測試。
