# 後台活動編輯提供報名短網址

- 需求：使用者要求活動編輯網頁應提供剛完成的報名連結；沿用修正後提交部署授權。
- 起始／回復點：deb619ed927d1404f0b4ec4b70167654449b7549。
- 範圍：admin.html 編輯視窗上方新增唯讀報名短網址、複製及開啟報名頁；沿用 createActivityShareLink，不更動活動儲存流程。
- 檔案：admin.html、js/modules/admin-activity-registration.js、相關單元／瀏覽器測試與契約。
- 禁止：不改 Worker、資料庫／migration、會員、推薦人解析、報名、點數、名片、AI 上架、其他商城或手機流程。
- 已讀：feature-change-protocol、change-work-order-template、core-invariants、admin-activity-registration、liff-routes。
- guard before：PASS（%TEMP%/activity-edit-link-before.log）。
- 行為：只有已上架活動且目前管理員已登入才呼叫既有 API；關閉／換活動／換帳號忽略舊回應。失敗可重試，不自動儲存或改動編輯中的欄位。目的網址限既有 Worker /a/<code>。
- guard after：PASS（%TEMP%/activity-edit-link-after.log）。
- 相關測試：node --test test/admin-activity-registration.test.mjs test/activity-short-links.test.mjs，27/27 PASS；包含已上架／下架、身份驗證、短網址來源白名單、失败重試、關閉／切換活動／身份的遲到回應、剪貼簿失敗手動複製。
- 瀏覽器：node test/browser/admin-activity-registration.mjs，Chrome 合成資料 320/390/1440px PASS；連結／按鈕不溢出、複製內容正確、既有手動欄位不變、取消／儲存可操作，原名單／建立／AI 上架測試通過；正式資料寫入 0。首次執行僅測試定位器漏算 save 圖示文字而逾時，改用既有按鈕 ID 後通過。
- 語法／差異：node --check js/modules/admin-activity-registration.js、admin inline scripts 解析、git diff --check。
- 待部署驗證：正式 admin.html／模組與合併 Git blob hash；手機實機 LINE／已登入正式帳號未代操作。
- 部署：只發布 GitHub Pages，不重新部署 Worker，不執行 migration。實際部署證據留 PR。
