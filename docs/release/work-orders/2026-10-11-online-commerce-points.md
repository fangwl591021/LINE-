# 網購訂單購物金折抵與退點

## 變更摘要

- 使用者要求：網購開放點數折抵、沿用現有金鑰；測試通過直接部署。本輪「繼續」。
- 基準：正式 LINE- main 3fbe0a23a4a4486baa86ec628f6bb66f0ad48f72，分支 codex/online-commerce-points-20261011。
- 目標：line-engine Worker / actmaster_db，及 fangwl591021.github.io/LINE-；不部署旧草稿 checkout。
- 修改前：2026-10-11 change guard before 完整 PASS。
- 已讀：core-invariants、feature-change-protocol、regression-matrix、points-ledger、store-point-cashier-protected-flow、store-commerce、deployment-runbook。

## 允許範圍

- 獨立 store-commerce 訂單、點數操作狀態機及母站橋接；原始 mother gift_money 為唯一帳本。
- 商品折抵規則／運費不折抵、確認下單扣點、未回報匯款取消退點、本店已退款且未出貨退點。
- 新增 0062 migration（0054 已用於 AI 任務，不能覆蓋），保留既有訂單／事件／索引。
- 修改檔案：worker/store-commerce.mjs、新 store-commerce-points.mjs / store-commerce-mother.mjs、worker-entry.mjs；workerbackup.js 只新增薄橋接，不能改 PointModule。wrangler.toml 只新增折抵開關，部署 --keep-vars 保留其餘設定。
- 對應前端 store-commerce.js、store-shop.js 的載入版本、entry/index/store-shop.html 的快取版本；相關精準測試、smoke 註冊與文件。

## 禁止範圍

- 不改電話／QR 收銀、180 秒 session、cashier handler、UID resolver、名片、OA 回覆、活動、支付、既有客戶資料或 secrets/bindings。
- 不建立第二套餘額；不把 D1 估值當 mother 確認；不替使用者補建或更換點數身份。
- 不再執行正式點數異動。僅之前單次 -1/+1 本人測試已授权完成，不擴張成網購實扣授權。

## 安全決策

- mother 通用 insert 已有本人 -1/+1 實際數字入帳 ID 及精確交易標記驗證；沒有跨系統原子扣點／預留或母站冪等保證，不虛構這些能力。
- D1 只存訂單意圖、不可重送狀態、原始回執及母站紀錄 ID。每訂單各最多一筆扣点／退點，與現場 cashier 共用顧客未完成鎖。
- 外部呼叫前 durable sending；任何 timeout／模糊成功／失敗後查不到紀錄均保留鎖，禁止自動重扣、解鎖或補償。
- 母站 raw ledger 必須唯一精確符合 operation UUID、order UUID、canonical identity、gift_money 及正負點數；回執數字 ID 不匹配拒絕。
- 唯讀對帳可恢復已確認入帳的 sending/unknown，不可因沒查到就再次寫入。退點必須再確認原始扣點，不可借用別筆記錄。
- mother 的跨站並行可能改變餘額，入帳後讀到負餘額／不一致則鎖定、不視為可履約訂單。此防線不等於母站原子扣款。

## 測試與部署

- 隔離 SQLite：舊資料/FK 保留、雙擊、並行訂單/收銀、身份/餘額變動、母站斷線與 bare success、回執錯配、D1 finalize 失敗、單次退點、權限、關閉開關、唯讀對帳。
- 假資料瀏覽器：折抵確認、未付款取消、核帳與退款／退點、未知狀態不顯示付款入口。
- guard after、Worker dry-run；不得帶失敗上線。保持原 secrets/bindings，--keep-vars。單一 migration 以 .wrangler/online-points-migration.toml 指向只含 0062 的暫存目錄，先 list 僅一項，再 apply 自動備份／transaction。
- 正式只做 schema/aggregate SELECT、功能開關及靜態資產檢查；部署回執另存。

## 實作完成檢查

- 本次新增母站薄 adapter，不改原 PointModule / protected cashier；單一資料來源與 unknown 不重送規則保留。
- 56/56 隔離測試、手機／桌面買家及店家操作、完整 before/after guard、Wrangler dry-run、本機 D1 migration 均 PASS。
- 詳見 docs/tests/online-commerce-points-20261011.md；本輪正式點數與新網購訂單異動 0。
