# 人脈島影音名片與參觀資格

- 使用者確認：9:16 人脈島影片；先走點數通加入流程，加入後可參觀但不能交流；完成註冊、本人名片 AI 審核通過才可交流。建議上傳本人名片，也保留自行填寫。
- 新增獨立 people-island-card.html 推廣／參觀入口，不覆蓋任何人的既有靜態或影音名片。影片展示實際場景、繁中字幕及配音；示意會員明確標示，不假冒真人訊息或在線。
- 新 API /v1/island-entry/status、/members：LINE access token 必須重新驗證；加入資格由 LINE friendship API 伺服器核對，不能信任 URL、前端旗標、任意 UID 或只是點過加入。
- status 回傳 stage：join（未加入）、register（無既有會員）、card（無有效本人名片）、review（待審／未通過）、ready（既有會員且有效本人名片 ai_review_status 明確 passed）。失敗保持未知並可重試，不當作通過。
- 參觀名冊只取原公開 self_profile 的安全摘要，不回傳電話、email、社群、網址、地址、私人名片、原始 UID、名片設定或聊天內容；保持停止聯絡、封鎖、canonical 身分條件。讀取不建立會員、不建聊、不送訊、不配對、不登記成已審核在線會員。
- 所有交流寫入在伺服器檢查註冊會員及有效本人 self_profile 的明確 passed 審核；空白、pending、failed 不能放行，收藏別人名片及 video_profile 不算本人資格。保留原封鎖、參與者、歸屬和內容檢查。私訊讀取與已存在紀錄不刪除，公開閱讀不改為審核門檻。
- 名片審核通過不能由客戶端旗標授權：真正 AI 審核成功後，伺服器以已驗證操作者、名片識別及內容雜湊保存短期 KV 核對紀錄。儲存本人名片時須比對相符紀錄；既有已審核且內容未變者保持資格，變更審核內容但無相符紀錄則待審。AI／核對儲存失敗不提升資格，前端傳入 aiReviewStatus 或 safetyReview.pass 不能直接取得資格。
- 參觀 UI 只讀介紹，不能提供可繞過限制的聯絡按鈕、建立對話、發文或按讚。未完成資格時直接引導註冊／本人名片設定，保留 ref/network 歸因與返回入口；不自動公開本人名片。
- 既有會員資料、推薦歸屬、點數、LINE reply owner、排程、bindings、vars/secrets 不變；無 schema migration，不發正式測試訊息。

## 入口與平台規格

- people-island-card.html 為不需登入的影片預覽；所有實際加入／分享／參觀使用既有 LIFF index 入口 peopleIslandCard=1，保留 ref/net；不在可能超出 LIFF endpoint 範圍的獨立預覽頁初始化 LIFF。
- peopleIsland=1&islandSetup=register|card 只接既有註冊或本人名片設定；提供返回人脈島重新查核，審核通過後 peopleIsland=1 才開原完整島嶼。
- Flex 為獨立 mega 單泡泡、hero video 9:16、同比例封面與 altContent、純 URI 按鈕；不包 carousel，不覆寫會員 video_profile。分享只由使用者明確點擊並確認收件者，取消不顯示已傳送。
- LINE 官方規格核對： https://developers.line.biz/en/reference/line-login/#get-friendship-status 、https://developers.line.biz/en/docs/messaging-api/create-flex-message-including-video/ 、https://developers.line.biz/en/docs/liff/developing-liff-apps/ 、https://developers.line.biz/en/reference/liff/#share-target-picker 。

## 審核結果的伺服器權限

- 客戶端 aiReviewStatus 或 safetyReview.pass 不得提升資格。真實 reviewCardSafety 先核對登入與名片管理權限，再以實際 AI 結果寫入一小時 KV 憑據；綁定驗證會員、名片列及完整審核內容雜湊，包含模型輸入限制之外的文字／按鈕尾段。
- 最終合併後 self_profile 儲存只能採用相符憑據；舊的有效、未封存、未合併 self_profile 僅在審核內容未變時保留明確既有結果。其他來源的 passed 不得藉轉換來源繼承；改內容且無有效憑據回到 pending，不改私人／公開選擇。
- 新的通過報告無有效憑據時回傳 AI_REVIEW_RECEIPT_REQUIRED，不能讓前端誤報審核成功。KV／服務失敗不提升權限，未改內容的既有通過資格保留。參觀者或待審者不得寫入人脈島在線心跳。

## 分享好友及本人專屬連結

- 分享出的 Flex footer 保留加入按鈕，另增加「分享好友」URI；islandShare=1 僅代表使用者明確點擊後開啟選人視窗，不是加入或交流資格。普通入口不自動開啟，取消或失敗可手動重試，不因重新整理資格／BFCache／切帳號自動重開。
- GET /v1/island-entry/share-link 以即時 LINE profile 與 canonical 會員資料產生本人 ref/net 的固定 LIFF 入口，不接受外來 UID、ref、net 或網址；只回傳本人的入口。未加入也可分享宣傳卡，原參觀好友及交流審核資格維持。
- 每次分享 A→B→C 使用當下分享者自己的連結。收到別人的連結時，於已驗證的本人瀏覽器身分下保存原首次推薦來源，沿用既有 writeFirstReferral／resolveReferralForRegistration；分享不改寫任何已存在會員關係。
- 不接管母站「會員分享」關鍵字或 replyToken，不增加 LINE 推播、獎勵或正式資料寫入。專屬連結取得失敗或登入變更時不分享錯誤連結。
