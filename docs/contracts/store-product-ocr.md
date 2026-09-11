# 商品 DM AI 辨識契約

## 範圍與確認

- 「新增商品」提供上傳 DM 入口，按需載入 js/modules/store-product-ocr.js；商城首頁不預載 AI 或辨識模組。
- 先顯示最多 8 個商品候選，店家選擇後按「帶入商品表單」，最後沿用原「儲存商品」建立單件商品。不自動批次寫入，不自動上架。
- 僅带入 title、description、price、category。purchase_mode、status、redeem_type/value、所有權不接受 AI 結果，沿用表單值。
- 原表單已有這些欄位時，替換前提示確認。價格模糊、多規格或非明確台幣售價時用 null，前端留白且 required，不當作 0 元。
- 支援 JPG／PNG／WebP，來源 10MB 內，沿用瀏覽器 1600px 等比縮圖與 4MB 輸出限制。不支援 PDF／HEIC，須先轉成圖片。
- 上傳圖送至既有 AI 供應商；未勾選時不公開、不存 R2，也不存 localStorage。
- 「同時將 DM 上傳為商品圖片」預設未勾選，勾選表示同意公開可存取圖片；按帶入時沿用 uploadImageToR2。先再次檢查店家，上傳失敗不部分覆寫欄位。取消或未存商品可能留下已同意公開的素材，與既有圖片上傳一致。
- 關閉／重新選檔／離開表單／切換登入後，晚回應不可帶入其他表單。新按鍵皆 type=button，不誤觸商品儲存。

## API 與安全

- POST /v1/store-shop/product-ocr，沿用伺服器 Bearer LINE profile 與 users.role 驗證，必須已有自己店面。
- 主程式只對此路徑放寬至約 5.6MB JSON；一般商品寫入仍 16KB。拒絕外部圖片 URL、PDF、非法 base64、MIME／魔術位元組不符與過大圖片。
- 0036_store_product_ocr_usage 僅每店一行：UTC 日期、嘗試次數、下次允許時間；原子 UPSERT 每 15 秒一次、UTC 每日 60 次。資格、圖片或未配置金鑰時不消耗次數；AI 呼叫失敗仍計次，避免重試濫用。沒有讀写點數或交易。
- 只用 env.OPENAI_API_KEY 或 env.GEMINI_API_KEY 及原有模型環境設定，不採用用戶提交的 key/model/provider/URL；OpenAI 優先，無 OpenAI key 時才使用 Gemini，不自動跨供應商重試。
- 新建獨立商品 schema/prompt，不更動名片定位、名片 OCR 與名片點數規則。
- 圖片文字明確視為資料，不得改變任務，不提供瀏覽、工具或執行能力；僅白名單提取結果，不把 AI 網址、狀態、折抵參數傳入寫入 API。
- 45 秒供應商上限、256KiB 回應上限、8 個候選、4500 output tokens；錯誤不回傳 provider 原始內容／key／image。
- OpenAI store:false；本系統不儲存原圖或結果（除使用者勾選公開 DM）。供應商資料處理仍依其政策，不宣稱完全零留存。
- 候選透過 textContent／input.value 顯示；無 innerHTML 拼入 AI 文字。

## 驗證與發布

- npm run test:store-product-ocr；已納入 full change guard。
- localhost 合成資料：test/browser/store-commerce-server.mjs + test/browser/store-product-ocr.js。只模擬 AI 與圖片上傳，不能據此宣稱真實 DM 辨識準確率或正式 R2 上傳已驗證。
- 與前階段一起發布須先查 migration 狀態，依序完成 0035／0036、Worker、前端。保留既有收款開關，不修改 secrets，不在未授權時部署。
- API 格式參考：[OpenAI structured outputs](https://platform.openai.com/docs/guides/structured-outputs)、[Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)。
