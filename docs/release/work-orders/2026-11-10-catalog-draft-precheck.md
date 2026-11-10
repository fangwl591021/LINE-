# 草稿商品僅檢查，不公開

- 需求：能通過者公開，有疑義者保留草稿並紅字說明。需先取得疑義結果，不以送出公開來檢查已知有疑義的商品。
- 基線：main 07a146e。限定管理員單店商品草稿之審核預檢；原公開、CAS、名額、價格、折抵、點數與既定醫療政策不變。
- 新POST admin/catalog/review只對目前已讀取版本的draft product檢查status active所需條件；changes僅status，無manual例外。使用同一AI／圖片／正常review紀錄，但無論allow/reject/manual/error都不寫商品、店面或catalog audit。allow明示published:false。
- 清單按鈕『檢查上架條件』顯示不會公開，防重送和遲到資料；通過後仍須原上下架流程公開。有疑義重讀原審核回饋紅字；技術錯誤明示檢查未完成，不判定內容違規。
- before完整guard待核對；target/backend/UI/full after/dry-run及正式僅檢查零狀態寫入驗證待補。
- before完整guard PASS；後端新9項及原catalog/feedback共44項PASS；新版Chrome UI預檢、重按/導覽鎖定、晚回應、三寬紅字/取消/重試全部PASS。預檢只代表內容審核，正式上架仍另核對原方案名額／版本。
