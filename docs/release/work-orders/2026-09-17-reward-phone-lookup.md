# 贈點單位開放手機查找

## 範圍與授權

- 使用者要求贈點單位開放手機贈點，另明確回覆直接提交、部署。
- 起點：53714f02a568e3d7986ba2d54f2a05e8340663d1，line-android-500/LINE-。
- 保留 reward 角色；不提升為店長、不開放扣點、商品折抵、姓名或手動 UID 查詢。
- 不修改消費贈點計算、requestId 防重、母站／本地點數路由、既有店長功能、資料庫結構或 secrets。

## 變更

- POP 顯示 QR 與手機查找；reward 手機輸入開啟電話鍵盤，支援 09xxxxxxxx 與 +886 格式。
- 後端僅接受完整 10 碼台灣手機，customerPhone 必須與 customerUserId 相同，不能混入 QR／商品資訊。
- 查得唯一 canonical 會員後，沿用原 180 秒操作者＋會員授權回執；仍使用 rewardScanToken 欄位以相容原 QR。
- 修改輸入、切換帳號、舊非同步回應、到期、撤權或更換會員皆不可使用舊回執送出；送出固定 reward／deductPoints=0。
- 未解析成會員 UID 的電話在錢包查詢／索引修補前拒絕，避免將手機誤建為會員；未綁定與歧義查詢不發回執。
- reward 查詢回應使用白名單，只含顯示核對、點數與操作旗標；不含完整 user/card、tgToken、內部索引或註冊網址。
- 快取版本：auth 11.01、store-point-operation 4、store-shop 36、store-shop-entry 38；CSS 不變。

## 驗證與限制

- 修改前／後 full change guard 通過，JavaScript 語法及 git diff --check 通過。
- 贈點權限、前端、原 QR、POP、交易防重相關測試 94／94 通過。
- 實際 resolver/getStorePointCustomer/dispatch 抽取測試確認未知、未綁定、歧義手機不查錢包、不建帳號、不發回執；投影測試確認不洩露多餘資料且店長回應未變。
- Chrome 390px 實際 cashier/POP：手機格式正規化、核對合成會員、1 次模擬贈點、扣點選項隱藏，對話框無水平溢出。
- 本機預覽僅綁定 127.0.0.1:8771，CSP 禁止 connect，資料與送出皆為合成；不使用正式會員、不執行真實贈扣點。
- Wrangler 4.133.0 deploy --dry-run --keep-vars 通過，1104.22 KiB／gzip 234.44 KiB。

## 發布與回復

- 先部署 line-engine Worker（--keep-vars），再推 main 發布 GitHub Pages，確認 CI 及正式靜態版本。
- 無 migration、新 binding、正式角色異動或額外點數操作。
- 發布前 Worker 版本：1b96cd76-c426-4e12-a724-2330068f36f9；需回復時先回復前端版本鏈，再回復此 Worker 版本。
- 正式個別 reward 帳號手機贈點未實際送出；若需真實交易驗收，須另指定已授權會員及金額。
