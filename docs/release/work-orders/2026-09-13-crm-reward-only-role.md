# CRM 贈點用戶

## 1. 變更摘要

- 日期：2026-09-13。
- 使用者需求：CRM 新增「贈點用戶」，只能掃碼贈點、不能扣點。
- 起始 commit：76d68e3cb70bd117964f9d55b1c0b32b72170a23；canonical checkout 為 line-android-500/LINE-，main。
- 狀態：使用者已於後續指示「提交、部署」授權本版本發布；未授權額外商品上架資格，未操作正式會員或點數。

## 2. 本次只允許改什麼

- CRM 的第三角色 reward／贈點用戶（PC admin、admin-v2、手機），角色標籤、篩選、確認、失敗還原。
- 會員收銀機及商城品牌入口 POP 的 reward-only 顯示與輸入限制。
- 後端新增角色正規化，僅授予會員 QR 查詢、消費贈點及本人交易狀態／紀錄讀取。
- 新角色憑證綁定已驗證的操作者、canonical 顧客，期限 180 秒。KV 只存 SHA-256 token key；不接受手動 UID／電話入口或商品折抵碼。
- 新角色送出在 wallet handler 前及既有 beforeWrite 前再次驗證憑證與 D1 即時角色。扣點、非零 deductPoints、商品資訊及其他管理 actions 均拒絕。
- 防止 profile 儲存、可編輯姓名電話 hard-admin 比對、弱身份恢復流程授予或升級 reward 權限；新增角色只由管理員角色編輯器授予／撤銷。

## 3. 本次禁止碰什麼

- 不改既有 cashierSessionId 建立／預備、TTL、母站查詢順序、交易計算、fallback、requestId 防重及帳本。
- 不改原管理員／店長的掃碼、電話、贈點及扣點功能。
- 不新增任意手填贈點公式、不更動 secrets、正式 DB 資料或 commerce 開關。
- 不新增商城管理／不限商品／收款資格。

## 4. 安全與角色邊界

- reward 不屬 canManage；必須有有效 LINE 登入，不能使用無 Token 的 D1 身份 fallback 取得收銀資料。
- 掃碼 receipt 為獨立授權憑證，不是舊 cashier session、交易鎖或實體相機證明。知道或持有合法會員 QR 內容仍等同持有码；送出前須核對顧客。
- KV 不作原子鎖。原 D1 requestId 邊界保留 at-most-once、未知結果查单、不自動重贈；已完成同編號可在憑證過期後查回原結果。
- reward 角色撤銷後不可再贈點。舊角色不增加掃碼 receipt 查詢成本。
- 將 reward 視為一般會員、保留一件商品上架資格的額外補丁遭 auto-review 以超出授權拒絕，未套用／未繞過；需使用者另行確認。一般網購買方流程未改。
- 既有 check-security-phase-1-contract.js 有 6 項其自行標註 expected before Phase2 的 baseline 失敗（UI 子任務在 worker 尚未改動時確認）；不是正式完整 guard 的失敗，亦不宣稱該舊檢查通過。

## 5. 驗證

- 修改前：node tools/run-change-guard.js before PASS。
- 專用測試共 57 項 PASS：reward-role-admin 16、reward-only-cashier 12、reward-only-integration 17、reward-cashier-ui 12。
- 修改後：node tools/run-change-guard.js after PASS。首次因既有 core/auth 精確版本断言失敗；僅同步新版引用後全套通過，未略過檢查。
- 合成 D1／KV／LINE Token 測試：偽造角色、無 Token、人工 UID／電話、扣點／商品碼、跨人憑證、過期／撤權、profile 升權、身份恢復、防重送、本人的紀錄範圍、原店長流程。
- 本機 Chrome 390px：POP 僅 scan；manual lookup 無網路呼叫；會員 QR lookup 帶 walletQr；送出 mode=reward、deductPoints=0、含 scan receipt；對話框左右 10px／380.4px，無橫向溢出。切回店長顯示 scan、phone。
- Wrangler 4.131.1 deploy --dry-run --keep-vars PASS；1069.08 KiB，gzip 226.02 KiB。只在暫存目錄打包，未部署。
- 未以正式帳號實掃、未賦予正式用戶新角色、未執行真實贈扣點。

## 6. 後續上線

- 已獲提交／部署指示；先從本次乾淨提交發布 Worker，再推送 main 發布 Pages，並驗證正式版本。發布前完整 guard 再次 PASS。
- 無新增 migration 或 binding；沿用 ACTMASTER_DB／ACTMASTER_KV。Worker 發布須保留既有 Dashboard vars，包括 commerce 開關。
- 前端版本鏈：core 7.32、auth 10.98、admin 8.9、store-shop-entry 31、store-shop 29、store-point-operation 2。
- 正式驗證應使用已授權測試帳號；真實贈點須另外明確確認顧客及金額，不以 mock 成功當作正式交易成功。
