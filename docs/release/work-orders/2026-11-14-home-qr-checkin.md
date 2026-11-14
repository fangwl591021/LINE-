# 首頁會員 QR 與簽到入口

- 需求：依使用者圖片，首頁會員資訊列提供「我的 QR（累積／折抵）」，底部中央改為「簽到贈點 每日10點」。
- 起點：`84faaeb`；範圍：一般首頁入口及必要的樣式、既有入口還原、測試與設計文件。
- 沿用原本本人點數 QR 與每日簽到流程，店家工作台保留掃碼／贈扣點。不得修改點數身份、帳本、簽到金額、交易或 Worker。
- 契約：`docs/rules/core-invariants.md`、`docs/contracts/points-ledger.md`、`docs/contracts/store-point-cashier-protected-flow.md`、`DESIGN.md`。
- 前置：`npm run guard:before` 通過。
- 驗證：`npm run guard:after` 通過；簽到與首頁 QR 專項通過。隔離 Chrome 使用合成會員、店家及總管確認本人 QR、失敗、離頁、登入身分切換清除；320／390px 無水平溢出。未以真人帳號觸發實際簽到或扣點。
- 發布：只發布前端，保留現行 Worker、資料與其他待發布變更。
