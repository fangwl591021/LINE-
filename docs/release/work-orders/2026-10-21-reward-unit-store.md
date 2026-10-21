# 贈點單位公司與一件展示商品

- 需求：使用者確認贈點單位尚無開店權限後要求「快點處裡」；補齊本人公司資訊、電話、地址與一件展示商品，測試通過直接部署。
- checkout .worktrees/veo-crm-tasks-release；repo fangwl591021/LINE-；branch codex/reward-unit-store-20261021；基準／回復 commit 1c46f973cc5b0eb57940111a819036a6209d6d77。
- 已讀 feature-change-protocol、工作單模板、core-invariants、store-shop、store-admin-catalog、store-listing-review、liff-routes、points-ledger、store-point-cashier-protected-flow 與 Workers／Wrangler skills。
- guard before PASS（完整 smoke --full）；本機紀錄 C:/Users/User/AppData/Local/Temp/line-reward-store-before.log。
- 只允許 catalog 增加 reward／贈點用戶；本人唯一店面及最多一件未封存商品（草稿計入、封存可替換），in_store／redeem_type=none。公開仍沿用 active、AI 審核及白名單，不授予 merchant_enabled。
- 預計修改 worker/store-shop.mjs、store-admin-catalog.mjs、store-admin-products.mjs，store-shop／points-home 前端與快取，相關權限／審核／quota／UI／runtime 測試及契約。
- 禁止更動帳號 role／UID／映射／歸屬、贈扣點／收銀／QR／帳本／母站、訂單／收款、現有贈點單位公開快照、secrets／vars／bindings／cron／compatibility_date；不新增 migration，不為測試寫正式資料。
- 原贈點功能照舊，不開扣點、商品 QR 交易、網購收款／業績、跨店管理；CRM 贈點單位目錄與本人店面為不同的明確發布流程，不複製私人 CRM 資料。
- 驗證：新增案例先重現原403；reward／中文別名本人公司與一件商品、重送／併發／封存、匿名／撤權、審核拒絕不公開、admin catalog 原子稽核均通過。原贈點與收銀模組未改，完整 guard before／after PASS。首輪 after 發現舊測試仍把 reward 視為無目錄權限，已更新角色矩陣並保留 tenant／無帳號／未知角色拒絕案例，全套重跑成功。
- 實際前端＋原 Worker API＋合成 LINE／AI／SQLite：user／redeem／扣點用戶／reward／贈點用戶 × 320/390/1280 共15組公司電話地址、一件商品儲存及公開顯示 PASS；第二件拒絕、角色不改、公開零寫入、無點數請求。七角色導覽共21組 PASS；Workerd compatibility 2026-04-23、flags=[] 真正 D1 審核／quota／公開／禁網購／撤權 PASS。390px畫面已目視核對。
- 正式唯讀盤點：7個贈點帳號、0店面、0商品，rows_written=0；此次權限開放不會重新公開舊店面或商品。未改正式帳號或贈點單位發布快照。
- 實際追加 worker/store-admin.mjs 的 public_visible 計算同步新 catalog 資格；不變更 authorizeStoreAdmin、收銀權限或母站。前端快取 store-shop67／entry70／points-home7。
- 部署：精確 commit 的 line-engine Worker 先行，再 PR 合併觸發 Pages；沿用既有金鑰與配置，核對正式 version、設定／排程指紋、CI 與 served bytes。不宣稱真實手機贈點驗收。
