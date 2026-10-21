# 名片說明依實際業務美化

- 日期2026-10-21；起始origin/main db0138a7f9cc42fdef5e92a4b4b84276e1e32113；branch codex/card-business-description-20261021。
- guard before完整PASS。
- 使用者要求：名片AI說明不能只是重述姓名職稱與聯絡方式，應依實際業務美化。
- 原因：OCR prompt鼓勵身分／聯絡樣板且強制非空；generateCardCopy固定4–5短行但不驗業務來源；cardmaster失敗還會儲存制式本機版本。
- 範圍：共用業務文案規則／OCR與generateCardCopy；名片編輯器說明欄提供AI草稿預覽與明確帶入；移除AI失敗覆寫。不得批次修改正式名片。
- 不改UID、ownership、名片版本、聯絡連結、公開／審核規則、點數、會員編號、webhook reply、provider/key/model或額度；無migration。
- 已讀feature-change-protocol、工作單模板、core-invariants、my-card、ai-card-folder、card-resolvers、card-ownership-and-versioning、points-ledger、regression-matrix；新增契約card-business-description。
- 沿用平台OPENAI_API_KEY／GEMINI_API_KEY，已以secret名稱查驗，無新key、無plaintext讀取或輸出。
- 使用者補充要求先自動查官網、電話、社群、公司名，不要求重填業務。截圖名片唯讀核對：既有services只有公司／職稱／聯絡套話，business_offer空白；原連結buyplus.one/dejoaro目前404。公開搜尋僅找到公司識別，尚未確認實際業務；不猜公司名、照片或登記業種，不改此正式名片。
- 新搜尋模式共用既有店家安全來源驗證；名片專用50次／日及15秒原子節流，不改店家額度。舊卡預覽→帶入→套用→儲存；錯誤與過期回應不覆寫。前端generateCardCopy專屬逾時100秒，供網站＋搜尋＋來源核對，不改OCR單次呼叫。
- 實際以公司電話搜尋後，供應商公開通路頁出現再．這選DeJaarO；電話、完整地址與名片相符，含冰淇淋／手工香腸商品線索。加入名片專用雙線索品牌橋接與多店頁摘錄範圍測試，不自動更正原公司名。
- 已通過針對測試95項及手機尺寸Chromium6項；完整after曾因新腳本快取版號需同步而失敗，精確更新版號斷言後PASS；新增雙線索後須重跑。不是實機iOS或正式模型／LINE實收驗收。
- 最後功能測試：103項中102PASS、1項選配瀏覽器skip；選配手機尺寸Chromium另跑6PASS；實際Worker文案方法15PASS（含認證actor、錯誤與business_intent保留）；my-card入口／按鈕4PASS。完整after在品牌雙線索版本PASS。無正式名片／點數寫入、無推播測試。
- 附帶測試維護：my-card入口測試的舊home快取斷言8.18同步現有8.27，沒有更動home功能；新腳本精確版號core7.38、mycard8.94、cardmaster1.6。
- 待：發布與正式資產核對；測試通過直接部署。正式模型品質與手機LINE操作須另作實收驗收，不能以fixture測試宣稱已完成。
