# 會員活動行事曆與報名名冊入口

- 需求：使用者指出無法真正加到行事曆、我辦的活動缺少明顯的報名名冊入口；沿用測試通過直接部署授權。
- checkout：LINE- `.worktrees/veo-crm-tasks-release`；branch `codex/member-hosting-calendar-roster-20261009`；起始 / 回復 commit `8a848950259cadcbe2bc4279271ecb009c2c096f`。
- 已確認：新增按鈕使用不存在的 switchPage；loadMemberHostedAgenda 排除已結束活動；主辦名冊只能從詳細頁開啟。
- 允許：修正新增按鈕使用既有 goPage、立即打開原辦活動表單；我辦的活動卡片直接進原主辦名冊；本人主辦與有效報名的歷史活動保留在平台行事曆投影。維持取消排除、資料唯一、只讀投影、名冊權限及原掃碼核銷流程。
- 禁止：Worker、資料庫 / migration、UID / token、公開 / 歸屬、報名 / 取消 / 核銷 / 點數 API、正式資料修補、其他 checkout。不得建立重複私人行程或替人報名。
- 必讀：feature-change-protocol、change-work-order-template、core-invariants、member-hosted-events、activity-registration-history、activity-form-options、liff-routes。
- 預計修改：member-hosted-events.js、index 快取、會員活動契約、UI / 權限單元及 browser activity-entry 測試、本工作單。依使用者補充再決定是否涉及手機 / Google 日曆；未確認前僅修平台內已確定問題。
- guard:before：完整 PASS；`C:/Users/User/AppData/Local/Temp/member-hosting-calendar-roster-before-20261009.log`。
- guard:after：完整 PASS；`C:/Users/User/AppData/Local/Temp/member-hosting-calendar-roster-after-20261009.log`。
- 單元：`node --test test/member-hosted-events-ui.test.mjs test/member-hosted-events.test.mjs` 22 / 22 PASS。涵蓋立即導航、原草稿保留、取消排除、歷史活動唯一投影、已結束名冊，以及一般會員 / 非本場管理員 403、原 UID canonical alias 可讀、未登入 401。
- 瀏覽器：`node test/browser/activity-entry.mjs` PASS；320 / 390 / 1440 下我辦的活動、名冊 / 分頁 / 重新整理 / 掃描器返回、空名單 / 錯誤、立即打開行事曆草稿、已結束活動原日期、取消公開選擇不寫入、確認公開後一筆活動投影均通過。延遲報名紀錄不阻擋表單；沿用既有報名與梯次回歸。
- 測試資料：瀏覽器攔截合成 API、SQLite 獨立 fixture；正式資料寫入 0，不產生私人行程副本，不實際報名、核銷、贈扣點。截圖 `C:/Users/User/AppData/Local/Temp/member-hosting-calendar-roster-20261009`。
- 發布：測試通過後依授權部署 GitHub Pages；PR CI / main CI 必須通過，發布後比對正式 commit 的資產 SHA256 並用線上資產重跑同一瀏覽器測試。僅前端，無 Worker / DB / secrets 部署。實體 LINE 相機與外部 Google / iOS 行事曆未納入本次驗收。
