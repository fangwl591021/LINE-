# 手機商品／店家導覽與可見設定入口

- 需求：使用者截圖顯示找商品時底部「可用店家」仍選中，且商店設定在畫面上方而不易找到。
- repo：fangwl591021/LINE-；checkout：.worktrees/veo-crm-tasks-release；branch：codex/store-visible-navigation-20261020。
- 基準／回復點：6d8197250064f4312ef664f78c994c46d47bb496；guard before：完整 PASS。
- 已讀：feature-change-protocol、工作單模板、core-invariants、store-shop、button-actions、liff-routes、回歸矩陣相關範圍。
- 允許：商品／店家探索列新增原有 canManage 角色可見的「商店設定」；底部可用店家僅在店家目錄／店面選中；底部店家入口回到店家列表頂端，保留探索與設定入口、不自動彈搜尋鍵盤；必要樣式、快取版本、契約及測試。
- 禁止：更動後端、角色／UID／登入、母站、點數、QR、下單、AI 審核、CRM／店家／商品資料、secrets／bindings／schema。簽到卡導商品例外不變；設定只讀原本人 manage API。
- 測試：先補底部選中與探索設定入口測試重現，再執行完整 guard after；實際前端隔離瀏覽器操作 320／390／1280px、一般會員／店長／管理員，另查受限角色與公開頁、簽到導向、慢回應。
- 不將本機合成 API 測試說成真實 LINE 手機驗收。通過後依使用者既有授權部署 Pages，不部署 Worker。
- 修改前新增測試確實重現：商品探索底部誤選店家、探索列缺設定；修正後 4/4 通過。
- guard after：完整 PASS。相關導航／管理／簽到／首頁 44/44 通過；兩個 JS 語法及 git diff --check 通過。
- 真實前端模組、合成 API 操作：一般會員／店長／管理員 × 320／390／1280px 共 9 組通過。兩件商品、商品詳情、底部回店家、同列設定可見且可進本人表單、沒有自動搜尋焦點、慢回應不覆蓋設定；簽到商城導商品與明確設定優先保留。reward／redeem／tenant／未知角色仍無管理入口或私有讀取。
- 公開頁另跑 320／390／1280px 商品搜尋／分類／通路與折抵篩選／詳情返回／45 件分頁／店家流程／XSS／錯誤重試通過；管理入口不顯示，SQLite 瀏覽零寫入、外部請求零次。
- 合成測試截圖 C:/Users/User/AppData/Local/Temp/store-visible-navigation-20261020/，390px 同列三按鈕已目視確認。沒有正式寫入、贈扣點或推播。
- 前端版本：store JS65／CSS34／loader68。無 Worker／資料庫改動；依既有授權發布 Pages，正式 CI 與 served hash 另留發布紀錄。
