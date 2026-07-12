# 名片目標模型

## 1. 核心實體

### Person identity

- canonical person key：受信 LINE UID 對應的內部 `person_id`。
- LINE UID、legacy UID、profile alias 只作 identity mapping，不直接互相覆蓋。
- tenant/network boundary 必須是 resolver 的必要輸入，不可在查不到時 fallback 到其他 network。

### Personal card

- 一個 `person_id` 僅有一個 active personal card aggregate。
- 四版型不是四個互相競爭的 owner row；它們是同一 personal aggregate 下的四個 version records：`standard`、`giga`、`square`、`video`。
- 每個 version 只能有一個 active revision，歷史 revision 保留。

### Contact card

- contact card 是 collector/scanner 的私有聯絡資產。
- 同一被辨識人物可被多個 scanner 各自收藏，但每一個收藏關係獨立。
- contact card 可指向 recognized person，但不能因此自動取得 personal ownership。

## 2. 建議資料結構

- `card_entities`：card aggregate、type、person_id、network_id、visibility、status。
- `card_versions`：card_id、version、revision、content_json、cover/video namespaces、active flag。
- `card_collections`：contact card 與 scanner/collector 的關係。
- `card_identity_links`：line/profile/legacy identity 到 person_id 的 mapping。
- `card_claim_events`：claim request、proof、before/after、actor、result。
- `card_merge_events`：source/target、field decisions、actor、timestamp、rollback pointer。
- `card_resolution_traces`：masked shadow read divergence。

## 3. 欄位可變性

### Immutable

- card aggregate id
- original source event id
- original scanner/collector
- creator
- creation timestamp
- tenant/network at creation（跨 tenant 必須建立正式 transfer event）
- claim/merge/unlink audit event

### Mutable by owner/editor

- 基本聯絡與介紹資料
- visibility
- 指定 version 的 layout、cover、buttons、video/thumbnail

### Ownership action only

- person_id / owner binding
- bound LINE identity
- canonical target after merge
- active/merged state

只有 `claimCardAndRegister`、經授權的 `unlinkCard`、`confirmIdentityMerge`／正式 merge service 可修改 ownership；一般 `saveCard`、`updateCard` 不得接受 ownership 欄位。

## 4. Claim 轉換

1. contact card 保留原始 scanner、creator、source event。
2. 驗證 claimant identity。
3. 若 claimant 已有 personal aggregate：建立 merge proposal，不直接新增第二張 personal。
4. 若 claimant 無 personal aggregate：建立 personal aggregate，將 contact 資料複製為 initial revision；contact collection 仍保留歷史與指向。
5. 寫入 claim event，包含 before/after masked identity、actor、proof type、resolver version。

## 5. Merge 稽核

- 不刪 source card；標記 merged 並指向 canonical card。
- 逐欄記錄保留來源。
- scanner collections 不被合併掉，只更新 recognized/canonical pointer。
- 支援事件級 rollback：恢復 active pointer，不覆寫歷史 revision。

## 6. Legacy identity mapping

- 禁止只用姓名或電話直接設 owner。
- phone/email/name/company 僅產生 candidate confidence。
- 只有受信 LINE login、人工審核或既有可驗證綁定能建立 canonical link。
- legacy alias 必須記錄來源、建立者、時間與信心層級。

## 7. Resolver contract

輸入：actor canonical id、network、entry source、requested version、mode、optional card id。

輸出：card aggregate、version、permission、candidate/exclusion trace、resolver version。

規則：

- 我的名片只查 personal + actor person_id。
- AI 名片夾只查 collection + scanner/collector。
- OA 靜態入口排除 video；影音入口只取 video。
- 多個合格候選時回 `ambiguous`，不得 silently choose。

## 8. Shadow read 與 rollback

- legacy resolver 保持正式結果。
- target resolver 只做 shadow read，輸出 masked candidate、排除原因與 divergence code。
- 不記完整姓名、電話、Email、UID。
- 以入口、network、version 分桶比較。
- 切換採 feature flag；rollback 只需關閉 target resolver，不需回寫資料。
- migration 採 copy + pointer，不做 destructive rewrite。
