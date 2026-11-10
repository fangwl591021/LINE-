# 進入速度與長時間pending修補

- 使用者回報進入慢，附件Network顯示多筆core fetch已完成及兩筆pending。
- 基線：main d5ca4c8；完整guard:before PASS（repo外entry-speed-before.log）。
- 範圍：已確認core收到headers即撤timeout，使body stalled無期限；首頁摘要內收銀log逐筆重讀同客戶。修完整request deadline及request-local customer去重/有界並行；評估index script defer僅限隔離fixture，未證實收益不採用。
- 禁止：不跳權限／好友／登入或freshcheck，不取消上架資格，不改真點數、交易寫入、付款、註冊獎勵、角色或正式資料；不為效能測試發真LINE或寫正式資料。
- 契約：entry-performance、home-activities-loading、core-invariants、store-cooperation-plans、feature-change-protocol、line-release-verification；使用web-perf及必要Workers/wrangler技能。
- 證據：源碼已確認超時計時器錯位與同客戶10筆log約30次D1讀。DevTools隔離未登入導向LINE Login，該LCP不可當會員首頁指標；真實登入時間需另核。
- 驗證：core期限6項＋登入37項、收銀呈現9項＋相關回歸合計92項PASS；真正Chrome以loopback HTTP flush headers後停body，縮短fixture timer後原生AbortError正確回逾時，請求1筆/重試0且正常回應可恢復，正式外連0。所有證據repo外。
- 完整 `node tools/run-change-guard.js after` PASS（entry-speed-after.log），Wrangler4.155.0最終dry-run PASS。UI core載入入口index及ocr-lab加entrySpeed=1快取。
- 腳本候選評估：3組交錯cold＋2組舊admin快取smoke完成，模擬首次可互動中位約3.93→3.70s；baseline已並行抓JS，defer收益僅約0.23s且將settings初始化移到auth之後。故不修改script defer或載入順序，fixture保留作決策證據，不宣稱模擬值為使用者實機速度。
- 發布前：正式Worker仍ca92a559-2e68-4213-8a25-ab9b79c3ef66；既有設定/綁定與三個cron已只讀保存，keep-vars保留Dashboard額外變數。發布後核對bundle雜湊、前端檔案與原設定/排程；不對正式交易或手機LINE做寫入驗收。
