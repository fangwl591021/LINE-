# 人脈大富翁原版雙骰子

﻿# 單次變更工作單模板

用途：每次修改功能前，先複製本模板到任務紀錄、PR 說明或 issue。
原則：先確認規格與風險，再改程式；改完後必跑 regression。

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-24 |
| 需求來源 | 使用者要求依 richman 範例程式還原原版骰子 |
| 目標功能 | 人脈大富翁原版雙骰子 |
| 起始 commit | 62314e4 |
| 預計修改檔案 | js/modules/business-richman.js, index.html, test/business-richman.test.mjs, this work order |
| 是否部署 | 是（2026-08-24 使用者授權） |
| 回復點 / tag |  |

## 2. 本次只允許改什麼

```text
- 以 richman 範例 commit 480cc99 的兩顆 3D 六面骰外觀與 1.1 秒旋轉動畫替換目前單一數字骰。
- 骰子結果改為兩顆各 1-6 點，棋子依總和 2-12 步移動。
- 保留目前人脈排列、公開池、逐格 650ms 移動、抵達後名片開啟與 session 儲存流程。
```

## 3. 本次禁止碰什麼

```text
- 不改 Worker、D1、公開池 API、AI 配對與名片 resolver。
- 不改 UID、card owner、scannedBy、點數 ledger、LINE OA 或 LIFF route。
- 不搬入範例的音效、店家優惠、登入或棋盤資料來源。
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
- [x] 公開池 / AI配對
- [ ] 後台 CRM / 權限
- [x] 其他：人脈大富翁前端骰子與移動步數

## 5. 修改前必跑

```powershell
npm run guard:before
```

結果：

```text
PASS：2026-08-24 完整 smoke contracts 通過。
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
js/modules/business-richman.js
index.html
test/business-richman.test.mjs
docs/release/work-orders/2026-08-24-richman-original-dice.md
```

關鍵決策：

```text
- 範例來源固定為 fangwl591021/richman commit 480cc99。
- 移植兩顆 52px 3D 六面骰、原版旋轉角度、1.1 秒 brDiceRoll 動畫與紫色投擲按鈕。
- 每次各產生 1-6 點並以總和 2-12 步移動；保留現有 650ms 逐格速度。
- 不引入範例音效、登入、優惠券、店家或資料 API。
- 保留 session 中的人脈順序、位置與回合，並向後相容舊單骰狀態。
```

## 9. 修改後必跑

```powershell
npm run guard:after
```

結果：

```text
PASS：node --check、專用 business-richman contract、git diff --check 與完整 guard:after 全部通過。
```

## 10. 人工驗證

依需求填入實測項目：

| 測試項目 | 測試帳號 / UID | 結果 | 備註 |
| --- | --- | --- | --- |
| 雙顆 3D 骰結構、六面點數與原版旋轉角度 | local contract | PASS | 對照 richman commit 480cc99 |
| 每次兩顆 1-6 點、依總和 2-12 步逐格移動 | local contract | PASS | 保留 STEP_DELAY_MS = 650 |
| 名片開啟、公開池與 Worker 邊界 | full guard | PASS | Worker、D1、API 未修改 |

## 11. 上線判斷

- [x] guard before 通過。
- [x] guard after 通過。
- [x] 修改範圍符合第 2 節。
- [x] 沒有碰第 3 節禁止區域。
- [x] 已確認是否需要部署 Worker / Pages。

結論：

```text
可部署：前端修改與完整驗證已通過，並已收到 GitHub Pages 部署授權。Worker 與 D1 不需部署。
```
