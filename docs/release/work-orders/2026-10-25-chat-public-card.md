# 私訊查看名片優先公開版本

- 日期：2026-10-25；起始 commit：6900de4209e3dcfa0b822c5088b5dec8613a3bd9。
- 使用者明確要求：只要對方有公開名片即可查看，優先公開版本，不被較新私人版本或待審核擋住；最小更動、直接修復並部署。
- 修改範圍：worker/member-chat-extras.mjs 的 peerCard 查詢、worker/member-chat.mjs 無公開名片提示、私訊測試、card-resolvers/core-invariants 合約與本工作單。
- 僅聊天「查看名片」POP：先篩有效公開 self_profile，再按 updated_at、row_id 選最新公開版本；不再以 ai_review_status 作閱讀門檻。覆蓋 2026-09-24 extras 工作單的此 POP 舊門檻，其餘規則保留。
- 保留登入、對話參與者、封鎖、本人歸屬、封存／合併排除與既有安全公開投影；不擴至 video_profile。
- 不改資料、schema、users/card_contacts/identity links、公開池／配對、頭貼、搜尋、聊天、通知、優惠券、點數、前端及正式 bindings/vars/secrets/cron。
- 已讀 feature-change-protocol、core-invariants、card-resolvers、card-ownership-and-versioning、regression-matrix。
- guard:before：PASS；部署前程式與起始 commit 打包 SHA-256 一致，回復版本 ba7c2f30-443a-4643-ba6f-bc655377d2dc。
- guard:after：PASS；私訊／頭貼／UI 回歸 78/78 PASS；Wrangler 4.152.0 dry-run、diff 檢查與獨立審查通過。
- 正式唯讀驗證：截圖會員的新查詢選到 public／pending 的 portrait 本人名片，rows_written=0、changed_db=false。沒有更改公開或審核狀態，不建立聊天、不傳訊、不操作點數；部署後核對程式及原設定。
