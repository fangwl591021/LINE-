# 總管勾選店家置頂

- 需求：使用者詢問店家如何置頂並要求勾選操作；後台店家列表供總管勾選即儲存，取消回一般排序。
- 基線：main 9a20981；完整before guard通過（repo外store-pinning-before.log）。
- 範圍：共用管理員店家列表、總管專用POST admin/stores/pin、獨立置頂/稽核表0085；一般帳號型店面與partner代建店家皆可設定，只影響已公開目錄。公開全部/搜尋/分類先置頂，再維持既有seed排序；跨兩來源SQL與游標一併處理，不只排當頁。
- 保留：原active/role/partner完整度資格、店面/商品版本與updated_at、AI審核、真新上架時間、owner/角色、價格/折抵/點數/交易及既有管理員GET唯讀；不自動替任何正式店家勾選。
- 設計：STORE_DIRECTORY_PINNING_ENABLED rollout旗標（未配置沿舊讀取，正式migration後啟用），新功能開啟卻缺schema明示服務不可用；版本CAS、冪等request_key、寫入時重驗總管身份快照與aliases/links，置頂與audit同交易。UI失敗還原、未知結果同鍵重試、過期帳號/離頁不回寫。
- 已讀：AGENTS、DESIGN、core-invariants、store-shop/商城後台契約、feature-change-protocol、line-release-verification、Workers/Wrangler指引。
- 驗證：相關 Node 測試 86/86、隔離 browser 31/31 與 Worker dry-run 通過；完整 after guard、CI、正式空表 migration 和版本讀回於發布時完成。正式介面只查看 checkbox，不挑選或變更任何店家排序。
