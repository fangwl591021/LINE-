# 單品人工放行確認操作相容修正

- 延續使用者已明確同意的按摩機單品網購放行；不擴大範圍。
- 起點main3acaa7e736710fff52ca5cf79b7b75163d592c88；branch codex/manual-release-inline-confirm-20261019。
- BEFORE full guard PASS。契約沿用 store-admin-catalog、store-listing-review、core-invariants、release protocol。
- PR224/Worker0f1799a8-6c00-4f61-ad8d-4616ab39930d/Pages均已發；實際Chrome確認窗後CDP失去回應，已讀資料核對仍in_store/version1、無新audit。不換request重送、不猜成功、不動帳本。
- 只修新單品分支的UI：勾選既有「已獲店主同意」後，顯示「確認人工放行網購」專用提交按鈕；此分支不用原生window.confirm，保持明確勾選＋主動提交兩步。一般編輯仍保留原生儲存確認。
- 後端固定商品、版本、內容bytes指紋、原medical-only manual、角色、CAS及audit全部不改；無Worker／migration／秘密／點數／資料寫入變更。
- 補測320/390/1440及零native dialog，夾帶修改拒絕、同payload重試及無能力隱藏；舊admin-linked回歸及AFTER guard。Pages-only發布後執行一次已同意的正式保存，再查公共模式與audit。
