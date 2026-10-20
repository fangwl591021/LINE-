# 贈點單位公開目錄

- 日期：2026-10-20；使用者同意首頁探索好店上方設贈點單位，來源在 CRM。
- checkout：.worktrees/veo-crm-tasks-release；origin fangwl591021/LINE-；branch codex/public-reward-units-20261020。
- baseline：418b46a72e6d7a0d2acf97f7cf4913500fede12c。
- guard before：PASS（node tools/run-change-guard.js before）。
- 已讀：core-invariants、feature-change-protocol、store-shop、store-admin-directory、store-listing-review、partner-onboarding-ai、button-actions、liff-routes、card-resolvers、card-ownership-and-versioning、regression-matrix；Workers/Wrangler skills。

## 範圍

- 新增 CRM 贈點帳號的公開展示投影與明確上架表單、AI 審核、CAS／防重送稽核；不變更 CRM 來源資料。
- 公開首頁橫向三張卡片、更多列表、單位詳情／返回。電話／地址只來自管理員確認發布的欄位。
- CRM 角色不是公開同意：新增 0066 空表，既有七個 reward 帳號不批次公開；資料不足不杜撰。來源預填只取嚴格本人名片，公司電話不回退私人會員電話。
- 已公開投影僅在來源 CRM 仍為 reward 時可讀；撤銷角色即不再展示。顯示與實際贈點交易仍分離。
- 預計檔案：worker/reward-unit-directory.mjs、worker-entry.mjs、0066 migration、CRM 兩入口、admin editor、商城 home/list/detail／CSS／cache refs、專用測試及契約。

## 禁止變更

母站、點數帳本／贈扣點／收銀、會員 UID／認領／推薦歸屬、原名片池與名片 resolver、任務通知／LINE 回覆所有權、商品／訂單／運費、既有 partners、金鑰／vars／bindings／cron／compatibility／observability 設定。

## 驗證與部署

- 專用 SQLite：匿名唯讀、已驗證 admin 寫入、其他角色拒絕、角色撤銷、私資白名單、草稿／失敗不公開、版本／重送／競態與稽核原子性。
- 本機瀏覽器：320/390/1280，首頁卡片／更多／搜尋／返回／空與錯誤狀態，CRM 表單取消／審核保存。僅合成資料。
- full guard after：PASS（兩次）；發布前最後再跑。Worker runtime：PASS。
- 新功能瀏覽器三寬度 PASS，專用與相關單元50項 PASS。額外舊後台 rowHeight 斷言在 baseline/現行相同失敗，未放寬或更改原版面；詳見 docs/tests/reward-unit-directory-verification-20261020.md。
- 使用者既有授權：測試通過直接部署；僅 0066 migration（空表，不寫會員／正式單位），先 Worker 後 Pages。
- 正式驗證只讀；核對設定 hash、部署版本、Pages blob；不送 LINE 推播或贈點，不造測試商家。
