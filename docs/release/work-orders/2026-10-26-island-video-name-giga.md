# 人脈島影片姓名及 GIGA 卡片

- 使用者指定：展示影片的示範姓名「林采晴」改為「楊滄棋」，影音名片尺寸改為 GIGA。測試通過直接部署。
- 基準 origin/main b04d3c47e636b715754407ecabf17b2f57ec2994；before full guard PASS（../island-video-name-giga-before.log）。
- 只調整人脈島宣傳影片的示範姓名、版本化 MP4/JPG 連結、單張 Flex bubble size 及必要快取版本、聚焦測試與契約。
- 原直式 9:16、45 秒、旁白字幕、加入／分享好友、本人 ref/net、左右建卡入口及 AI 審核流程保留。
- 不修改 Worker、會員、正式名片、推薦歸屬、點數、訊息、schema、設定或排程。新媒體以 R2 people-island/video-card-v2.* 新物件發布，v1 不覆蓋；可編輯來源只留本機。
- 已讀 feature-change-protocol、people-island-onboarding、liff-routes、card-resolvers、core-invariants；官方 LINE 文件確認單張影片 Flex 支援 giga。
- 驗證：影片完整解碼、9:16 H.264/AAC、姓名畫面視覺檢查、完整 after guard、分享與入口瀏覽器回歸、R2 公開讀回雜湊與影片播放、Pages 正式讀回。
- after full guard PASS（../island-video-name-giga-after.log）；入口瀏覽器 42 項、本人分享及 GIGA 12 項、左右建卡入口 12 項 PASS，合成身分與攔截 API，無正式資料寫入。
- 新影片 45 秒、1080×1920、24fps H.264/AAC；完整解碼與音量檢查 PASS。8/18/28/39 秒畫面已視覺檢查，18 秒介紹顯示「楊滄棋」。原旁白音檔沿用。
- MP4 SHA256：6eee66d1e4167d315bad053c110cfe0f20497fd004b2804bbf782d61419b45f2；JPG：475029d198bd69ab2d117834571ef1a4281cc6c14e4791378899123baaf094c3。
- 本機產物及可編輯來源保存在 ../people-island-video-v2-output/；發布只含 MP4/JPG 與前端，正式讀回／播放收據另存 island-video-name-giga-live.json 及 island-video-name-giga-playback.json。手機 LINE 實收尚未驗收；既有聊天室訊息內容不會回溯變更，新分享才會使用 GIGA 與 v2 影片。
