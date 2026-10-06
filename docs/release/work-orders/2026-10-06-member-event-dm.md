# 會員辦活動 DM/PDF 草稿匯入

日期 2026-10-06；需求：在 VEO 移植的辦活動表單增加 DM 解析，參考福委會。
起始與回復 commit ee230a87467ce835a8f89e3b8919f547a218528a；Worker 034200d1-4b82-4cb8-8b78-933862fced67。

## 範圍

僅會員辦活動的 DM/PDF 選檔、解析預覽、重新辨識與確認套用；現有會員驗證後才呼叫既有 OPENAI_API_KEY。參考 Sakura src/activity-import-ui.js/activity-import.js（唯讀），不照搬管理員權限或新建官方活動 API。
允許新 parser module、隔離 quota migration、member-hosted UI/dispatch、快取版本與測試；不動官方活动、點數、私人行程保存、身份解析、LINE keyword、名片或福委會。

## 契約與防護

已讀 core-invariants、points-ledger、member-hosted-events、feature-change-protocol。guard before PASS。
圖片 JPG/PNG/WebP 選檔10MB以內、瀏覽器等比例縮小至4MB以內；PDF4MB以内。選檔僅本機預覽；使用者點辨識才送平台AI，store:false、不上傳Files/R2、不公開原檔。
單次會員限流（15秒間隔、台灣每日20次）在獨立 member_event_dm_usage 表原子預留，不寫活動/報名/點數。失敗亦计次，不自動重試。
名稱/時段原文/地點/說明先預覽，缺漏空白人工補；多時段本模式選一場，不拆獨立活動、不改官方梯次。覆蓋手填內容前確認，換圖/關閉/切身份拒絕舊結果，失敗保留原表單。
預覽/套用不得發布，發布仍是既有確認頁唯一入口；背後不建立私人 task。

## 驗證與發布

已驗證：30項 DM／既有辦活動／官方DM專項通過；before/after full guard PASS。390/1024瀏覽器隔離模擬通過圖片/PDF、明確辨識與套用、多時段單選、覆蓋拒絕、未知費用必填、取消晚到回應、切身份阻擋、編輯保留同一eventId。既有建立/報名/真實jsQR合成相機核銷/關相機/取消回歸也通過。
發布步驟：只套用0056 migration、keep-vars部署、Pages檔案核對與正式資產隔離模擬；上架識別記錄在本次release receipt。所有瀏覽器模擬的AI回應皆為mock，不宣稱OCR準確率或實體手機驗收。
正式 AI 準確率以清晰 DM 樣本驗證另行標示；虛構AI不得冒充真實辨識。退版保留quota表，回復此PR和原Worker，不刪任何活動或報名。
