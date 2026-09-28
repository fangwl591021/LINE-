# 活動 DM 套用／另建系列按鈕修正

- 需求：使用者回報點擊套用／另建系列無反應、沒有梯次選單；沿用修正後直接部署授權。
- 起點：53241d0f234a8fadcfa94b7db859a39716ccd1de。
- 範圍：後台 DM 草稿操作、梯次勾選及可見錯誤提示；admin HTML/CSS/JS、瀏覽器測試、快取版本及本工作單。
- 禁止：修改 Worker、AI 模型／金鑰、資料庫／migration、會員／點數／名片、既有活動報名及手機報名 API。
- 已讀：feature-change-protocol、change-work-order-template、core-invariants、admin-activity-registration、liff-routes。
- 修改前：guard:before PASS（%TEMP%/activity-dm-buttons-before.log）。
- 重現重點：AI 候選日期／費用有缺漏時，另建系列先 validateBatches 拒絕；錯誤只寫在預覽上方，長面板按鈕附近看不到。新增表單應先承接候選，再於正式建立時驗證，不讓草稿交接被未知欄位卡住。
- 保護：不自動套用／發布；原活動與報名不改；最後建立仍驗證完整時間、價格與人工核對。
- 修正前瀏覽器重現：新增回歸先失敗，點「以勾選時段另建系列活動」後 3 秒仍未開啟表單，無 JS error（%TEMP%/activity-dm-buttons-repro.log）。
- 修正：草稿先交接再於儲存驗證；單選套用可補填；多選拒絕提示與成功訊息在按鈕旁可見。多時段缺候選可手動新增，切換原圖後不可套用舊稿；保留每梯次原文。
- 60/60 活動聚焦測試 PASS；guard:after PASS（%TEMP%/activity-dm-buttons-after.log）。
- 瀏覽器 PASS（%TEMP%/activity-dm-buttons-browser.log）：實際 admin shell／合成 API；320/390/1440px 的不完整候選可開啟表單、錯誤可見、取消無寫入；勾選→另建→補費用→確認發布全流程通過。零候選、手動補填、原图變更拒絕與原編輯／新增／名單回歸通過。
- 部署：只發 GitHub Pages，不部署 Worker，不改資料庫／金鑰；提交後等 CI 通過再合併，最後比對線上 admin HTML/CSS/JS 與合併 Git blob。正式資料測試寫入 0。
