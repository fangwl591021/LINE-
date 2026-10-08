# 活動、課程、聯誼三支教學上架

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-10-09 |
| 需求來源 | 使用者「這幾個上架教學區」 |
| 目標功能 | 新手教學新增已完成的活動、課程、聯誼設定影片 |
| 起始 commit | 3fd63359ff0bc87022941bb2b0dc695d42c6ea2b |
| 預計修改檔案 | tutorial-center.js、index.html 的教學模組版本、教學合約及相關測試 |
| 是否部署 | 是；只發布新媒體與 GitHub Pages 前端 |
| 回復點 | 上述 commit；不移除或覆蓋既有影片 |

## 2. 本次只允許改什麼

新手教學清單新增三課，依活動、課程、聯誼排序。章節採成品 edit manifest；媒體沿用平台既有公開 R2 路徑，使用 2026-10-09 新版本檔名。保留原六課的所有內容與連結。

## 3. 本次禁止碰什麼

登入、UID resolver、會員歸屬、名片、活動公開權限或編輯流程、點數、LINE 通知、Worker、D1、KV、金鑰與部署設定。

## 4. 影響流程

- [x] 其他：唯讀新手教學清單、播放與章節跳轉。

## 5. 修改前必跑

`node tools/run-change-guard.js before`：PASS。紀錄：`C:/Users/User/AppData/Local/Temp/tutorial-series-guard-before-20261009.log`。

## 6. 必讀規格

已讀 core-invariants、feature-change-protocol、regression-matrix、deployment-runbook、tutorial-center 合約及 Pages/Contract Guard 工作流程。風險查詢未列 tutorial 專區，直接採用既有 tutorial-center 合約與 full guard 中的教學測試。

## 7. 不變規則確認

只提供唯讀教學；不建立活動、報名、收款或點數交易。教學開啟不改身分、草稿、導覽或公開規則。清單不預載影片，使用者選課後才載入；關閉停止媒體。

## 8. 實作紀錄

三支教學來源皆為真實前端搭配虛構資料及隔離 API 回應，不是正式業務操作實錄。

| 課程 | 成品片長 | SHA256 |
| --- | --- | --- |
| 活動設定 | 287.793 秒，4:48 | ecd209b8d90048fcfe62d3c2b5de7574ff751158249f34d9110cd4c63eb8cad3 |
| 課程設定 | 250.168 秒，4:10 | 7ccf80ce7b9dedfd05bd9b528915f70a07392a50643f2fe84e53270d109ebcce |
| 聯誼設定 | 253.125 秒，4:13 | 3f0be1c7e3113e0413667ee31f31c490ebe862c7683bfe3fd90043941b44ce7d |

三支成品已發布到 `linengine/tutorials/2026-10-09/{activity,course,social}-settings-tutorial-v1.mp4`，上傳前各路徑確認 404。全檔 GET SHA256 與本機成品一致，HEAD 200／video/mp4，Range 0–1023 回 206／1024 bytes。原六課不變。

更新 `tutorial-center.js` 新增三課與量測章節，`index.html` 只把教學模組版本 v5 改為 v6，更新教學合約與靜態／瀏覽器測試。既有瀏覽器測試的舊五課計數同步改為九課。

## 9. 修改後必跑

- full guard after：PASS；繁體用字修正後完整重跑仍 PASS。紀錄：`C:/Users/User/AppData/Local/Temp/tutorial-series-guard-after-20261009.log`。
- 教學靜態合約：6/6 PASS；`node --check`、`git diff --check` PASS。
- 真 Chrome、320／390／768／1366 px：九課清單、三支新媒體的實際播放／聲音解碼、公開章節跳轉、無自動播放、無溢出、返回清單／關閉停止音訊、焦點回復、原表單草稿保留、背景暫停、載入失敗重試 PASS。
- 瀏覽器使用實際 HTML／CSS／教學模組的隔離唯讀預覽，公開 R2 媒體真實載入，沒有登入、業務 API 或正式資料寫入。不等同實體 LINE／iPhone／Safari 驗收。

## 10. 人工驗證

320／390／768／1366 px 清單與播放器無溢出；三支新增影片可播放且原六課未改。媒體驗證紀錄：`C:/Users/User/AppData/Local/Temp/tutorial-series-publish-20261009/media-evidence.json`。390 px 播放器截圖：`.wrangler/tutorial-proof/{activity,course,social}-settings-390.png`。

正式 Pages 發布與版本／內容驗證待 PR 合併後執行。

## 11. 上線判斷

使用者已授權上架。只在 guard after 與播放驗收通過後發布前端；不部署 Worker、不跑 migrations、不寫正式活動或報名。
