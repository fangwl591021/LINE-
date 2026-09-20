# 商城管理直達入口最小載入修正

- 起點：c3272c3；先完成程式與測試，使用者後續明確授權「提交、部署」。
- 允許：商城管理純入口在 LINE 驗證期間預載靜態商城模組；會員確認時顯示無資料的管理等待畫面；不讀取首頁快取、不觸發首頁資料載入。
- 檔案：js/modules/store-shop-entry.js、js/auth.js、index.html、入口回歸測試及契約。
- 禁止：修改 LINE 登入/好友/後端權限驗證、UID、推薦歸屬、點數、遊戲、Worker、資料庫、正式資料。
- 已讀：feature-change-protocol、liff-routes、core-invariants、regression-matrix、工作單模板。
- guard before / after：完整 smoke contracts PASS；git diff --check PASS。
- 特殊路由（分享、認領、簽到、商品、店家邀請）仍走原流程；只 allowlist 純 manage 入口及登入傳輸參數。
- 驗收：預載不讀私有 API、不 mount；會員確認前不顯示管理資料；成功沿用 openStoreShop；失敗可重試；現有特殊路由不變。
- 測試：store-invite-auth + login-bootstrap 共 49 項 PASS；store-point-operation-entry 8 項 PASS。收銀路由測試的來源定位同步新參數，仍驗證先確認會員再開收銀、skipHome=false。
- 測試涵蓋直接/巢狀 LIFF 入口、等待 checkUser、舊快取不開權限、失敗重試、登入/好友 gate、預載去重及失敗重試、混合路由排除。
- 未實測手機 LINE 的實際秒數；發布範圍僅 GitHub Pages 前端，無 Worker、migration 或正式資料異動。部署後核對 Actions 與正式站檔案。
