# 活動上傳公開範圍工作單

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-10-08 |
| 需求來源 | 上傳活動時 POP 選是否公開；是全網、否歸屬 |
| 目標功能 | 官方／會員活動明確發布範圍及伺服器授權 |
| 起始 commit | 7ec3dba5bcb11fecf9ae2128417ae0c4b75ed196 |
| 預計修改檔案 | 活動 UI、活動 Worker、0059 migration、合約與相關測試 |
| 是否部署 | 是；使用者追加「部署，順便做一個活動上架教學影片」 |
| 回復點 | 上述 commit；隔離分支 codex/activity-visibility |

## 2. 本次只允許改什麼

活動送出可見性彈窗、公開目錄／明細／報名與附件的可見性檢查、保存範圍與 regression。

## 3. 本次禁止碰什麼

UID resolver、推薦人／會員歸屬、點數 ledger、LINE reply ownership、AI 金鑰、正式資料與無關店家功能。

## 4. 影響流程

- [x] 後台 CRM／活動權限
- [x] 其他：活動發布、首頁、明細、報名、會員活動附件

## 5. 修改前必跑

`node tools/run-change-guard.js before`：PASS（2026-10-08，隔離 worktree）。

## 6. 必讀規格

已讀 core-invariants、feature-change-protocol、regression-matrix、liff-routes、points-ledger、admin-activity-registration、activity-form-options、member-hosted-events；新行為先列入 activity-visibility 合約。

## 7. 不變規則確認

本人名片／收藏名片、版本、scannedBy、推薦人、歸屬、分享／傳送路徑及點數規則均不改；公開不授予管理權。

## 8. 實作紀錄

- 共用 `activity-visibility.js`／CSS：明確「是，全平台公開」「否，僅歸屬可見」、取消／關閉；綁定登入身分，取消不儲存活動。
- 手機建立／編輯、會員辦活動確認與後台建立／編輯／重新上架均帶入選定範圍；會員列表／明細不再固定宣稱全平台公開。
- 官方與會員活動 Worker 保存 `visibility`；伺服器核對已驗證會員的歸屬，列表、明細、會員附件與報名同步採用範圍。公开不增加管理或名單權限。
- 加入 0059 additive migration，保留原官方 network／會員 platform 預設，不批次改正式資料。
- 防重送沿用同一 ID／requestKey／revision 和資料快照。官方快速建立的來賓名單可在部分失敗後接續，不重複建立；ID 衝突不能把來賓加到其他主辦活動。
- 相關測試 fixture 採實際會員註冊與 migration；資產版本測試同步更新；新增驗收列入 full guard。

## 9. 修改後必跑

`node tools/run-change-guard.js after`：PASS（2026-10-08；修改完成後完整重跑）。

- 85 項相關測試 PASS：visibility、實際瀏覽器 UI、官方梯次、後台、分享短網址、報名歷史。
- `git diff --check` 與修改的 JavaScript／Worker 語法檢查 PASS。
- 瀏覽器測試在本機 bundled Playwright + Chrome 實際執行，沒有略過；無瀏覽器依賴的 CI 明確略過 browser-only 驗收，靜態 wiring／後端測試仍執行。
- 完整 guard 紀錄：`C:/Users/User/AppData/Local/Temp/line-activity-visibility-guard-after.log`。

## 10. 人工驗證

- 320／390／1440 px 彈窗無水平溢出；Yes／No／Cancel、Escape、身分變更、中止、焦點返回通過。
- 使用真實手機表單、會員活動編輯器與後台表單 markup/module 的合成資料驗收，外部網路 mock，沒有正式發布活動／報名。
- POP 取消前無最終附件準備／活動 API；連按不重複送出；未確認成功的重送保留 ID、公開範圍與已上傳圖片。
- SQLite 測試確認跨網 private 列表／直接明細／附件／新報名拒絕，platform 可見；已報名者紀錄、票證／取消與管理者原權限維持。
- 彈窗截圖：`C:/Users/User/AppData/Local/Temp/line-activity-visibility-20261008/popup-390.png`（其他寬度在同資料夾）。

## 11. 上線判斷

原功能在本機完成；使用者於 2026-10-08 明確授權部署與新增教學影片。教學以真實前端和模擬會員／活動資料錄製，不建立正式示範活動或報名。

後續經授權上線時：唯讀核對正式 migration 與 target，僅套用 `0059_activity_visibility.sql`，再發布 Worker、最後發布新版前端，保留既有 bindings／vars／secrets。舊客戶端省略範圍仍相容，不批次公開舊活動。

## 12. 發布前核對

- `guard before` 再次 PASS；獨立審查 6 檔 86 測試 PASS，真 Chrome UI 未略過；Worker dry-run PASS。
- 正式 Worker 為 `line-engine`，前版 `c62969d0-57f2-4362-a5ff-17fe9bcef421`；compatibility date、D1／KV／R2 binding 和現有金鑰維持。
- 正式 D1 現有官方活動 16、會員活動 3，尚無 visibility 欄位；migration list 另有無關 0042、0043，本次不套用。
- 使用只含 0059 的隔離 migration 目錄，仍由 Wrangler migration apply 記錄與回復單份失敗。
- 回復時可還原前版 Worker／前端；保留新增欄位與發布範圍資料，不刪資料或反向刪欄位。
- 0059 已單獨套用並登錄 migration：官方 network 16、會員 platform 3，數量不變；0042／0043 未執行。
- Worker `aa0909f` 已部署：`a1846426-354b-43cf-b122-43d8dfefbca2`。正式 API 匿名會員活动 overview 回 401；官方目錄空陣列，偽造 network/role 仍不能讀明細。確認相容日期及 D1／KV／R2、secret binding 名稱和額外 STORE_COMMERCE_ENABLED 保留。
- 教學中心新增第 6 課「活動上架」，原 5 課不變。使用 10 張實際 UI 畫面與完整操作錄影、14 段台灣中文旁白、native Higgsedit；197.792 秒時間軸、章節依 edit manifest，無正式活動／報名或 AI 呼叫。
- 新增 capture 腳本供可重現操作示範；首頁入口、草稿核對（2026 當年）、分類、POP cancel/network/platform、首頁縮圖及全圖均錄製。
- 教學整合後 full `guard after` 再次 PASS，紀錄 `C:/Users/User/AppData/Local/Temp/activity-release-guard-after.log`。媒體輸出及前端發布需完成影片檢查後驗收。
- 成品已由 native Higgsedit 輸出並完整解碼通過：197.793 秒、720×1600、H.264／AAC、22,153,464 bytes；MP4 faststart 重新封裝、14 段中文重點文字與成品抽幀確認，沒有缺字方框。SHA256 `92e2fa1d17a76fdbcfb6d39a3d339ed37338933255fdaffefbba92c985b969c7`。
- 媒體已發布至 `linengine/tutorials/2026-10-08/activity-publish-tutorial-v1.mp4`；全檔 GET SHA256 與成品一致，HEAD 200／video/mp4／22,153,464 bytes，Range 0-1023 回 206／1,024 bytes，支援快速載入與跳轉。沒有覆蓋原有 5 課影片。
