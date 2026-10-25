# 人脈島 RPG 自由漫遊與在線優先

- 日期：2026-10-25；基準 main `ab7c6997aeec0e82dd61a5a714808f4e7a3f4dfe`。
- 使用者要求：取消固定編號跑路線；真實會員頭貼像 RPG 人物隨機在島上走動，主角依骰子移動接觸，也可直接點會員對話；在線會員優先出現。
- 已讀 feature-change-protocol、core-invariants、business-island、原公開名片與私訊權限。guard:before PASS。
- 範圍：business-island world/controller/CSS、member-chat 中獨立暫存在線狀態及必要測試、前端快取與本契約。
- 世界：七島長地圖和慢船保留；以島內可行走區域自由漫遊取代固定12站，NPC以真頭貼與身體呈現，骰子2至12控制主角行走並接觸同島對象；明確點NPC可開原私訊，不自動送訊。
- 在線：只依經原LINE身分驗證的近期頁面心跳，使用既有KV短期資料，不推測LINE App全域在線；場景及接觸選擇優先在線，離線公開會員仍可見與可聯絡。錯誤／未知狀態不偽造在線。
- 保留公開名冊資格、canonical身分、封鎖／停止聯絡、公開名片安全投影、一般目錄與公開AI配對；不改schema、D1資料、點數、商城、未讀、通知、正式bindings/vars/secrets/cron。
- 驗證：前後完整guard、Node/SQLite權限及presence時效、Chrome自由移動/陸地範圍/在線排序/擲骰接觸/直接私訊/背景暫停/手機44px/取消競態/音訊及原商城；通過後部署Worker與Pages並核對正式檔案和設定。
- 手機人物密度採每批8／桌面12，保留完整公開名冊與循環切換；骰子選擇從完整本島公開候選抽取，優先在線，抽中不在目前批次的對象仍保證可見。
- POST presence僅允許空物件寫自己canonical心跳；GET最多100個handle重查原公開資格後只回online/onlineKnown。TTL180秒，頁面70秒更新且伺服器60秒內不主動重寫同鍵；KV故障不阻止原公開名片或私訊。
- 第一輪Node/SQLite130/130、Worker dry-run及guard:after PASS；RPG畫面仍在手機密度及Chrome整合複驗階段。
- 獨立本機Miniflare runtime兩次嘗試皆在workerd啟動前失敗，未執行KV斷言、不算PASS；KV批次get/Map、cacheTtl30與TTL限制以官方API文件核對，純Node/SQLite及合成Chrome另列驗證，不冒充真實LINE手機驗收。
- 最終Node/SQLite130/130、Worker dry-run及guard:after PASS；獨立手機真Chrome驗8人頭貼可點、陸地足點、同DOM位置維持、骰子到實際在線對象、resize批次與reduced-motion。完整整合Chrome30/30 PASS：180次合成API、明確建聊2次／送訊1次、外部請求0、pageerror0。
- 複查修正在線→未知時既有到達面板仍殘留在線標示；原地更新公開文字，獨立Chrome證實面板/焦點/人物位置不變。完整31項Chrome整合複驗中，通過後才部署。
- 正式基準Worker d7ff998b、與上輪驗證main bundle一致；本次新bundle SHA256 `9d41329160dfa5afa8036e36bf05b3486432ff7040f58d30fb640eb22deca669`。部署需保留vars/bindings/secrets/cron，發布後逐項核對與前端線上位元組回讀。
