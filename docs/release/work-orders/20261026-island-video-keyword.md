# 人脈島影片名片關鍵字與個人文案

- 使用者需求：精準關鍵字「人脈島」回覆影片型名片，沿用既有影片名片編輯架構；已確認每位用戶各自修改標題、說明，互不影響。
- 起點：`origin/main`（115.10制度及人脈島背景音更新後），分支 `codex/island-video-keyword-20261026`。
- 本次只允許改什麼：人脈島影片名片本人文案讀寫、既有WYSIWYG文字編輯轉接、關鍵字前置認領及分享最新本人文案；必要快取、additive設定表、測試與規格。
- 本次禁止碰什麼：原本人影音檔／video_profile、靜態名片三版、角色／全域影片上傳權限、加入／註冊／AI交流資格、點數／交易、母站及非人脈島關鍵字、正式設定與排程；不發真人測試訊息。
- 明確邊界：固定既有9:16影片與MEGA；每位用戶只改自己的title／desc。沿用本人專屬ref/net與分享好友；取消不儲存。標題／說明不能讓用戶繞過加入及交流資格。
- 已讀：AGENTS、DESIGN、core-invariants、line-keywords、people-island-onboarding、card-resolvers、card-ownership-and-versioning、變更流程與發布技能。
- guard before：PASS，`../island-video-keyword-before.log`。

## 實作與驗證

- 本人GET／PUT及原Flex 17項PASS；簽章後實際webhook handler隔離5項PASS，含混合批次重簽／母站原始bytes／standby／重複token／群組／服務失敗。
- 相關原名片、商城關鍵字、參觀與新版整合共80項測試：79 PASS、1項可選瀏覽器預設略過；該可選舊名片說明瀏覽器另以開關啟用重跑PASS（6項全通過）。舊測試快取pin同步8.99，原登入檢查後再開詳細頁的既有guard不移除。
- 真正Workerd／D1 PASS：六次同UUID只存一份、兩分頁同revision僅一勝、A/B隔離、old/new登入只一份canonical copy，原cards／users不變。
- 新控制器瀏覽器12項PASS：包括實際controller＋實際mycard編輯器的標題／說明→套用→儲存本人PUT→重開→取消→分享最新本人文案；另驗409、同UUID重試、延遲回應切帳號、autoEdit只開一次、原join資格及320／390／1280。
- 原編輯器轉接瀏覽器PASS：實際欄位、singleflight、取消零寫入、恢復原personal object／影片、角色及token失效、原個人編輯器仍可重開。原人脈島參觀、分享與建卡瀏覽器回歸全部PASS。
- 完整guard after PASS；Worker dry-run PASS。所有API／LINE picker皆合成，真人LINE發訊、正式文案測試儲存、名片／點數異動均零。
- 正式發布前唯讀設定及排程hash與先前相同，0076兩表尚不存在。只新增0076專用表，不用全目錄migrations apply重跑既有直接套用遷移。

## 發布

可部署，等待PR必要CI後依既有授權直接發布。僅0076專用表、Worker與Pages，不更動既有資料、secrets、bindings、crons；部署後版本、設定、schema與實際前端內容讀回另存發布收據。手機LINE真人實收尚未測試；既有已發出的訊息不回溯改寫，儲存後重新輸入人脈島或重新分享才套用新文案。原影片和封面網址不變，不重新發布媒體。
