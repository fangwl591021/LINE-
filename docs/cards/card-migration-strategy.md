# 名片穩定化遷移策略

## 原則

- 先觀察、後切讀、最後才寫入。
- 不直接改 remote D1、不自動合併、不以姓名或電話決定 ownership。
- AI 名片夾 contact collection 在認領後必須保留，不得 move/delete。
- 一個 canonical person 僅能有一個 active personal aggregate。
- inviter、scanner、owner 是不同角色，不得互相覆寫。
- 每一階段都可透過 feature flag 回復 legacy resolver。
- 所有輸出只保留統計與 masked identity。

## Phase 0：稽核基線

1. 固定目前 production/staging commit 與 resolver 行為。
2. 保存完整 D1 schema snapshot（只讀），補齊 `card_contacts` 與 claim/merge/會員推薦相關表欄位清單。
3. 執行 `tools/audit-card-stability.js` local snapshot/local D1。
4. 以代表性 masked fixture 執行 `tools/trace-card-resolution.js`。
5. 建立 Critical/High finding ledger，不改資料。
6. 針對 LINE 建立、本人上傳、認領三入口確認是否會產生競爭 personal rows。
7. 針對已認領 contact 確認 scanner、collection、inviter 是否仍存在。

退出條件：可回答每個入口的 actor、candidate、排除原因、最終 row、permission、claim relation 與 inviter relation。

## Phase 1：Canonical identity adapter

- 新增純函式 adapter，將 LINE/profile/legacy alias 正規化為 canonical actor。
- adapter 不修改資料，不改 resolver 結果。
- owner/profile/line/bound 不一致時輸出 divergence，不自行修正。
- scanner、collector、inviter 僅作 relationship role，不得被 adapter 當成 personal owner。

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
- `EXISTING_PERSONAL_CREATE_ATTEMPT`
- `CLAIM_CONTACT_LOST`
- `CLAIM_POINTER_MISSING`
- `INVITER_CONFLICT`
- `MY_CARD_RESOLVED_CONTACT`

Rollback：關閉 shadow flag，無資料回寫。

## Phase 3：資料分類快照

建立只讀分類結果或新 shadow tables：

- personal candidate
- contact collection
- claimed contact relation
- canonical personal pointer
- inviter membership relation
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
- claimed contact 已遺失 scanner／collection
- claimant personal 與 contact 沒有 canonical pointer
- inviter 與 owner/scanner 衝突
- 只能靠姓名／電話推測 owner

每筆需人工選 canonical target；操作先產生 proposal，不立即套用。

## Phase 5：建立 target records

- copy，不 move。
- personal aggregate 與四個 version records 分離。
- contact collection 保留 scanner、creator、source event。
- 已認領 contact 保留原 collection，另建 recognized/canonical pointer。
- claimant 沒有 personal 時才建立 personal aggregate；已有 personal 時只建立 merge proposal。
- inviter relation 建在會員／identity relationship，不建成 personal ownership。
- claim/merge 建 immutable events。
- legacy row 保存 target pointer。

驗證：row count、collection count、claim relation count、inviter relation count、版本 count、masked resolver parity。

## Phase 6：分入口切讀

建議順序：

1. public card read
2. CRM read-only list
3. AI 名片夾 list
4. claimed contact relation read
5. LINE OA 影音名片
6. LINE OA 我的名片
7. 我的名片 editor read
8. LINE 建立／本人上傳 create guard
9. claim/merge write paths

每個入口獨立 feature flag。Critical divergence 不為零不得切換 write path。

## Phase 7：受控雙寫

- legacy 與 target 同時寫入，但 target failure 不得靜默。
- ownership 欄位只允許 claim/unlink/merge service 修改。
- 建立 personal 前必須執行 canonical uniqueness guard。
- claimant 已有 personal 時禁止建立新 row，只能回 existing/edit 或 merge proposal。
- claim 同時寫入：contact preservation、canonical pointer、personal create/link、inviter relation、claim audit。
- 任一步驟失敗，整個 target claim transaction 不得標記成功。
- 版本更新只寫指定 version namespace。
- 每次寫入附 resolver/classifier version 與 audit event。

Rollback：停止 target write，legacy 仍為正式來源；以 event replay 修復 target。

## Phase 8：完成切換與封存

- target resolver 成為正式讀取。
- legacy row 轉唯讀，保留 rollback window。
- 禁止 destructive cleanup，直到兩個完整營運週期無 Critical divergence。
- contact collection 與 claim event 不因 personal 切換完成而刪除。

## 驗收指標

- 同 owner active personal aggregate：最多 1。
- 同 personal + version active record：最多 1。
- contact owner 非空：0（recognized person link 不算 owner）。
- scanner history loss：0。
- claimed contact collection loss：0。
- claimed contact 無 canonical pointer：0。
- 已有 personal 又執行 LINE create：0。
- 邀請認領完成但 inviter relation 遺失：0。
- inviter 被寫成 personal owner：0。
- prefix/config version conflict：0。
- static/video asset namespace conflict：0。
- 相同 actor 不同入口 resolver divergence：0。
- 聊天室「我的名片」解析 contact：0。
- ownership change 無 audit：0。

## 第一修補批次

CS-1 僅包含 canonical identity adapter、masked shadow resolver trace、schema snapshot audit、personal uniqueness create guard contract，以及 claim/merge audit contract。claim 目標語意固定為：保留 contact collection、建立或連結唯一 personal、固定 inviter；不得修改現行名片結果、UI 或 D1 正式資料。
## CS-1A gate

Before any migration or runtime shadow hook, fixture-only resolver parity must remain green. This branch contains no production migration, remote D1 action, or data repair. Divergence output is proposal-only and masked.

## CS-1B hook rollback boundary

The future shadow hook rollback is `CARD_SHADOW_RESOLVER_ENABLED=off`. This foundation has no runtime integration, migration, or data transformation. Any later integration must prove flag-off performs no additional query and that the legacy response object, status, headers, and body remain unchanged.
