# 折抵店家公司資訊與一件商品

- 需求：折抵店家能刊登公司介紹、電話、地址與一件商品；依既有授權測試通過直接部署。
- 起點：main 8e88fb62c41adcd746234ef3f583c533fa95813a；line-engine 78ee505a-7bac-46a9-8f39-ef1c59730db5。LINE- checkout：.worktrees/veo-crm-tasks-release。
- before full guard：PASS。
- after full guard：PASS。中間舊 cache 版號與抽取函式的測試 fixture 已同步，未改其他功能行為；新增公司入口／安全聯絡測試已納入 full guard。
- 查核：首頁 openPartnerStores 仍跳母站舊目錄。現有 store-shop 已支援本人公司資訊及一般會員一件未封存商品，後端已審核上架、版本與名額防併發；不再建第二套店家／商品資料。
- 允許：首頁改走站內商城合併店家目錄，提供明確上架入口與步驟；公開店面直接顯示公司介紹、電話、地址及安全電話／地圖按鈕；沿用既有表單與審核。
- 不變：一般會員一件商品（草稿計入）、店長／管理員不限；一般會員不自動取得扣點／網購／收款權限。無帳號 partner 仍僅展示，不偽造 owner 或商品，不自動認領。
- 禁止：修改身份、角色、歸屬、資料庫、母站、金鑰、點數／收銀／訂單、審核、商品價格／運費或既有上架資料。不新增自動公開／自動填入私人會員資訊。
- 檔案：home.js、store-shop.js／entry、store-shop.css、index.html／store-shop.html、相關契約與回歸測試。
- 已讀：core-invariants、store-shop、phase-1-partner-directory、button-actions、liff-routes 相關範圍、feature-change-protocol、change-checklist、work-order template；Workers／Wrangler skills。名片編輯規格未讀：不修改名片流程。
- 驗證：before／after full guard；首頁不再跳母站；真實表單＋隔離 SQLite 上架公司與一件商品、公開顯示聯絡與商品、第二件拒絕、跨店／未登入／審核拒絕、公開瀏覽零寫入、手機寬度與 XSS。LINE／AI 使用 stub，不聲稱真手機或真 AI 審核驗收。
- 發布：前端 Pages；現有 Worker API 足夠，不重部署 Worker，不套用 migration，不寫入正式店家資料。核對 main CI、線上資產 bytes 與正式只讀目錄，記錄測試與正式讀取分界。
- 已驗證：公司與一件商品實際表單＋原 Worker／SQLite API，320/390/1280px PASS；第二件拒絕、公開瀏覽零寫入、無點數 API；商品搜尋 320/390/1280px PASS；單品運費與合成扣退點 320/390/1440px PASS。商品搜尋截圖的 OneDrive EBADF 改以可指定 Temp 輸出重跑，舊登入按鈕期待同步既有「登入後購買本商品」文案，未改 checkout。LINE／AI 供應商均 stubbed，未驗收手機 LINE 實機。
- 回復：只回復本次前端變更並重新發布 Pages；不清除任何店家或商品資料。
