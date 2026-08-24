# 名片掃描立即顯示辨識進度

﻿# 單次變更工作單模板

用途：每次修改功能前，先複製本模板到任務紀錄、PR 說明或 issue。  
原則：先確認規格與風險，再改程式；改完後必跑 regression。

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-24 |
| 需求來源 | 使用者提供掃描影片，要求拍照後立即顯示旋轉圈與辨識中狀態 |
| 目標功能 | 名片掃描立即顯示辨識進度 |
| 起始 commit | 69c4b47 |
| 預計修改檔案 | js/modules/a-kaffit-card-scanner-adapter.js, index.html, tools/check-a-kaffit-full-card-workflow.js, this work order |
| 是否部署 | 是（GitHub Pages） |
| 回復點 / tag |  |

## 2. 本次只允許改什麼

```text
- 收藏名片拍照或選圖後，立即沿用現有 OCR 旋轉進度視窗。
- 在原圖上傳與壓縮階段顯示清楚訊息，並讓兩者同步開始以縮短前段等待；準備完成後回到既有確認流程。
- 只新增對應靜態合約與前端 cache-bust。
```

## 3. 本次禁止碰什麼

```text
- 不改 OCR API、AI 提示詞、原圖保存、處理結果儲存順序或名片儲存流程。
- 不改 UID、owner、scannedBy、點數、LINE OA、LIFF 或公開池。
- 不改 Worker、D1、migration 或正式資料。
- 未收到部署要求前不提交、不推送、不部署。
```

## 4. 影響流程

- [ ] 我的名片
- [ ] AI名片夾
- [x] 名片 OCR / 收錄名單
- [ ] 名片版本：標準 / 滿版 / 正方 / 影音
- [ ] LINE OA keyword
- [ ] LIFF route
- [ ] 分享 / 推播 / shareTargetPicker
- [ ] 點數 / 優惠券 / 發訊免費傳送
- [ ] 收件匣
- [ ] 跟進
- [ ] 公開池 / AI配對
- [ ] 後台 CRM / 權限
- [x] 其他：掃描後即時進度回饋

## 5. 修改前必跑

```powershell
npm run guard:before
```

結果：

```text
PASS：完整修改前 smoke contracts 通過。
```

若 FAIL：停止，不修改程式，先修復既有破損或回報。

## 6. 必讀規格

按本次影響範圍勾選：

- [x] `docs/rules/core-invariants.md`
- [ ] `docs/flows/my-card.md`
- [ ] `docs/flows/ai-card-folder.md`
- [ ] `docs/data/card-ownership-and-versioning.md`
- [ ] `docs/contracts/line-keywords.md`
- [ ] `docs/contracts/liff-routes.md`
- [x] `docs/contracts/card-resolvers.md`
- [ ] `docs/contracts/button-actions.md`
- [ ] `docs/contracts/points-ledger.md`
- [x] `docs/tests/regression-matrix.md`

## 7. 不變規則確認

- [x] 一個 UID 只能解析到自己的「我的名片」。
- [x] AI名片夾掃入名片不可變成本人名片。
- [x] 標準、滿版、正方、影音四種版本互不覆蓋。
- [x] `scannedBy`、推薦人、歸屬網不可被姓名或電話覆蓋。
- [x] 無推薦人時可 fallback 到 admin，但必須可標記。
- [x] 分享按鈕、傳送按鈕、網頁版按鈕各走自己的路徑。
- [x] 發訊與優惠券免費傳送，不扣發送者點數。
- [x] 消費折抵只使用手動輸入折抵點數。

## 8. 實作紀錄

實際修改檔案：

```text
js/modules/a-kaffit-card-scanner-adapter.js
index.html
tools/check-a-kaffit-full-card-workflow.js
docs/release/work-orders/2026-08-24-card-scan-immediate-progress.md
```

關鍵決策：

```text
- 照片選取後立即顯示既有旋轉進度圈，不另造重複 UI。
- 等待兩個繪製幀，確保進度圈先於圖片處理呈現。
- 原圖上傳與本機壓縮同步開始；處理結果儲存、AI OCR 與人工確認順序不變。
- 失敗時一定關閉進度圈並保留既有錯誤提示。
- 前端模組版本提升至 3.2，避免使用者讀到舊快取。
```

## 9. 修改後必跑

```powershell
npm run guard:after
```

結果：

```text
PASS：完整修改前 smoke contracts 通過。
```

## 10. 人工驗證

依需求填入實測項目：

| 測試項目 | 測試帳號 / UID | 結果 | 備註 |
| --- | --- | --- | --- |
| 選圖後第一時間回饋 | 靜態流程合約 | PASS | 先顯示旋轉圈，再開始上傳與壓縮 |
| 初始等待縮短 | 靜態流程合約 | PASS | 原圖上傳與本機壓縮改為同步開始 |
| Android 原生相機 | 專項合約 | PASS | 相機 input、後鏡頭與 onchange 流程不變 |
| 單次 OCR 與儲存順序 | 完整流程合約 | PASS | 維持單次 Vision、確認後送出、審閱後儲存 |

## 11. 上線判斷

- [x] guard before 通過。
- [x] guard after 通過。
- [x] 修改範圍符合第 2 節。
- [x] 沒有碰第 3 節禁止區域。
- [x] 已確認是否需要部署 Worker / Pages。

結論：

```text
可部署：前端調整、專項測試與完整回歸已通過；本次透過 main 更新 GitHub Pages。Worker 與 D1 均無此項變更。
```
