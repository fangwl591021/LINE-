# 折抵單位公司與一件展示商品

- 使用者授權：補齊扣點用戶／折抵單位上架公司資訊、電話、地址及一件商品，測試通過直接部署；不升級帳號角色、不開放贈點或跨店管理。
- repo fangwl591021/LINE-；checkout .worktrees/veo-crm-tasks-release；branch codex/redeem-single-product-20261021；基準／回復 commit f20005d666e63527402ef08465ea29c36b3efe76。
- before：首輪既有 activity-visibility-ui 測試逾時。單獨重現為日期寫死 2026-10-20，當日過後按既有規則隱藏編輯按鈕；僅將該測試樣本改相對未來，未改活動程式、斷言或跳過測試。重新完整 guard before PASS 後才開始功能修改。
- 已讀：feature-change-protocol、工作單模板、core-invariants、store-shop、上架審核、扣點受保護流程／角色、admin catalog、LIFF 管理入口、Workers configuration/runtime 與 Wrangler skills。
- 允許：catalog 的 redeem／扣點用戶身分白名單、本人唯一店面、一件未封存商品（草稿計入，封存可替換）、公開目錄與管理員既有 catalog 連動、可見本人設定入口與清楚限制提示；沿用既有 AI 審核、owner／CAS、重送與原子 quota。
- 展示商品限 in_store／redeem_type=none；不改原會員扣點入口。不是新增商品 QR 折抵、網購收款或業績權限，交易能力仍由原規則控制。
- 禁止：修改 users role／UID／映射／歸屬、私人資料公開、母站、點數帳本／QR／收銀／訂單、贈點規則、既有 AI 審核決定、其他角色權限、secrets／bindings／vars／cron／compatibility_date。無 migration，不為驗收新增或發布正式店面／商品。
- 預計檔案：worker/store-shop.mjs、store-admin*.mjs 的 catalog 資格條款；store-shop／points-home 前端、快取、角色與審核／名額／UI 測試及契約。
- 驗證：先補測試重現，再測兩種角色表示、本人公司與一件商品完整流程、第二件／併發拒絕、封存替換、跨店／未登入／撤權拒絕、審核拒絕不公開、展示零交易、原贈扣點回歸及完整 guard after；本機合成 LINE／AI、SQLite／Workerd 與 320/390/1280px 操作，不冒稱真實 LINE／母站驗收。
- 部署：先精確 commit Worker line-engine，再 Pages；既有平台金鑰與配置不變，核對 CI、Worker version、bindings 設定指紋及正式 served bytes；保留所有舊未追蹤紀錄。
- 實作：僅 catalog 資格增加 redeem／扣點用戶；本人寫入再綁定讀取時的 DB role 快照，AI 等待期間撤權／切角色不得沿用舊無限件數或網購資格。公開 merchant_enabled 保持 0，SecurityModule、收銀 action allowlist 與點數實作完全未改。
- after：完整 guard PASS；首輪只因 lifestyle 契約寫死 points-home v5 而失敗，同步實際 v6 後全部重跑通過。相關商品／審核／後台／角色／扣點／網購 230/230 PASS。新增案例先重現原 403，再驗證一件名額、併發、封存替換、跨店／匿名／撤權、審核 reject/manual/error、管理員既有稽核與 no-online 限制。
- 實際前端表單＋原 Worker API＋合成 LINE／AI／SQLite：user／redeem／扣點用戶 × 320/390/1280 共 9 組公司＋電話地址＋一件商品與公開顯示 PASS；第二件拒絕、角色未改、公開零寫入／無點數請求。五角色導覽 15 組 PASS；公開商品搜尋／分類／通路折抵篩選／詳情／45件分頁／XSS／零寫入三尺寸 PASS。
- Workerd/D1：2026-04-23、flags=[]；真實 D1 執行 AI 審核、redeem 展示商品／併發一件／公開資訊／商品搜尋／禁網購／撤權測試 PASS，無外部真服務。
- 前端版本：store JS66／entry69／points-home6；CSS 不變仍34。手機測試圖 C:/Users/User/AppData/Local/Temp/redeem-company-product-20261021 與 redeem-entry-20261021，390px 已目視核對。
- 正式唯讀盤點：3 個折抵帳號、0 店面、0 商品，本次不會因增加目錄資格重新公開既有折抵資料；查詢 rows_written=0。沒有新增或改動任何正式帳號、店面、商品、點數或訂單。
- 已確認正式 line-engine 基準 eecb37e4-9a0f-49a6-a050-32994bf651a0／100%；沿用既有 Wrangler 4.120.0 及 OAuth，無 CLI 升級／新金鑰。版本註記以外設定 SHA256 3b36c4b961bcc15b7e3354cbb3fa94d806afdbcbdb427816216b1f196573198d；排程 SHA256 3daefe8b947c3a195b684f87eabed3802f9e5fe166e6f82b805479be2495d578，發布後重新核對。
- Worker／Pages 發布結果與 CI／正式讀取驗證另留 deployment receipt；本機合成操作不等於手機 LINE 實機驗收。
