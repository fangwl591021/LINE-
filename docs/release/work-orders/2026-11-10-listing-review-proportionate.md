# 上架審核尺度與證據格式

- 需求：使用者反映神通酵素上架出現「AI審核證據不完整」且尺度太嚴；已明確選擇一般食品、保健食品、日用品與一般保養可通過，明確疾病/治療/器官修復宣稱紅字待確認。
- 基線：main f9dc54b；完整before guard通過（repo外listing-proportionate-before.log）。
- 修改：限定既有後端審核prompt、證據正規化及相關契約/測試；沿用既有後端OpenAI設定，不建立或修改金鑰。短逐字引用、固定6000輸出上限；同欄原文僅容忍NFKC全半形與空白差異，必須錨回原文字片段，不接受摘要、跨欄或捏造證據。一般保健不因品名/份量/一般機能推為醫療，具體療效列manual；實際禁售品仍拒絕。
- 保留：policyVersion、原snapshot指紋及已釘死單品人工同意、圖片DNS/bytes驗證、全部政策檢查、服務錯誤不公開、quota/timeout/有界回應、role/owner/CAS/價格/折抵/點數/交易及原表單。prompt v2讓舊判定不再壓住新審查。
- 驗證：完整before及最終after guard通過；審核/單品特例/後台回饋共62項測試通過，其中審核46項保留原27項並補錨定/快取/invariant等19項。隔離catalog browser在320/390/1280的紅字、原文安全、取消、同請求重試及預檢不公開通過，productionWrites=0；Worker dry-run通過。provider語義案例使用合成回應，不當成真模型準確度。
- 發布：CI通過後合併並發布Worker，核對bundle/settings/cron及Pages來源讀回；正式只針對相關草稿做一次預檢，不批次或自動上架、不改商品內容/價格/狀態，不碰原未儲存頁面。證據存repo外listing-proportionate-*，正式模型預檢結果留在私有本機證據。
- 已讀：AGENTS、core-invariants、store-listing-review契約、原10-08政策與11-10澄清工作單、feature-change-protocol、line-release-verification及Workers/Wrangler指引。服務回覆解析與權限問題分開，不將未完成當作違規。
