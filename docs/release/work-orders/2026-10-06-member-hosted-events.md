# VEO 會員辦活動模式移植

## 1. 變更摘要

日期 2026-10-06；使用者要求移植 VEO、上架後瀏覽器模擬測試。
起始 commit c1e6000fca05e4647cf89d36d4d3bf094278eeca；回復點同此。
來源：veo-phone-validation-release-20260912/src/member-events.js、10003 migration、public/member-events-ui.js；UI 與 VEO 線上 20260909-host-review-1 內容一致。

## 2. 本次只允許改什麼

新增會員活動 service、schema、UI、測試；home.js 的行事曆投影及模式分流；index.html 資產版本；Worker dispatch；契約與 smoke registry。

## 3. 本次禁止碰什麼

VEO 部署／資料、官方活動／系列梯次、personal_tasks 儲存、身份解析、LINE keyword、名片、點數／收銀、既有推播、secrets、bindings、兼容日期。

## 5. 修改前必跑

node tools/run-change-guard.js before：PASS。完整 log 存放任務外部 artifacts/member-events-guard-before.log。

## 6. 必讀規格

core-invariants、liff-routes、points-ledger、feature-change-protocol、member-hosted-events。

## 8. 實作紀錄

保留原私人行程；會員活動為獨立 authoritative source，僅投影至行事曆，不複製官方活動。手機模擬使用隔離 SQLite 與虛構身分；上線後用實際已發布靜態資產連接該本地模擬 API，不寫真實報名。

## 9. 修改後必跑

guard after 全部 PASS；新增後端 SQLite 9 項、UI 契約 3 項 PASS。更新兩項首頁快取版號的既有契約，保留原功能檢查。

本機 Chrome 390/1024px：草稿取消 0 寫入、連按發布只建 1 場、編輯維持同 ID、每人一場未結束活動、報名／輪換 QR／核銷／重複核銷／取消活動 PASS。真實 jsQR 解碼合成 MediaStream，返回名單停止相機軌道；無頁面 JS 錯誤、0 正式業務資料寫入。

## 11. 上線判斷

本機測試與 dry-run 通過，允許精確套用新增 0055 migration，部署既有 line-engine（keep-vars）及 GitHub Pages。部署前重新確認 main c1e6000f、Worker 1286bd8f；0055 表不存在，users.row_id 為既有 PK。保留原 bindings、crons、compatibility_date、vars/secrets；不套用無關 0042/0043。

發布後須再次核對正式資產／未登入權限，並載入正式資產執行相同隔離瀏覽器模擬。正式 LINE 登入、實體 Android/iOS 相機及真實會員報名不以此模擬冒充驗收。最終部署與測試收據另存任務外部 artifacts。

## 12. 退版

前端 revert 本次 PR 並重新發布 Pages；Worker 回退 1286bd8f 或以基底重部署。0055 為新增隔離 schema，退版時保留表和新報名資料，不刪除會員紀錄、不還原整個資料庫；亦可使用 MEMBER_EVENTS_DISABLED=1 暫停本模組（需明確操作部署變數）。
