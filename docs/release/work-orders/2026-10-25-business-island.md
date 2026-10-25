# 人脈大富翁改為可操作商務交流島

- 基準：e0f79b5b6820d478e30ca9985a4e15b9c5bcd37f，2026-10-25。
- 發版整合基準：324f6f8079f167f7f789c4a132e22b7e273ff659；保留並行 PR254 的簽到發布按鈕修復，無檔案重疊。
- 使用者要求：依確認的島嶼風格取代大富翁，串接現有會員、公開名片、私訊，手機好操作，其餘功能不動。
- 範圍：新增交流島 JS/CSS/場景資產與唯讀公開名片 endpoint，調整人脈入口／路由／載入版本、相關契約和回歸測試；商城大富翁與其他功能保持。
- 先建立 business-island 契約；已讀 feature-change-protocol、core-invariants、card-resolvers、game-center 及現有私訊契約。
- 不改資料／schema／users/card_contacts/identity links／點數／商城／通知；不以查看名片建立空對話、不用任意舊詳情API讀私人卡。
- guard:before／after PASS；相關後端、頭貼、私訊、入口與商城測試 104/104 PASS；真 Chrome 回歸 14/14 PASS，320／390／768／1440 無橫向溢出，主要控制至少44px。
- 瀏覽器使用真交流島與原 member-chat compose、原商城 provider；合成建聊1次／送訊1則均由明確按鈕觸發，外部請求0、pageerror0。覆蓋唯讀卡片不建聊、搜尋／業種／排序／分頁、頭貼失敗、XSS、延遲載入與離頁／換帳號、分頁切區、清單重開、商城進店返回及真app外框恢復。
- 快取版本更新 navigation v8.04／business-richman v1.3，兩項舊版本白名單僅擴到本次版本，原相機與首頁行為檢查保持。
- 桌面僅交流島 body class 擴寬 app／使用自身頁首，離島恢復原448px外框與導覽；手機保留原內部縱向捲動。
- 視覺資產使用已確認風格產生乾淨場景，介面／會員／互動皆由實際程式繪製及驗證。
