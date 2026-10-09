# 首頁「我的報名」標籤

- 日期 / 需求：2026-10-09，把「我的報名」固定放在活動篩選的「全部」旁邊。
- checkout：LINE- `.worktrees/veo-crm-tasks-release`；branch `codex/home-my-registration-tab-20261009`；起始 / 回復 commit `31911340076669f4501d5f97b74e511e1b0316f9`。
- 允許：首頁新增直接入口；打開既有活動紀錄時自動展開；在紀錄區提供既有會員活動／課程「我的報名」連結。載入 / 空 / 失敗時入口仍可見。
- 禁止：Worker、資料庫、UID / token / 推薦歸屬、公開權限、報名 / 取消 / 核銷 / 付款 API、點數、原行事曆、兩套報名資料合併或搬移。
- 預計檔案：`js/modules/home.js`、`index.html` 快取版本、`docs/contracts/activity-registration-history.md`、本工作單、單元 / 瀏覽器測試及其快取契約與 full guard 清單。
- 已讀：feature-change-protocol、change-work-order-template、core-invariants、liff-routes、activity-registration-history、activity-form-options、member-hosted-events。
- `npm.cmd run guard:before`：完整 PASS；`C:/Users/User/AppData/Local/Temp/home-my-registration-before-20261009.log`。
- 是否部署：是；使用者追加授權「以後通過測試就直接部署」。本次沿用已通過測試的入口調整，僅發布 GitHub Pages；CI、正式資產與部署後瀏覽器確認完成後補記收據。

## 規則與驗證

- 順序固定「全部」→「我的報名」→其餘分類；「我的報名」是既有紀錄入口，不是分類字串，不把它送進類別篩選。
- 直接展開既有官方活動／梯次紀錄，不要求再點折疊標題。會員自建活動／課程使用既有 `openMemberEvents('mine')`，不複製或混用官方報名 ID。
- 返回與 QR / 狀態 / 排序 / 取消仍走原流程；點入口只讀、不寫正式資料。
- 入口僅呼叫一次既有紀錄讀取；資料抵達後再定位至紀錄。若使用者已離開頁面或收合紀錄，遲到回應不重新捲動。
- `npm.cmd run guard:after`：完整 PASS；最終版 `C:/Users/User/AppData/Local/Temp/home-my-registration-after-20261009.log`。
- `node --test test/home-my-registration.test.mjs test/home-activities-loading.test.mjs test/home-member-events.test.mjs`：22 / 22 PASS（新入口 7 案）。
- `node test/browser/activity-entry.mjs`：PASS。真實 index / navigation / home / member-hosted-events，320 / 390 / 1440 寬度；全部後的第二顆標籤、一次點擊自動展開、原排序 / QR、會員活動與課程我的報名、關閉 / 返回與重複進入無重複連結；原單場 / 梯次報名與失敗重試亦通過。
- 瀏覽器使用合成 LIFF / API；正式寫入 0、自動報名寫入 0。只有舊回歸測試明確點擊註冊及報名時送出合成請求，未觸碰真實資料。
- 螢幕與畫面檢查：`C:/Users/User/AppData/Local/Temp/home-my-registration-20261009/registration-tab-390.png`、`history-390.png`、`member-history-320.png`。已確認紀錄載入後直接可見，手機無整頁水平溢出。
- `node --check js/modules/home.js`、`git diff --check`：PASS。
- 實際變更：首頁入口 / 快取版本、activity-registration-history 契約、本工作單、新入口測試、既有載入 / 歷史 / 會員 UI 快取契約、browser activity-entry 及 full guard 測試清單；未改 Worker、報名資料或權限。
- 正式頁面：發布與線上驗證待完成；實體 LINE / iOS / Android 未實測。
