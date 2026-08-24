# Business Richman public pool and game pacing

﻿# 單次變更工作單模板

用途：每次修改功能前，先複製本模板到任務紀錄、PR 說明或 issue。
原則：先確認規格與風險，再改程式；改完後必跑 regression。

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-24 |
| 需求來源 | User feedback: game movement is too fast and board should include public information |
| 目標功能 | Business Richman public pool and game pacing |
| 起始 commit | f39fcc6 |
| 預計修改檔案 | workerbackup.js, js/modules/business-richman.js, index.html, test/business-richman.test.mjs, this work order |
| 是否部署 | 是（2026-08-24 使用者授權） |
| 回復點 / tag | f39fcc6 |

## 2. 本次只允許改什麼

```text
- Slow dice movement and animate every board step with a visible pause.
- Mix collected private contacts with eligible public self-profile cards.
- Add one authenticated, read-only D1 action; do not invoke AI matchmaking.
```

## 3. 本次禁止碰什麼

```text
- Do not expose scanned private contacts or non-public self profiles.
- Do not change UID, owner, scannedBy, point, inbox, OCR, or card version rules.
- Do not add tables, migrations, writes, AI calls, secrets, or unrelated refactors.
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
- [x] 公開池 / AI配對
- [ ] 後台 CRM / 權限
- [x] 其他：人脈大富翁遊戲節奏

## 5. 修改前必跑

```powershell
npm run guard:before
```

結果：

```text
PASS
```

若 FAIL：停止，不修改程式，先修復既有破損或回報。

## 6. 必讀規格

按本次影響範圍勾選：

- [x] `docs/rules/core-invariants.md`
- [ ] `docs/flows/my-card.md`
- [x] `docs/flows/ai-card-folder.md`
- [x] `docs/data/card-ownership-and-versioning.md`
- [ ] `docs/contracts/line-keywords.md`
- [ ] `docs/contracts/liff-routes.md`
- [ ] `docs/contracts/card-resolvers.md`
- [x] `docs/contracts/button-actions.md`
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
workerbackup.js
js/modules/business-richman.js
index.html
test/business-richman.test.mjs
docs/release/work-orders/2026-08-24-business-richman-public-pool.md
```

關鍵決策：

```text
- Authenticated read-only D1 action; no AI call and no database write.
- Strictly require public + self_profile + pool_eligible=1 + explicit ai_review_status=passed.
- Return an allowlisted public summary only; exclude identity, CRM and contact fields.
- Slow movement to 650 ms per step plus a 350 ms arrival pause.
```

## 9. 修改後必跑

```powershell
npm run guard:after
```

結果：

```text
PASS
```

## 10. 人工驗證

依需求填入實測項目：

| 測試項目 | 測試帳號 / UID | 結果 | 備註 |
| --- | --- | --- | --- |
| Contract and full regression guard | local | PASS | Syntax, dedicated contract, guard:before and guard:after passed |

## 11. 上線判斷

- [x] guard before 通過。
- [x] guard after 通過。
- [x] 修改範圍符合第 2 節。
- [x] 沒有碰第 3 節禁止區域。
- [x] 已確認是否需要部署 Worker / Pages。

結論：

```text
可部署：功能與完整 guard 已通過，並已收到使用者部署授權。
```
