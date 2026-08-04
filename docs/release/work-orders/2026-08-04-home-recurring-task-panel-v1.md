# 首頁每日／每週待辦開合區塊 V1

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-04 |
| 需求來源 | Tony／首頁行動儀表板 |
| 目標功能 | 在首頁AI服務上方加入每日／每週待辦開合區塊 |
| 起始 commit | 28d1c49 |
| 預計修改檔案 | `migrations/0015_personal_task_recurrence.sql`、`workerbackup.js`、`js/modules/home.js`、`index.html`、本功能新增的 focused contract checker、`docs/contracts/change-risk-map.json`、`docs/tests/regression-matrix.md` |
| 是否部署 | 否 |
| 回復點 / tag | 28d1c49 |

## 2. 本次只允許改什麼

- 個人任務增加 none、daily、weekly 三種 recurrence type。
- 循環任務以 occurrence 紀錄單次完成狀態。
- 跟進行事曆增加不重複／每日／每週選項。
- 首頁AI服務上方增加今日／本週待辦開合區塊。
- 首頁只顯示今日3筆、本週稍後2筆及剩餘數量。
- 首頁可完成當次任務並進入完整跟進行事曆。
- 時區固定 Asia/Taipei。

## 3. 本次禁止碰什麼

- 不做每月、自選多星期、每兩週或 recurrence end date。
- 不做Google雙向同步。
- 不做LINE主動提醒。
- 不改UID、身份驗證、推薦人、名片歸屬或租戶邊界。
- 不改點數、優惠券、收件匣收件人或商城。
- 不改LIFF、Webhook、LINE OA keyword。
- 不改Secret、Binding或正式Worker設定。
- 不部署。
- 不執行Remote D1 migration。
- 不碰既有untracked檔案。
- 不順手重構其他功能。

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
- [x] 跟進
- [ ] 公開池 / AI配對
- [ ] 後台 CRM / 權限
- [x] 其他：首頁入口／個人循環待辦

## 5. 修改前必跑

本輪不執行 `npm run guard:before`，留給下一個微任務。

## 6. 必讀規格

- [x] `docs/rules/core-invariants.md`
- [x] `docs/tests/regression-matrix.md`

## 7. 不變規則確認

- [ ] 一個 UID 只能解析到自己的「我的名片」。
- [ ] AI名片夾掃入名片不可變成本人名片。
- [ ] 標準、滿版、正方、影音四種版本互不覆蓋。
- [ ] `scannedBy`、推薦人、歸屬網不可被姓名或電話覆蓋。
- [ ] 無推薦人時可 fallback 到 admin，但必須可標記。
- [ ] 分享按鈕、傳送按鈕、網頁版按鈕各走自己的路徑。
- [ ] 發訊與優惠券免費傳送，不扣發送者點數。
- [ ] 消費折抵只使用手動輸入折抵點數。
- [ ] 任務只能由目前登入UID讀取與完成。
- [ ] 循環任務完成當次occurrence，不可把主任務永久設為done。

## 8. 實作紀錄

實際修改檔案：

```text

```

關鍵決策：

```text

```

## 9. 修改後必跑

```powershell
npm run guard:after
```

結果：

```text
PASS / FAIL:
```

## 10. 人工驗證

| 測試項目 | 測試帳號 / UID | 結果 | 備註 |
| --- | --- | --- | --- |
|  |  |  |  |

## 11. 上線判斷

- [ ] guard before 通過。
- [ ] guard after 通過。
- [ ] 修改範圍符合第 2 節。
- [ ] 沒有碰第 3 節禁止區域。
- [ ] 已確認是否需要部署 Worker / Pages。

結論：

```text
可部署 / 不可部署 / 僅本機完成：
```