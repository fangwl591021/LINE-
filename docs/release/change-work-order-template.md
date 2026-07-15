# 單次變更工作單模板

用途：每次修改功能前，先複製本模板到任務紀錄、PR 說明或 issue。  
原則：先確認規格與風險，再改程式；改完後必跑 regression。

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 |  |
| 需求來源 |  |
| 目標功能 |  |
| 起始 commit |  |
| 預計修改檔案 |  |
| 是否部署 | 否 |
| 回復點 / tag |  |

## 2. 本次只允許改什麼

```text
例如：
- 只修改「我的名片」入口跳轉。
- 不修改 AI名片夾、名片 OCR、點數、LINE OA keyword。
```

## 3. 本次禁止碰什麼

```text
例如：
- 不改 UID resolver。
- 不改 card owner / scannedBy。
- 不改點數 ledger。
- 不改正式 Worker secrets。
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
- [ ] 其他：

## 5. 修改前必跑

```powershell
npm run guard:before
```

結果：

```text
PASS / FAIL:
```

若 FAIL：停止，不修改程式，先修復既有破損或回報。

## 6. 必讀規格

按本次影響範圍勾選：

- [ ] `docs/rules/core-invariants.md`
- [ ] `docs/flows/my-card.md`
- [ ] `docs/flows/ai-card-folder.md`
- [ ] `docs/data/card-ownership-and-versioning.md`
- [ ] `docs/contracts/line-keywords.md`
- [ ] `docs/contracts/liff-routes.md`
- [ ] `docs/contracts/card-resolvers.md`
- [ ] `docs/contracts/button-actions.md`
- [ ] `docs/contracts/points-ledger.md`
- [ ] `docs/tests/regression-matrix.md`

## 7. 不變規則確認

- [ ] 一個 UID 只能解析到自己的「我的名片」。
- [ ] AI名片夾掃入名片不可變成本人名片。
- [ ] 標準、滿版、正方、影音四種版本互不覆蓋。
- [ ] `scannedBy`、推薦人、歸屬網不可被姓名或電話覆蓋。
- [ ] 無推薦人時可 fallback 到 admin，但必須可標記。
- [ ] 分享按鈕、傳送按鈕、網頁版按鈕各走自己的路徑。
- [ ] 發訊與優惠券免費傳送，不扣發送者點數。
- [ ] 消費折抵只使用手動輸入折抵點數。

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

依需求填入實測項目：

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
