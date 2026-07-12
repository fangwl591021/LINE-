# 名片穩定化遷移策略

## 原則

- 先觀察、後切讀、最後才寫入。
- 不直接改 remote D1、不自動合併、不以姓名或電話決定 ownership。
- 每一階段都可透過 feature flag 回復 legacy resolver。
- 所有輸出只保留統計與 masked identity。

## Phase 0：稽核基線

1. 固定目前 production/staging commit 與 resolver 行為。
2. 保存完整 D1 schema snapshot（只讀），補齊 `card_contacts` 與 claim/merge 相關表欄位清單。
3. 執行 `tools/audit-card-stability.js` local snapshot/local D1。
4. 以代表性 masked fixture 執行 `tools/trace-card-resolution.js`。
5. 建立 Critical/High finding ledger，不改資料。

退出條件：可回答每個入口的 actor、candidate、排除原因、最終 row 與 permission。

## Phase 1：Canonical identity adapter

- 新增純函式 adapter，將 LINE/profile/legacy alias 正規化為 canonical actor。
- adapter 不修改資料，不改 resolver 結果。
- owner/profile/line/bound 不一致時輸出 divergence，不自行修正。

Rollback：停用 adapter trace。

## Phase 2：Shadow resolver

- 所有 17 類入口同時執行 legacy read 與 target read。
- 正式回應仍使用 legacy 結果。
- 記錄：入口、requested version、candidate count、masked selected id、divergence code。
- 不記錄姓名、電話、Email 或完整 UID。

主要 divergence：

- `PERSONAL_CONTACT_MIX`
- `MULTIPLE_PERSONAL`
- `VERSION_MISMATCH`
- `IDENTITY_CONFLICT`
- `TENANT_BOUNDARY`
- `LEGACY_UNCLASSIFIED`
- `NO_CLAIM_AUDIT`

Rollback：關閉 shadow flag，無資料回寫。

## Phase 3：資料分類快照

建立只讀分類結果或新 shadow tables：

- personal candidate
- contact collection
- ambiguous legacy
- version record
- identity link candidate

禁止更新原 `card_contacts`。每筆分類保留 classifier version 與原因。

Rollback：刪除／停用 shadow tables，不碰來源資料。

## Phase 4：人工確認 ownership

僅處理：

- 同 UID 多 personal
- owner/profile/line/bound 衝突
- claimed 無 audit
- 只能靠姓名／電話推測 owner

每筆需人工選 canonical target；操作先產生 proposal，不立即套用。

## Phase 5：建立 target records

- copy，不 move。
- personal aggregate 與四個 version records 分離。
- contact collection 保留 scanner、creator、source event。
- claim/merge 建 immutable events。
- legacy row 保存 target pointer。

驗證：row count、collection count、版本 count、masked resolver parity。

## Phase 6：分入口切讀

建議順序：

1. public card read
2. CRM read-only list
3. AI 名片夾 list
4. LINE OA 影音名片
5. LINE OA 我的名片
6. 我的名片 editor read
7. claim/merge write paths

每個入口獨立 feature flag。Critical divergence 不為零不得切換 write path。

## Phase 7：受控雙寫

- legacy 與 target 同時寫入，但 target failure 不得靜默。
- ownership 欄位只允許 claim/unlink/merge service 修改。
- 版本更新只寫指定 version namespace。
- 每次寫入附 resolver/classifier version 與 audit event。

Rollback：停止 target write，legacy 仍為正式來源；以 event replay 修復 target。

## Phase 8：完成切換與封存

- target resolver 成為正式讀取。
- legacy row 轉唯讀，保留 rollback window。
- 禁止 destructive cleanup，直到兩個完整營運週期無 Critical divergence。

## 驗收指標

- 同 owner active personal aggregate：最多 1。
- 同 personal + version active record：最多 1。
- contact owner 非空：0（recognized person link 不算 owner）。
- scanner history loss：0。
- prefix/config version conflict：0。
- static/video asset namespace conflict：0。
- 相同 actor 不同入口 resolver divergence：0。
- ownership change 無 audit：0。

## 第一修補批次

CS-1 僅包含 canonical identity adapter、masked shadow resolver trace、schema snapshot audit 與 claim/merge audit contract。不得修改現行名片選擇結果、UI 或 D1 正式資料。
