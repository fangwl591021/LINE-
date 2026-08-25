# iOS介面文字放大一級

﻿# 單次變更工作單模板

用途：每次修改功能前，先複製本模板到任務紀錄、PR 說明或 issue。  
原則：先確認規格與風險，再改程式；改完後必跑 regression。

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-25 |
| 需求來源 | 使用者要求 iOS 字體放大一級 |
| 目標功能 | iOS介面文字放大一級 |
| 起始 commit | 87237fa |
| 預計修改檔案 | index.html, css/styles.css, tools/check-ios-font-scale-contract.js, tools/run-smoke-contracts.js, this work order |
| 是否部署 | 是（GitHub Pages） |
| 回復點 / tag |  |

## 2. 本次只允許改什麼

```text
- 精準辨識 iPhone、iPad、iPod 與 iPadOS 桌面型 user agent。
- 僅對 iOS 根節點套用 108% 文字縮放，約等於放大一級。
- 覆寫首頁快捷按鈕既有 100% 文字縮放，讓 iOS 規則一致生效。
- 提升 styles.css 快取版本並新增靜態合約。
```

## 3. 本次禁止碰什麼

```text
- 不改 Android、桌面版或一般瀏覽器字級。
- 不放大 Material Symbols 圖示、圖片或容器尺寸。
- 不改登入、UID、名片、點數、LINE OA、Worker、D1 或 LIFF 路由。
- 僅在使用者明確要求後提交、推送與部署（後續訊息已明確要求部署）。
```

## 4. 影響流程

- [ ] 我的名片
- [ ] AI名片夾
- [ ] 名片 OCR / 收錄名單
- [ ] 名片版本：標準 / 滿版 / 正方 / 影音
- [ ] LINE OA keyword
- [ ] LIFF route
- [ ] 分享 / 推播 / shareTargetPicker
- [ ] 點數 / 優惠券 / 發訊免費傳送
- [ ] 收件匣
- [ ] 跟進
- [ ] 公開池 / AI配對
- [ ] 後台 CRM / 權限
- [x] 其他：iOS 全站文字顯示

## 5. 修改前必跑

```powershell
npm run guard:before
```

結果：

```text
PASS：完整既有 smoke contracts 全數通過。
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
- [ ] `docs/contracts/card-resolvers.md`
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
index.html
css/styles.css
tools/check-ios-font-scale-contract.js
tools/run-smoke-contracts.js
docs/release/work-orders/2026-08-25-ios-font-one-step.md
```

關鍵決策：

```text
- 在 CSS 載入前辨識 iOS，避免頁面先以舊字級閃現。
- 同時涵蓋 iPhone/iPad/iPod 與 iPadOS 的 MacIntel + 觸控回報方式。
- 以 108% text-size-adjust 放大文字，不更動既有元件尺寸；Material Symbols 明確維持 100%。
- styles.css 快取版號由 7.4 提升為 7.5。
```

## 9. 修改後必跑

```powershell
npm run guard:after
```

結果：

```text
PASS：新增 iOS 字級契約與完整既有 smoke contracts 全數通過；git diff --check 通過。
```

## 10. 人工驗證

依需求填入實測項目：

| 測試項目 | 測試帳號 / UID | 結果 | 備註 |
| --- | --- | --- | --- |
| iPhone/iPad/iPod UA 判斷 | 靜態契約 | PASS | 只加入 `is-ios` 根節點標記 |
| iPadOS 桌面型 UA 判斷 | 靜態契約 | PASS | MacIntel 且 maxTouchPoints > 1 |
| iOS 字級放大 | 靜態契約 | PASS | 全站文字 108% |
| 首頁快捷按鈕 | 靜態契約 | PASS | 覆寫原有 100% 文字鎖定為 108% |
| Material Symbols | 靜態契約 | PASS | 圖示維持 100%，不跟著放大 |
| Android / 桌面瀏覽器 | 靜態契約 | PASS | 未取得 `is-ios`，不套用新規則 |
| CSS 快取更新 | 靜態契約 | PASS | `styles.css?v=7.5` |

## 11. 上線判斷

- [x] guard before 通過。
- [x] guard after 通過。
- [x] 修改範圍符合第 2 節。
- [x] 沒有碰第 3 節禁止區域。
- [x] 已確認是否需要部署 Worker / Pages。

結論：

```text
可部署：iOS 文字放大一級與完整驗證已通過；使用者已明確要求發布至 GitHub Pages。Worker 與 D1 均無變更。
```
