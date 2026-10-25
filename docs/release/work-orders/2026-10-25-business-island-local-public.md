# 所在島環島互動與完整公開會員

- 日期：2026-10-25；基準：7ba5215b22068b5c925d650a0b8b9a448f9d8f3f。
- 使用者要求：不要直接跳島，應在所在位置走一圈互動；有公開的人也應出現。
- guard:before PASS；已讀feature-change-protocol、core-invariants、business-island、原member-chat公開卡／目錄資格。
- 骰子只走目前島固定12站步道，按雙骰總點數逐站行進、站位累積循環，12步真回原站；停站只互動本島公開會員，空島照走而不自動換島。跨島保留慢船，但僅明確按搭船前往才出航。
- 交流島新增members?scope=public穩定分頁，只挑同canonical會員最新有效公開self_profile作可見摘要／分島來源，不受較新私人版或AI審核阻擋；沿用本人排除、封鎖、停止新聯絡、LINE驗證和原card/thread安全驗證。
- public投影僅公開姓名／公司／職稱／業種／頭貼／會員編號；handle仍用原current目錄卡以兼容原公開卡GET/threads。分頁cursor不新增LINE UID／私密聯絡資料投影。
- 場景完整翻頁公開名冊並去重；每島用12位分頁與總數，所有人可輪到，不再random30／固定6位永久隱藏。既有找會員搜尋、配對排序與分頁仍走原一般目錄，與公開場景分開，無擴大私人資料可見範圍。
- 不改AI公開配對池資格／資料／schema／canonical身份／點數／商城／通知。音樂與音效、立體骰、七島圖、取消與快照恢復維持。
- 需發布Worker只新增公開目錄scope並保留vars/bindings/secrets/cron；不執行migration；再發布Pages並核對線上程式、未登入拒絕及部署設定摘要。
- 驗證完整guard、SQLite公開版本/封鎖/canonical/完整分頁與舊模式回歸、真Chrome原地環島一圈/空島/所有公開人可達/明確換島/音訊/取消/原商城。
- guard:after PASS；Node／SQLite相關回歸113/113 PASS（scopepublic新增6組，原一般目錄／頭貼／私訊／商城回歸保持）。公開scope真SQLite驗48人30+18穩定分頁、較新private不擋public摘要、canonical／雙向封鎖／停止聯絡／歧義，current handle讀公開卡及明確建聊皆通過。
- 真Chrome最終28/28 PASS：正常6+6完整12步、7800ms移動、初末矩陣完全相等、全程目前food島範圍且x/y雙向轉圈；骰子不refetch一般目錄或自動跨島。明確船抵新島station0、骰面不變；48公池完整、30個food三頁全部可達、公開人物即使不在一般頁亦可操作、空島仍走完。
- 公開refresh在途卡片／晚回分區／換帳號／503與未公開一般會員清舊摘要等race均PASS；原聲音RMS、取消、BFCache、私訊與商城保持。110次合成API，建聊1／送訊1僅明確合成，外部請求0、pageerror0。
- 最新main e33436e之隔離Worker bundle已與正式版本c0613bdb完整SHA相同，部署前會整合並保留PR261人脈島命名及首頁未讀數。
- 已整合main e33436e，保留人脈島命名、首頁未讀模組及GET-only安全限制；JS/CSS升v6、world升v4以避免兩分支快取碰撞，chat維持v15單一模組。
- 整合後完整guard:after PASS、Node/SQLite相關118/118 PASS、Worker dry-run PASS。首頁未讀Chrome回歸PASS；環島28項Chrome回歸完成前不部署。前後獨立審查無阻擋，部署前正式仍c0613bdb，bindings/排程/相容日期及旗標一致。
