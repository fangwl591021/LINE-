# 變更與發版檢查表

每次修改 AI工坊專案前，先複製本檢查表到當次任務紀錄，或直接在 PR / commit 說明中填寫。若本次修改碰到 UID、名片、點數、LIFF、Webhook，這份檢查表必填。

## 1. 變更基本資料

| 項目 | 內容 |
| --- | --- |
| 日期 |  |
| 操作者 |  |
| 分支 |  |
| 起始 commit |  |
| 目標 Worker / Pages |  |
| 是否正式部署 | 是 / 否 |
| 回復 commit |  |

## 2. 變更範圍

本次修改涉及：

- [ ] 我的名片
- [ ] AI名片夾
- [ ] 影音名片
- [ ] 名片版本 resolver
- [ ] UID / 推薦人 / 歸屬網
- [ ] 掃描名片 / OCR
- [ ] 公開池 / AI配對
- [ ] 發訊
- [ ] 優惠券
- [ ] 點數
- [ ] 收件匣
- [ ] 跟進
- [ ] LIFF
- [ ] LINE OA webhook
- [ ] 後台 CRM
- [ ] 其他：

## 3. 必讀文件

修改前已閱讀：

- [ ] `docs/rules/core-invariants.md`
- [ ] `docs/flows/my-card.md`
- [ ] `docs/flows/ai-card-folder.md`
- [ ] `docs/data/card-ownership-and-versioning.md`
- [ ] `docs/tests/regression-matrix.md`

本次若未閱讀某文件，原因：

```text

```

## 4. 高風險確認

### UID 與歸屬

- [ ] 不會把 A 的我的名片顯示成 B 的名片。
- [ ] 不會把 AI名片夾掃入名片當成本人名片。
- [ ] 不會清空 `scannedBy` 或原始掃描者紀錄。
- [ ] 不會用姓名、電話、公司名稱直接覆蓋 UID。
- [ ] 無推薦人時仍會保留 admin fallback 標記。

### 名片版本

- [ ] 標準版不會覆蓋滿版。
- [ ] 滿版不會覆蓋正方版。
- [ ] 影音版不會覆蓋靜態封面。
- [ ] 關鍵字「我的名片」只顯示靜態名片。
- [ ] 關鍵字「影音名片」只顯示影音名片。

### 點數

- [ ] 發訊扣 10 點。
- [ ] 優惠券扣 10 點。
- [ ] 消費折抵使用手動輸入折抵點數。
- [ ] 母站與子站點數不會顯示不同帳本。
- [ ] 點數異動有紀錄可查。

### LINE / LIFF / Webhook

- [ ] shareTargetPicker 只在具備正確 scope 的 LIFF 使用。
- [ ] Web 版網址不呼叫 LINE-only API。
- [ ] LINE OA webhook keyword 不被其他流程攔截。
- [ ] 新用戶不會被強制跳註冊頁。
- [ ] Flex 推播按鈕與後台設定一致。

## 5. 本次資料寫入點

列出本次會新增、修改或刪除的資料來源：

```text
例如：
- D1 table:
- KV key:
- R2 path:
- localStorage:
- URL query:
```

## 6. 本次 API / 路由影響

列出本次會影響的 API、LIFF 或 webhook：

```text
例如：
- /line-webhook keyword: 我的名片
- /api/cards/:id
- ?mode=wysiwyg-card
```

## 7. 必跑回歸測試

先列出目前完整 smoke contract：

```powershell
node tools/run-smoke-contracts.js --list --full
```

依 `docs/tests/regression-matrix.md` 填入測試編號：

```text
例如：
MY-01, MY-02, CV-01, CV-04, AF-01, OW-01
```

測試結果：

| 測試編號 | 結果 | 備註 |
| --- | --- | --- |
|  |  |  |

## 8. 手機實測

至少確認：

- [ ] Android LINE 內建瀏覽器
- [ ] iPhone LINE 內建瀏覽器
- [ ] 一般手機瀏覽器
- [ ] 桌機瀏覽器

若未測，原因：

```text

```

## 9. 部署前確認

- [ ] 已確認 git diff 只有本次範圍。
- [ ] 已確認沒有改到不相關流程。
- [ ] 已確認正式 Worker / 測試 Worker 目標正確。
- [ ] 已確認 GitHub Pages 或 raw HTML 快取版本。
- [ ] 已確認可回復 commit。

## 10. 回復計畫

若部署後異常，回復方式：

```text
1.
2.
3.
```

回復後要驗證：

- [ ] 首頁可進
- [ ] 我的名片正常
- [ ] AI名片夾正常
- [ ] 點數正常
- [ ] LINE OA webhook 正常

## 11. 發版紀錄

```text
本次變更摘要：

實測結果：

已知風險：

下一步：
```
# Change Guard

Run before functional edits:

```powershell
node tools/run-change-guard.js before
```

Run after functional edits:

```powershell
node tools/run-change-guard.js after
```

Do not deploy if either guard fails.
