# 每日簽到贈點提示修正

- 需求：簽到成功誤顯示名片收錄成功；使用者同意最小修正並提交、部署。
- 起始／回復 commit：5b1bfc4bb851e86e5e6e40499ac1ceaa8d2653a8；main；工作目錄乾淨。
- 允許修改：js/auth.js 的成功顯示、js/modules/cropper.js 的共用彈窗文字、index.html 快取版本、顯示測試與測試入口、點數契約顯示條款、本工單。
- 禁止修改：API action/payload、身份解析、每日限領、獎勵數值、ledger、Worker、D1、secrets、名片收錄與 OCR 流程。
- 已讀：core-invariants、points-ledger、button-actions、regression-matrix、feature-change-protocol。
- 修改前：node tools/run-change-guard.js before PASS。
- 根因：claimDailyPointCheckin 共用 showPointAwardCelebration，但該函式固定顯示名片收錄成功文字；正式站兩份 JS 與本機正規化換行後相同。
- 設計：簽到呼叫明確傳入 daily-checkin 顯示來源；未傳来源仍保留既有名片贈點文字。只在既有 awarded 條件成立時顯示；重複與失敗不顯示成功彈窗。
- 驗證：用隔離 VM 與 mock API 測試，不觸發正式簽到、贈點或掃描。
- 發布：只部署 GitHub Pages；不部署 Worker、不跑 migration。
- 完整檢查攔下四處測試內寫死的舊 JS 版本（store-invite-share、store-invite-binding-entry、card-vision-one-pass、main-liff-endpoint）；只同步版本預期至 auth 11.04 / cropper 7.19，不變更測試行為或產品功能。
- 修改後：顯示回歸測試 7/7 PASS；node tools/run-change-guard.js after PASS；git diff --check PASS。
- 覆蓋：簽到專用文字、回傳點數顯示、已領取、失敗、無彈窗函式時的 toast、既有名片提示與非正數不顯示彈窗。API action、identity payload、按鈕還原皆維持原行為。
- 限制：未實際觸發正式簽到或名片贈點，避免異動會員帳本；發布後另以公開 JS 內容與 Pages 部署狀態核對。
