# 人脈島建立名片左右雙入口

- 使用者指定：把「查看名片與審核」分成左右兩顆按鈕，左「上傳名片」、右「用 LINE 生成（需填個資）」。
- 起點 f83c31b；僅前端既有名片／會員表單與必要載入版本，原 LINE- Pages。before guard PASS（../island-card-choices-before.log）。
- card/review 狀態以固定兩欄選擇建立方式，分享入口保留。upload/line 意圖可通過原註冊流程後返回，不直接在載入時上傳、生成或公開。
- LINE 方式先填／確認真實姓名、手機、既有生日格式及隱私同意，明確按確認後沿用會員儲存；只有儲存成功、身分仍有效且確認沒有本人名片時才生成。已有名片接既有編輯，不能重複建立或靜默覆蓋；失敗不當作沒有名片。
- 上傳方式沿用本人名片的新建 OCR／既有圖片更新路徑，不走收藏別人名片。取消不儲存。
- 不改 Worker、審核核對、推薦歸屬、會員編號、點數、通知、schema、正式設定或排程；測試不操作正式帳號或發 LINE。
- 已讀 people-island-onboarding、card-resolvers、core-invariants、liff-routes、feature-change-protocol。
- 變更檔案：people-island-card.html、css/people-island-card.css、js/modules/people-island-card.js、js/modules/mycard.js、js/auth.js、index.html；契約、測試與 full smoke 清單同步更新。
- after guard PASS（../island-card-choices-after.log）；首次發現舊名片流程的靜態檢查不接受新增的登入有效性檢查，僅更新該規則以容許明確的 scopedCurrent 檢查，原 load → detail 順序仍受保護。
- 實際 helper 11 項 PASS，已納入完整契約；瀏覽器雙入口 12 項 PASS（320/390/1280）、既有入口 42 項、實際 auth 入口 7 項、本人分享 12 項回歸 PASS。測試攔截 API、使用合成身分，不發 LINE、不寫正式個資或名片。iPhone 檔案選擇保留同步點擊手勢；尚未實機驗收。
- 發布方式：僅原 LINE- GitHub Pages；正式設定 hash／排程及 Worker 版本發布前後核對，正式頁面讀回雜湊與版本載入參數驗證。發布結果另保存在工作目錄外的 island-card-choices-live.json。
