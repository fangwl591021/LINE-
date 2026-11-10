# 首頁進入速度與請求期限

- 優化不能跳過LIFF、好友、本人身分、fresh checkUser、商品賣家資格或點數真值。功能深連結仍由既有專屬入口處理。
- fetchAPI原有每個action期限必須涵蓋headers與完整JSON body；結束或失敗後finally清除timer。Body被取消須回逾時語意，不可改成格式錯誤、假成功或自動重送寫入。
- 首頁收銀紀錄的customer資料可在單一已授權request內按customerID重用，獨立customer有界並行；輸出紀錄排序、actor scope、每筆fallback及欄位與原來相同，不將身分或角色跨request快取。
- 點數失敗保持loading/error，不以0或舊帳號餘額代替。未證實收益的全頁lazy/defer改動不納入此次修補。
- 合成延遲／請求數與正式實際登入耗時分別記錄；未登入隔離瀏覽器的LINE登入頁指標不能當會員首頁速度。
