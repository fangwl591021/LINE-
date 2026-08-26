# iOS首頁快捷文字放大與LINE好友入口

﻿# 單次變更工作單模板

用途：每次修改功能前，先複製本模板到任務紀錄、PR 說明或 issue。  
原則：先確認規格與風險，再改程式；改完後必跑 regression。

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-25 |
| 需求來源 | 使用者以首頁快捷列截圖指定放大範圍，並要求將會員註冊改為加LINE好友 |
| 目標功能 | iOS首頁快捷文字放大與LINE好友入口 |
| 起始 commit | a8f4042 |
| 預計修改檔案 | index.html, css/styles.css, tools/check-ios-font-scale-contract.js, tools/check-home-service-menu-contract.js, this work order |
| 是否部署 | 是（GitHub Pages） |
| 回復點 / tag |  |

## 2. 本次只允許改什麼

```text
- 移除前一版 iOS 全站 108% 文字縮放。
- 只將截圖所示首頁第一排四個快捷標籤在 iOS 放大為 13px。
- 將該排「會員註冊」改為「加LINE好友」，連結固定為 https://lin.ee/SGdgLJk。
- 更新相關首頁與 iOS 靜態契約及 CSS 快取版號。
```

## 3. 本次禁止碰什麼

```text
- 不放大其他 iOS 文字、圖示或容器。
- 不修改其他會員註冊／資料維護入口。
- 不改 UID、card owner、scannedBy、點數、Worker、D1、LINE OA keyword 或 LIFF route。
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
- [x] 其他：iOS 首頁第一排快捷標籤與加LINE好友入口

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
tools/check-home-service-menu-contract.js
docs/release/work-orders/2026-08-25-ios-home-shortcut-font-line-friend.md
```

關鍵決策：

```text
- 保留 iOS 裝置辨識，只移除全站 108% 縮放。
- 對截圖指定的四個標籤加上專用 class，僅 iOS 套用 13px；第二排與圖示不變。
- 使用原生安全 anchor 將「加LINE好友」連至使用者指定的 https://lin.ee/SGdgLJk。
- styles.css 快取版號由 7.5 提升為 7.6。
```

## 9. 修改後必跑

```powershell
npm run guard:after
```

結果：

```text
PASS：iOS 字級、首頁服務選單與完整既有 smoke contracts 全數通過；git diff --check 通過。
```

## 10. 人工驗證

依需求填入實測項目：

| 測試項目 | 測試帳號 / UID | 結果 | 備註 |
| --- | --- | --- | --- |
| iOS 全站縮放移除 | 靜態契約 | PASS | 其他 iOS 文字恢復原尺寸 |
| 截圖四個快捷標籤 | 靜態契約 | PASS | 僅 iOS 由 11px 改為 13px |
| 快捷圖示及第二排 | 靜態契約 | PASS | 不套用放大 class |
| 加LINE好友文字 | 靜態契約 | PASS | 取代截圖中的會員註冊 |
| 加LINE好友連結 | 靜態契約 | PASS | `https://lin.ee/SGdgLJk`，noopener noreferrer |
| CSS 快取更新 | 靜態契約 | PASS | `styles.css?v=7.6` |

## 11. 上線判斷

- [x] guard before 通過。
- [x] guard after 通過。
- [x] 修改範圍符合第 2 節。
- [x] 沒有碰第 3 節禁止區域。
- [x] 已確認是否需要部署 Worker / Pages。

結論：

```text
可部署：指定首頁四個快捷標籤與加LINE好友入口已完成並通過驗證；使用者已明確要求發布至 GitHub Pages。Worker 與 D1 均無變更。
```
