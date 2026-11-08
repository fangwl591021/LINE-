# Feature Change Protocol

This project must use a contract-first change rhythm for every functional edit.

## Purpose

Small edits have repeatedly affected identity, card ownership, card versioning, LIFF entry, LINE OA keyword replies, points, and button actions. The rule is now:

1. Run the current contracts before changing code.
2. Make the smallest scoped change.
3. Run the same contracts again after changing code.
4. Do not deploy if any contract fails.

<a id="rtk"></a>

## 開發時使用 RTK

每次撰寫、修改或除錯時，先限定本次的檔案與測試，再依下表選擇如何閱讀輸出。RTK 由開發者或代理逐條呼叫，專案不安裝自動改寫 hook。

| 工作 | 實際做法 |
| --- | --- |
| 定位與概覽 | 用 `git status --short --branch` 看工作區、`rg -n` 搜尋指定路徑。差異很長時，先用 `rtk git diff -- <路徑>` 概覽，再用 `git diff -- <路徑>` 核對要修改或提交的區塊。 |
| 一般本機測試 | 對輸出冗長且可重跑的測試使用 `rtk test node --test <測試檔>`。保留原本的測試範圍，立即檢查結束碼。若摘要只有最後幾行，想確認測試數量或警告時讀完整輸出。 |
| 測試失敗 | 在相同的本機 `RTK_RECALL_DB` 下執行 `rtk recall <摘要中的識別碼> --full`，核對失敗案例、檔案、行號及實際值與預期值。沒有識別碼或無法還原時，以原生命令重跑同一個本機測試。 |
| 需要完整紀錄的操作 | 金流、點數、身分及權限的差異審查、使用標準輸入的命令、Wrangler secrets、資料匯入、資料庫寫入及部署，直接使用原生命令。含憑證或正式客戶資料的內容也不送入 RTK 的本機紀錄。 |

換電腦時先用 `rtk --version` 確認工具可用。找不到時直接使用原生 Git、搜尋及測試工具繼續工作。評估成效時，`rtk gain` 只用來估計命令輸出減量；實際 Codex 用量、完成時間與補讀次數另行比較。

本專案的 `guard:before`、`guard:after` 及發布驗證一律執行原生命令，以完整輸出核對每一項契約。

## Required Command

Before editing a functional area:

```powershell
node tools/run-change-guard.js before
```

After editing:

```powershell
node tools/run-change-guard.js after
```

Both commands run:

```powershell
node tools/run-smoke-contracts.js --full
```

To inspect the exact contracts included in the full guard:

```powershell
node tools/run-smoke-contracts.js --list --full
```

## Required Work Order

Before a functional edit, copy and fill:

- `docs/release/change-work-order-template.md`

First, identify the change area:

```powershell
npm run scope:lookup -- my-card
```

Recommended command:

```powershell
npm run workorder:new -- my-feature "My feature title"
```

The work order must state:

- the exact feature being changed
- files expected to be touched
- files or systems that must not be touched
- contracts read before editing
- guard result before editing
- guard result after editing

## Change Boundaries

Before editing, identify which contract owns the affected behavior:

- LINE OA keywords: `docs/contracts/line-keywords.md`
- LIFF route behavior: `docs/contracts/liff-routes.md`
- Card ownership and versions: `docs/contracts/card-resolvers.md`
- Points and ledger behavior: `docs/contracts/points-ledger.md`
- Button URL / tel / mailto behavior: `docs/contracts/button-actions.md`
- Core invariants: `docs/rules/core-invariants.md`

If no contract covers the behavior, add or update the contract first.

If a contract exists but is not included in the full guard, check:

- `docs/audit/stale-contracts.md`

## Stop Conditions

Stop and do not deploy when any of these happen:

- A contract fails before editing.
- A contract fails after editing.
- A test requires changing unrelated product behavior to pass.
- The change touches identity, ownership, public/private pool, or point ledger without an explicit contract update.

## Handoff Format

Every completed change should report:

- Files changed.
- Contract list reviewed, when the affected area is high risk.
- Contract command run before the change.
- Contract command run after the change.
- Whether deploy was performed.
- Any known residual risk.
