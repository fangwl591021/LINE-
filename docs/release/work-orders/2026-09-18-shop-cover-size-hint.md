# 店家封面建議尺寸標示

## 1. 變更摘要
- 日期：2026-09-18。
- 需求：確認商家圖片可用 800 × 533，標示於上傳處並部署。
- 起始／回復 commit：80d7d1a。
- 預計修改：store-shop.js 的店面提示、前端版本引用、相關測試與此工作單。
- 部署：使用者已授權；僅 GitHub Pages，不部署 Worker。

## 2. 本次只允許改什麼
- 店面封面上傳按鈕旁標示「800 × 533 px（約 3:2 橫式）」。
- 說明前台依版位滿版置中裁切，文字與主體須置中並預留邊界。
- 既有店面 16:9／列表 4:3 裁切及上傳等比縮圖保留。

## 3. 本次禁止碰什麼
- 不修改圖片資產、上傳／儲存流程、商品圖、CSS 比例或資料。
- 不改前輪查驗的贈點、分享、名片匹配、權限、身分或 Worker。
- 不操作正式上傳、儲存或點數交易。

## 4. 必讀規格
- docs/release/feature-change-protocol.md
- docs/rules/core-invariants.md
- docs/contracts/store-shop.md
- test/store-shop-cover.test.mjs

## 5. 驗證
- guard:before：PASS，遠端 main 與本地 80d7d1a 一致。
- guard:after：PASS；已同步既有快取版本與封面提示的測試斷言。
- 指定封面與商城邀請測試：13/13 PASS；完整 guard 包含商城首頁與管理員入口回歸。
- 獨立覆核：提示僅出現在店面封面上傳區，版型／商品圖未改；entry v41 → store-shop v39 與獨立頁一致。
- git diff --check：PASS。
- 發布後以既有登入管理頁唯讀確認新提示，核對正式 index／entry／商城模組及獨立頁版本；不操作上傳、儲存或交易。

## 6. 上線判斷
- 所有檢查通過後，提交並推送既有 main，由 GitHub Pages workflow 發布。
- 發布後核對該 commit 的 CI／Pages 成功狀態及正式提示文字。
