# 各店自行收款：線上商城第一階段

2026-09-10；使用者確認各店各自收款並同意開始實作。

## 邊界與狀態

- 已實作本機匯款訂單流程，不代表完成 LINE Pay、線上共用點數、退款、自動物流或正式交易驗證。
- 獨立 `worker/store-commerce.mjs`、`/v1/store-commerce/*`、`store_commerce_*` 表及按需載入的前端。先放現有 LINE- Worker 中，未建立另一個正式 Worker／獨立部署專案；之後可沿此邊界抽離。
- 不改舊年費 `orders`、名片、會員映射、母站 gift_money 權威、現場 QR 收銀或原業績報表。不複製 HookTea 會員、商品、訂單、銀行帳號、金流憑證或資源綁定。
- 後端 `STORE_COMMERCE_ENABLED` 嚴格等於字串 `true` 才能建立／處理新商城交易。未設定即關閉；本次不加入正式 vars。關閉時仍可查既有訂單與準備本人設定，但所有訂單變更均停止。
- LINE Pay、COD 與線上點數折抵硬性拒絕，不能由前端切換啟用；不存在支付密鑰輸入或儲存欄位。設定頁清楚標示尚未開放項目。

## API 與授權

- GET `/capabilities`：公開功能開關，不含帳號或私人資料。
- GET/POST `/settings`：每次驗證 LINE Bearer token，再查目前店家角色，僅本人店面；admin 也不跨店。銀行資料只給本人設定及已登入買家的本店結帳／訂單，不給公開目錄。
- POST `/quote`：後端重查 active 店家、商品與設定；單店至多 20 種、各 1–99 件、整數分計價。運費、滿額免運及金額皆由後端計算，不接受前端價格。郵寄地址或超商門市資料必填。
- POST `/orders`：買家確認報價 hash 後下單。原子條件 INSERT 重查商品、設定、店面版本與 active 狀態；變更則 409，不建立半筆訂單。逐筆保存買家姓名、收件人、商品名稱／單價／數量、運費、銀行收款快照；後續改價或改帳號不改舊訂單。
- GET `/orders`：本人購買；`scope=merchant` 只看本人店面的網路訂單。每頁 20 筆，按時間／ID 排序；不輸出買家 UID 或請求 hash。收件人與購買者分開顯示。
- GET `/orders/lookup?request_key=UUID`：僅本人查回不確定的下單結果，含暫停期間。
- POST `/orders/action`：只接受白名單動作；每次帶版本與請求 UUID。事件與狀態更新在 D1 transactional batch 內執行，CAS 避免同時核帳、覆寫或重複完成。原始 client payload 不可覆蓋金額／狀態／店家／買家。
- JSON 上限 20 KB；清單有界，SQL 綁參數，個資不寫錯誤日誌，回應 no-store，前端文字 escape。離開頁面或 LINE token 改變後忽略遲到回應。

## 人工匯款與出貨

1. 買家建立待匯款訂單，按訂單凍結的店家銀行資料自行匯款；平台不收款、不分帳。
2. 買家回報末五碼只轉為 reported，不代表款项入帳。
3. 本店核對銀行實際入帳，輸入與應收完全一致的金額並明確勾選確認，才標記 paid。短溢款保留待核帳，人工處理。
4. 已付款且未出貨才可填物流編號、標記 shipped；之後可人工標記 completed。
5. 僅尚未回報的 pending 訂單可由買家明確取消。已回報／已付款不能自動取消或退錢、退點。

未串物流商 API，超商門市手填，無自動選店、寄件單、追蹤同步；無庫存預留、扣庫存、自動過期訂單、推播或退款介面。上線前需確認人工履約與客服方式。

## 重送與復原

- `(buyer_uid,request_key)` 唯一；相同內容重送回原訂單，不同內容 409。即使商品已下架也能查回已建立訂單。
- 確認下單前 browser localStorage 只保存未確認的 UUID 與輸入 hash，沒有收件資料、銀行帳號或 token。儲存失敗則不送出；網路／5xx 失敗保留原 ID，相同輸入可原 ID 重試。
- 「我的網路訂單」會查回已成立的未確認訂單並清除該 pending marker。未查到且仍不確定時保留 marker，不擅自改用新 ID；先用原資料重試或人工核對。
- 明確驗證失敗（400/409/413）且本人 lookup 無訂單，才允許重新編輯建立新請求。這不是跨金流服務補償或點數預留方案。

## 部署前與後續

- 本機測試：`npm run test:store-commerce`；`npm run test:store-shop`；完整 change guard；Wrangler dry-run。
- 假資料 Chrome：執行 `node test/browser/store-commerce-server.mjs`，僅 localhost:8794；評估 `test/browser/store-commerce.js` 的函式。不可對正式站執行。
- 經另行授權後，先套用 0034，部署 Worker，再前端。先保持全站交易開關關閉；確認各店的帳號、人工核帳與客服，以及完整正式驗收後，另行開放。
- 下一階段 LINE Pay：每店的商家憑證只存後端 secrets；訂單綁定收款店家與 transactionId，驗證金額／幣別，補重複確認、查單與退款狀態。
- 線上共用點數必須先核對母站是否支援預留／提交／取消或安全補償；未確認不能先扣點再等付款。仍不轉店家點數，不建立第二個錢包。
- 網路實收／退款報表另建，以 online order ID 為唯一來源；目前現場 QR 業績不混入這批網路訂單，避免重複統計。

依 Workers 安全指引採逐筆交易與原子批次，不沿用 HookTea 整批 KV ORDERS 覆寫。
參考：https://developers.cloudflare.com/d1/worker-api/d1-database/
