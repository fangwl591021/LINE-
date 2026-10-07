# 會員活動首頁縮圖與左側官方卡片一致

- 需求：使用者畫面為準，首頁外層使用與左側相同的4:3滿版裁切縮圖，詳細內容及全圖保留完整DM。
- 起點：LINE- main ed6f5c3906af8c2c524b9a6e0ef4f3e887c7a293；分支 codex/home-member-event-thumbnail。
- 只改：css/member-hosted-events.css 首頁限定縮圖樣式、index.html CSS快取版本、相關回歸斷言、會員活動合約與此工作單。
- 禁止：不改JS、圖片原檔、活動資料、DM上傳／辨識、會員列表及明細既有比例、登入／附件權限、Worker、金鑰、資料庫、點數、報名與QR。
- 已讀：member-hosted-events、home-activities-loading、core-invariants、feature-change-protocol、change-work-order-template。
- before：完整 change guard PASS（home-member-thumbnail-guard-before.log）。
- after：完整 change guard PASS（home-member-thumbnail-guard-after.log）；12 個 focused tests PASS，git diff --check PASS。
- 驗證：首頁左右縮圖皆4:3且填滿、無圖片載入跳位；明細與全圖仍等比完整顯示；320／390／620px容器及測試檢查；不寫正式活動資料。
- 瀏覽器結果：實際首頁DOM／模組＋真實handler的記憶體fixture，左右縮圖在320／390／620px容器皆同寬同高、object-fit:cover且無水平溢出；390px時兩側162.87×122.15px。明細541.6×812.4、全圖563.73×845.6，均與原圖1024×1536相同比例且contain。僅本機容器驗收，非LINE／手機實機驗收。home-member-thumbnail-preview.jpg為虛構活動截圖。
- 發布：僅GitHub Pages，完整after與PR CI PASS才合併，核對正式CSS/HTML bytes；Worker原樣。
- 回復：反向提交本次小型CSS變更或重新部署上述起點；無資料遷移。
