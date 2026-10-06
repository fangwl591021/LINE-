# 首頁近期活動載入

- 登入完成後首頁活動優先於非必要背景工作，100ms 排程開始、不再固定等14秒，也不阻塞登入或首頁初次顯示。
- 同一登入身分、token、角色及活動網的重入請求合併；身份／權限範圍改變後，不接受舊回應，不顯示上一範圍資料。沿用既有伺服器權限及前端活動篩選。
- getPublicActivities 已正常回傳空陣列時，立即顯示沒有活動，不再連續讀取 getAllActivities/getActivities；僅在舊端點無正常列表回應時沿用有界 fallback，不擴大權限。
- 明確區分載入中、成功空列表、失敗可手動重試；不把失敗表示為沒有活動、不自動無限重試。
- 本次不變更既有報名紀錄 fallback、排序、官方活動／會員活動分離、點數、LINE 登入與其他背景工作時程。
- 回歸：test/home-activities-loading.test.mjs、tools/check-main-liff-endpoint-contract.js、完整 change guard。
