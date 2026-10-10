# 活動／課程核銷兩支教學上架

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-10-10（臺北） |
| 需求來源 | 使用者「上架教學區」 |
| 目標功能 | 新手教學新增報名者接受核銷、主辦人核銷報名者兩課 |
| 起始 commit／回復點 | 4a4b94785df0388d3ec0121b90e9ca0c17b1da70 |
| 分支 | codex/checkin-tutorial-publish-20261010 |
| 預計修改檔案 | tutorial-center.js、index.html 的教學模組版本、教學合約及相關測試 |
| 是否部署 | 是；只發布新 R2 媒體與 GitHub Pages 前端 |

## 2. 本次只允許改什麼

原九課之後依序新增兩課，章節直接採已完成成片的量測資料。媒體使用平台 linengine 桶既有公開網域，新增 tutorials/2026-10-10/ 版本路徑；不覆蓋已上架影片或本機原檔。保留原九課全部 metadata 與播放器行為。

## 3. 本次禁止碰什麼

登入、LINE UID、歸屬、公開權限、活動／課程／報名／核銷實作、點數、LINE 通知、Worker、D1、KV、R2 配置、金鑰、部署工作流程。影片使用合成資料，不操作正式報名或核銷。

## 4. 影響流程

- [x] 其他：唯讀新手教學清單、影片播放及章節跳轉。

## 5. 修改前必跑

`node tools/run-change-guard.js before`：PASS。完整紀錄在 C:/Users/User/AppData/Local/Temp/checkin-tutorial-guard-before-20261010.log。

## 6. 必讀規格

已讀 core-invariants、feature-change-protocol、regression-matrix、deployment-runbook、tutorial-center 合約、work-order 模板與 Pages／Contract Guard 工作流程。使用 Wrangler 技能確認現有 4.149.0 CLI、OAuth 帳號及 linengine 公開 URL，沒有更新 CLI 或申請新金鑰。

參考 [Cloudflare R2 CLI](https://developers.cloudflare.com/workers/wrangler/commands/r2/) 與 [R2 權限](https://developers.cloudflare.com/r2/api/tokens/)。本次只使用既有已授權帳號向已確認的 linengine 桶新增兩個物件。

## 7. 不變規則確認

教學開啟不改身分、表單草稿、活動或點數。清單不預載影片、不自動播放，關閉／返回停止媒體，焦點回到原入口。只示範會員自建活動／課程 QR，不將其混同商城點數 QR 或官方活動流程。

## 8. 實作紀錄

兩支素材於前一製作任務完成原生剪輯與整段解碼、手機／桌面播放驗證。

| 課程 | 片長 | bytes | SHA256 |
| --- | --- | --- | --- |
| 報名者接受核銷 | 125.919 秒（2:06） | 8505081 | c84925677b45b6548156f6144c40858f2e39d74d1929ecf8f007b233779da3ac |
| 主辦人核銷報名者 | 143.625 秒（2:24） | 9362497 | 19eb90ff17e4820637b0af7de7f8f3e11b05c016de08a6beb0c4bea7ae5e05b4 |

格式皆為 720×1600、24fps、H.264＋AAC，臺灣中文旁白搭配固定步驟標示，不宣稱逐字語音字幕。真實已發布 UI 搭配虛構會員與隔離 API 回應；測試相機串流由原平台 QR 解碼器辨識。正式報名／核銷寫入 0 筆，不等同真人手機相機驗收。

上傳前兩個全新媒體公開路徑均回 404。原九課完整 metadata SHA256 為 3c7a17942e387bce6366c6be58498627a9ad0010fe276ac7f5b52b6e07226958，將加入合約測試以防修改原課程。

## 9. 修改後必跑

- full guard after：PASS，C:/Users/User/AppData/Local/Temp/checkin-tutorial-guard-after-20261010.log。
- 教學靜態合約 7/7、JS 語法與 git diff --check：PASS。原九課完整 metadata 雜湊不變。
- 兩支影片公開 URL HEAD 200／video/mp4、正確 bytes／immutable cache，Range 0–1023 回 206／1024 bytes，全檔 SHA256 與成品一致。
- 媒體證據：C:/Users/User/.codex/visualizations/2026/08/24/01a03430-08fc-7dd2-9cff-51f0c9b9a81d/checkin-tutorials-20261009/published-media-evidence-20261010.json。

## 10. 人工驗證

真 Chrome、320／390／768／1366 px：十一課清單、新兩課及既有設定影片的實際播放與聲音解碼、量測章節跳轉、無自動播放／溢出、關閉停止聲音、焦點／草稿保留、背景暫停、載入失敗可重試均 PASS。

瀏覽器使用實際 HTML／CSS／教學模組的隔離唯讀預覽，公開 R2 媒體真實載入，不載入登入或業務 API。正式業務資料寫入 0 筆；不等同實體 LINE／iPhone／Safari 驗收。完整紀錄：C:/Users/User/AppData/Local/Temp/checkin-tutorial-browser-20261010.log。390 px 兩課播放器已人工檢視，證據在 .wrangler/tutorial-proof/{attendee,organizer}-checkin-390.png。

## 11. 上線判斷

使用者已授權上架，before／after guard、影片驗證與播放器檢查均通過，允許發布前端。待 PR CI 通過後合併，等待 Pages 正式發布，再比對正式檔案與媒體。不部署 Worker、不跑 migrations、不改配置或 secrets。
