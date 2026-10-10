# 教學分類與贈點／折抵影片上架

- 日期：2026-10-10
- 需求：上架兩支已製作影片；分類教學，避免清單過長。
- 基準：origin/main `04b670bff685336439b7cf38d848c1c776f358c9`
- 分支：`codex/tutorial-categories-points-20261010`
- 部署：僅 GitHub Pages 前端與 linengine R2 新版本影片，不部署 Worker。

## 允許範圍

`js/modules/tutorial-center.js`、`css/tutorial-center.css`、`index.html` 的教學資源版本、`test/tutorial-center.test.mjs`、`test/browser/tutorial-center-smoke.cjs`、教學 contract 與本工作單。

四分類：會員與名片（3）、店家與點數（3）、活動與課程（6）、AI任務（1）。首次開啟預設會員與名片，不列出全部 13 支；切換分類不載入影片，從播放器返回保留分類及焦點。原 11 支媒體與完整 metadata 不變，分類使用獨立 mapping。

## 禁止範圍

不修改 Worker、LIFF/OAuth、會員身分、權限、點數帳本、正式報名／核銷、資料庫、bindings、secrets。既有未追蹤檔案保留；影片原始碼備份分支不合併本次前端 release。

## 已讀契約

`docs/contracts/tutorial-center.md`、`docs/rules/core-invariants.md`、`docs/release/feature-change-protocol.md`、`docs/tests/regression-matrix.md`、`docs/deployment-runbook.md`。

## 驗證與回復

- before：`node tools/run-change-guard.js before` PASS，修改前完成。
- after：`node tools/run-change-guard.js after` PASS；教學 unit 9/9 PASS。
- R2：帳號 `8058cf61f0cd44c4edd78080b193033a`，bucket `linengine`；兩個新 key 上傳前 HEAD 404；檢查 Content-Type、大小、Range 206 與 SHA256。
- UI：320、390、768、1366px 全部 PASS；四分類涵蓋 13 支且無重複、切分類 0 影片請求、鍵盤 Space、返回同分類／影片焦點、無自動播放／背景音、重試與原表單保留。新影片與既有名片／店家／設定／核銷影片實際播放、聲音解碼及章節跳轉 PASS，390px 截圖已視覺檢查。
- 正式驗證：Pages served HTML/JS/CSS exact Git blob hash、分類與新影片播放。
- 回復：revert 本功能 commit；新增版本 R2 物件留存，不覆寫舊檔。
- 正式業務資料寫入：0。

## R2 已驗證

| 影片 | 時長 | 大小 | SHA256 |
| --- | --- | --- | --- |
| 店家贈點 | 142.542s | 9691249 | c7bcaa93e04ad9d73ec05cae608cb55559da52909ef1d26c69ac0ddc60142a3f |
| 點數折抵 | 180.336s | 12103097 | 4f0578b21751a751f9a0d4c64b720e77ee652168255ae8708d1c0ed49bcf4faf |

兩個 `tutorials/2026-10-10/*-tutorial-v1.mp4` 新物件上傳完成；HEAD 200、video/mp4、完整下載 SHA256 與原檔相同、bytes 0-1023 HTTP Range 206 PASS。舊媒體沒有覆寫。

可部署：測試全數通過；Pages 推送後仍須查正式 served bytes 與播放。實測紀錄：本機 `.wrangler/tutorial-guard-after.log`、`.wrangler/tutorial-proof/`；影片交付目錄 `points-tutorials-20261010/published-media-evidence.json`。真實 LINE WebView 與實機收銀不在本次教學上架验收內。
