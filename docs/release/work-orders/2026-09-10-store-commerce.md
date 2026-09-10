# 各店自行收款的線上商城第一階段

- 使用者需求：研究並開始移植 HookTea 商城、金流、匯款、寄送；已確定各店自行收款。
- LINE- 起點：0abf465，main；HookTea 研究來源：d8384e76f267082ed1f7d80b2b836a641b126514。
- 本輪允許：獨立線上商城模組、收款設定、匯款訂單、人工核帳與出貨、本機測試、契約及必要快取版本。
- 不執行：commit/push、部署、正式 migration／資料寫入、真实收款或扣點、複製商家 secrets。新功能預設關閉。
- 已有獨立介面與 API／資料表；尚未搬到獨立 Worker 或新 repository，尚未接 LINE Pay／共用點數／自動物流／退款／網路業績。
- 規格：docs/contracts/store-commerce.md。
- before / after 完整 change guard 通過；商城、線上訂單與受保護收銀測試共 38 項通過。
- 本機假資料 Chrome：選購、價格確認、表單返回保留、回應遺失查回、末五碼不視為付款、錯誤金額拒絕核帳、收款／出貨／完成、XSS、320/390px 無溢出、遲到回應不改頁面已驗證。
- 未以真實 LINE 身分、銀行入帳、物流或正式 D1 測試；不能據此宣稱正式金流已驗證。
- Wrangler 4.129.0 dry-run 通過：1024.76 KiB（gzip 214.92 KiB），未上傳；git diff --check 通過。
- 保存的 Chrome 自動測試在 390px 再次完整通過；本機測試伺服器只使用記憶體 SQLite 假資料。
