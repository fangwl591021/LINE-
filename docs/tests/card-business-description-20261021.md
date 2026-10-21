# 名片公開業務搜尋與說明美化

## 入口

我的名片或有編輯權的收藏名片 → 所見即所得編輯 → 點說明文字 → AI搜尋並美化說明 → 看來源 → 核對後帶入說明 → 套用 → 儲存。

不需重填公司、電話、網址或社群；品牌／區域／業務補充為選填。未取得可核對內容不會儲存制式備援。

## 隔離驗證

- card-business-copy、card-business-copy-ui、OCR、store-ai-draft、store-ai-identity-social：102PASS／1選配browser skip；再新增實際Worker方法測試PASS。
- 選配RUN_CARD_BUSINESS_BROWSER_TESTS=1：Chromium 390×844手機尺寸6PASS。實跑搜尋按鈕、來源預覽、帶入、套用、關閉；模型與網路為fixture，不是真實LINE或iPhone。
- my-card-entry與my-card-button-editor-stability：4PASS。
- 完整run-change-guard beforePASS，afterPASS；精確快取版號斷言隨新版同步。舊home版本斷言僅同步既有8.27，沒有首頁功能變更。
- 拒絕單電話／單地址／錯誤電話／錯誤地址／虛構引文／登記頁橋接，拒絕借用多店通路頁其他店家服務。
- 來源共用DNS公開IP、HTTPS、轉址、大小與連續引文核對；平台key不下傳，搜尋僅送必要名片業務線索，來源不帶token。
- actor缺失、provider錯誤、重複點擊、欄位／actor／名片／版本改變及關閉後的過期回應，均不更新原名片。業務需求business_intent仍走舊分支。

## 真實唯讀研究與限制

指定名片原buyplus.one/dejoaro回傳404。公司電話及完整地址交叉搜尋，在供應商Le Pelican及Chez Bix公開通路頁找到再．這選DeJaarO與冰淇淋／手工香腸產品線索。公司／品牌名稱不同須人工確認；不自動改公司名稱，不把供應商全站服務套給此店。

- https://lepelican.com.tw/合作通路據點/
- https://www.chezbixsausage.com/pages/channel通路

正式D1只SELECT此指定名片，rows_written=0。未代使用者呼叫正式文案模型，未批次覆寫名片；正式模型搜尋品質與LINE手機最終操作仍需實收驗證。
