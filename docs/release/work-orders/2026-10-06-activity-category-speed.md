# 活動分類與首頁載入

- 需求：活動可編輯但不能改分類；首頁活動出現太慢。
- 起點：73ebcdb06a6b598820be5c8b1a9b489617a9a5e8，LINE- / line-engine；不使用外層 Smart-Menu-Studio。
- 範圍：用戶已確認是後台既有活動的分類；首頁既有活動讀取時程及載入提示、相關合約與測試。
- 預計檔案：js/modules/home.js、admin.html、index.html、相關測試與合約；不改會員活動模組，不新增 migration。
- 不改：身份 resolver、會員歸屬、點數、AI 模型／金鑰、官方活動／梯次資料、報名／核銷／公開範圍。
- 必讀：core-invariants、member-hosted-events、activity-form-options、admin-activity-registration、activity-registration-history、feature-change-protocol。
- 修改前：完整 guard PASS（activity-category-speed-guard-before.log）。
- 修改後：完整 guard PASS（activity-category-speed-guard-after.log）；修正首頁資產版本後，同步更新版本合約斷言並重跑，未略過任何檢查。
- 驗證：載入排程、空列表不連續多取 API、重入合併、身份變更舊回應丟棄、失敗可重試；後台分類修改保留同一活動與報名／梯次結構。
- 瀏覽器：實際 admin.html 搭配本機合成 API，常用分類儲存／重新開啟、自訂分類儲存、失敗不關閉且不覆寫原值均通過；390px 與320px 欄位及按鈕無溢出。
- 速度證據：相同本機合成活動、固定1秒 API 延遲，修改前15,030ms、修改後1,127ms；僅代表排程修正，不是實體手機或正式網路的效能保證。Chrome DevTools 與操作用的 extension 非同一瀏覽器連線，未取得登入頁真實 Core Web Vitals。
- 部署：只經既有 GitHub Pages 流程發布前端。Worker、bindings、vars、secrets、compatibility、cron、migration 皆不變；不回填任何活動資料。
- 回復：以 Pages 原始提交73ebcdb06a6b598820be5c8b1a9b489617a9a5e8 回復本次前端變更，不需回復資料庫或 Worker。
