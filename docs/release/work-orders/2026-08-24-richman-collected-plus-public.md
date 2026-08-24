# 人脈大富翁合併收藏與公開名片

# 單次變更工作單模板

用途：每次修改功能前，先複製本模板到任務紀錄、PR 說明或 issue。  
原則：先確認規格與風險，再改程式；改完後必跑 regression。

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-24 |
| 需求來源 | 使用者要求人脈大富翁使用「自己收藏的＋公開的」名片 |
| 目標功能 | 人脈大富翁合併收藏與公開名片 |
| 起始 commit | 69c4b47 |
| 預計修改檔案 | workerbackup.js, test/business-richman.test.mjs, this work order |
| 是否部署 | 是（line-engine Worker） |
| 回復點 / tag |  |

## 2. 本次只允許改什麼

```text
- 保留前端既有 collected.concat(publicCards) 合併與名片 ID 去重。
- 修正公開池回傳：信任資料庫已儲存的 public + self_profile + pool_eligible=1 + ai_review_status=passed 條件。
- 不再用新版按鈕完整性二次覆寫已通過的公開池資格。
```

## 3. 本次禁止碰什麼

```text
- 不放寬 AI 審核、公開狀態、本人名片或 pool_eligible 條件。
- 不改 D1 資料、不執行 migration、不補造公開或審核狀態。
- 不改 UID、owner、scannedBy、點數、LINE OA、LIFF 或名片開啟流程。
- 未收到部署要求前不提交、不推送、不部署。
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
- [x] 其他：人脈大富翁名片來源合併

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
workerbackup.js
test/business-richman.test.mjs
docs/release/work-orders/2026-08-24-richman-collected-plus-public.md
```

關鍵決策：

```text
- 前端原有 collected.concat(publicCards) 與 createState 的 ID 去重保留不動。
- listPublicBusinessCards 仍由 SQL 限制 public、self_profile、pool_eligible=1、ai_review_status=passed。
- cardRow 僅負責正規化與顯示資料，不再用新版 buttons 完整度推翻資料庫既有公開池資格。
- API 仍只輸出 publicBusinessCardView 白名單欄位；不增加身份或內部欄位。
- D1 不需 migration、回填或任何資料寫入。
```

## 9. 修改後必跑

```powershell
npm run guard:after
```

結果：

```text
PASS：完整修改後 smoke contracts 與人脈大富翁專項測試通過。
```

## 10. 人工驗證

依需求填入實測項目：

| 測試項目 | 測試帳號 / UID | 結果 | 備註 |
| --- | --- | --- | --- |
| 前端來源合併 | 靜態合約 | PASS | 保留自己的收藏＋公開名片，並依名片 ID 去重 |
| 公開池資格 | 正式 D1 唯讀查詢 | PASS | 現有 8 張符合 public＋self_profile＋pool_eligible＋AI passed |
| 舊公開名片相容 | 專項測試 | PASS | 缺少新版 buttons 不再把已通過資格的名片錯誤濾除 |
| 資料安全 | 程式差異檢查 | PASS | 仍需登入，且只回傳公開欄位白名單；無 D1 寫入 |

## 11. 上線判斷

- [x] guard before 通過。
- [x] guard after 通過。
- [x] 修改範圍符合第 2 節。
- [x] 沒有碰第 3 節禁止區域。
- [x] 已確認是否需要部署 Worker / Pages。

結論：

```text
可部署：修正、專項測試與完整回歸已通過；本次發布 line-engine Worker。D1 無需 migration 或資料修改。
```
