# 商城管理業績查詢

- 需求：商城管理增加業績查詢。
- 起始 commit：642d932d81f2191e30e268dc53941926705553b6。
- 允許：本人店家唯讀 /sales、按需載入查詢頁、日期／分頁／彙總、0033 查詢索引、必要快取版本、測試與契約。
- 禁止：修改扣點／贈點／防重送、交易狀態、母站權威、UID resolver、其他店家資料、正式資料與 secrets。沒有提交或部署授權。
- 檔案：worker/store-shop{,-sales}.mjs、js/modules/store-shop{,-entry,-sales}.js、css/store-shop.css、index.html、store-shop.html、migrations/0033_store_shop_sales_index.sql、相關 tests/contracts。
- 規格：docs/contracts/store-shop.md；沿用既有商城即時 LINE token + users 角色驗證與 owner 範圍。
- 修改前：node tools/run-change-guard.js before PASS。
- 修改後：node tools/run-change-guard.js after PASS；npm run test:store-shop 26/26 PASS；語法與 git diff --check PASS。
- 本機 Chrome + SQLite：390/320px、按需載入、日期篩選、分頁不改總計、空結果、失敗不顯示零、離開後忽略舊回應、XSS 文字與全程零 DB 寫入 PASS。
- 歷史限制：只取 journal 已成功商品折抵，不代表全部店面銷售或實收；目前商品名稱不是歷史快照。交易原金額不受商品改價影響。
- 狀態：僅本機完成，未 commit/push、未套用正式 migration、未部署、未操作真實扣點。
