# 新增商品 DM OCR

- 使用者要求：新增商品加上 DM 上傳，由 AI OCR 帶入商品，方便建立。
- 目標：LINE- main，原 HEAD 846a706。完整保留前階段限店內／網購與購買人未提交修改。
- 新增獨立 DM OCR Worker / lazy frontend / 0036 每店限流；一般商品建立仍需確認儲存。不更動名片 OCR、身分、點數、折抵交易與收款開關。
- 一張圖最多 8 個候選，選一個帶入；不明價格留白必填。可另勾 DM 作公開商品圖片（預設關閉）。
- 依 Workers 安全技能加入圖片與回應上限、固定外連端點、服務端金鑰、權限、原子限流與安全錯誤，不將圖片指示交給工具執行。

## 本機結果

- before / after full change guard passed，新 OCR 測試已接入 guard。
- 67 tests passed（8 項 DM + 前阶段 59 項商城／點數／QR）。
- Chrome 390px 合成 DM 流程通過：候選兩項、價格／分類帶入、未知價格不得送出、AI 不改銷售與折抵設定、預設不公開圖、圖片上傳失敗不部分套用、可選公開 DM、人工儲存恰一次、晚回應帳號切換保護、XSS、無橫向溢出。
- AI 供應商與 R2 upload 為 mock；有走本機 endpoint / SQLite，未呼叫正式 AI、未發布圖片、未執行真實交易。不宣稱 OCR 準確率已實測。
- git diff --check passed。
- Wrangler 4.128.0 dry-run passed，1037.31 KiB / gzip 217.90 KiB；無正式資源變更。
- 尚未提交、push 或部署。下一次發布須包含前階段 0035 與本階段 0036，先 DB 再 Worker 再前端，確認既有 AI secret/model 配置及真實 DM 路徑。
