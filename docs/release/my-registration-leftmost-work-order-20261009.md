# 「我的報名」移至最左側

- 需求：使用者新截圖要求「我的報名要在最左邊」，改為「我的報名 → 全部 → 其餘分類」。沿用測試通過直接部署授權。
- 日期：2026-10-09；checkout `.worktrees/veo-crm-tasks-release`（LINE-）；branch `codex/my-registration-leftmost-20261009`。
- 起始 / 回復 commit：`b91db44874535d0318ec737049c364f503954c65`（PR #211 正式版）。
- 允許：只調整首頁標籤順序、快取版本及對應契約 / 測試。不改標籤點擊行為或篩選選中狀態。
- 禁止：Worker、資料庫、登入、UID、權限、公開 / 歸屬、報名 / 取消 / 核銷 API、點數、其他功能或 checkout。
- 預計檔案：home.js、index.html、activity-registration-history 契約、home-my-registration / activity-registration-history / member-hosted-events-ui / browser activity-entry 測試、check-ai-match-interest-contract 及本工作單。
- 已讀：feature-change-protocol、change-work-order-template、core-invariants、activity-registration-history、liff-routes。
- `npm.cmd run guard:before`：完整 PASS；`C:/Users/User/AppData/Local/Temp/my-registration-leftmost-before-20261009.log`。
- `npm.cmd run guard:after`：完整 PASS；`C:/Users/User/AppData/Local/Temp/my-registration-leftmost-after-20261009.log`。
- `node --test test/home-my-registration.test.mjs test/home-activities-loading.test.mjs test/home-member-events.test.mjs`：22 / 22 PASS。
- `node test/browser/activity-entry.mjs`：PASS；320、390、1440 最左順序與可见位置、原入口 / 返回 / QR / 會員活動課程 / 单場梯次回歸均通過；合成 LIFF / API，正式寫入 0。
- 已檢查 `registration-tab-390.png`；`node --check js/modules/home.js`、`git diff --check` PASS。
- 發布：測試與 CI 通過後僅部署 GitHub Pages；比對正式資產，再用線上前台資產驗收（合成 LIFF / API、不寫正式資料）；實體 LINE 不在此模擬驗收範圍。
