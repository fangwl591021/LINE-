# Align home network headings with icons

﻿# 單次變更工作單模板

用途：每次修改功能前，先複製本模板到任務紀錄、PR 說明或 issue。
原則：先確認規格與風險，再改程式；改完後必跑 regression。

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-24 |
| 需求來源 | 使用者截圖回報：兩個人脈標題位置不一致，下方也需要圖示 |
| 目標功能 | Align home network headings with icons |
| 起始 commit | 3cfa548 |
| 預計修改檔案 | `index.html`、`tools/check-home-design-contract.js`、本工單 |
| 是否部署 | 是（2026-08-24 使用者授權） |
| 回復點 / tag |  |

## 2. 本次只允許改什麼

```text
- 在「你現在想找誰？」前方加入 24px 搜尋圖示。
- 使用與上方卡片相同的 px-4、gap-3 與頂部對齊。
- 補上圖示與對齊 class 契約。
```

## 3. 本次禁止碰什麼

```text
- 不改兩個區塊順序、字級、文字、onclick、搜尋範圍與動態關注邏輯。
- 不改 Worker、D1、UID、名片、AI 媒合、點數與 LINE 邏輯。
- 不夾帶未經驗證或與本次授權無關的變更。
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
- [x] 其他：首頁人脈標題圖示與對齊

## 5. 修改前必跑

```powershell
npm run guard:before
```

結果：

```text
PASS / FAIL: PASS
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
tools/check-home-design-contract.js
docs/release/work-orders/2026-08-24-home-search-icon-alignment.md
```

關鍵決策：

```text
- 下方標題加入 24px search 圖示，並使用與上方相同的 px-4、gap-3、items-start。
- 不移動範圍按鈕與輸入框，不改任何動態邏輯。
```

## 9. 修改後必跑

```powershell
npm run guard:after
```

結果：

```text
PASS / FAIL: PASS
```

## 10. 人工驗證

依需求填入實測項目：

| 測試項目 | 測試帳號 / UID | 結果 | 備註 |
| --- | --- | --- | --- |
| 首頁兩個人脈標題圖示與起點對齊 | 不涉及帳號 | PASS | 首頁契約、AI 關注契約與完整 guard 通過 |

## 11. 上線判斷

- [x] guard before 通過。
- [x] guard after 通過。
- [x] 修改範圍符合第 2 節。
- [x] 沒有碰第 3 節禁止區域。
- [x] 已確認是否需要部署 Worker / Pages。

結論：

```text
可部署：修改與完整驗證已通過，並已收到使用者部署授權。
```
