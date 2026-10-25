# 交流島搭船慢航與背景音樂音效

- 日期：2026-10-25；基準：fce7a6138df0213d42899a39e7a37f67fe6f510a。
- 使用者要求：跨島閃太快，改搭船，增加少量背景音樂與音效。
- 已讀feature-change-protocol、core-invariants、business-island；本輪guard:before PASS（另音訊agent獨立guardbefore亦PASS）。
- 範圍：交流島world旅程、獨立audio模組、root接線／聲音控制、場景專屬CSS、快取、契約及browser回歸。
- 跨島採登船→海上航行→靠岸→走到抽中會員，移動時間依世界距離約200px/s及骰子進度計算；每幀跟隨實際位置，取消每650ms跨千px及重啟smooth-scroll跳鏡頭。同島與原立體雙骰保持。
- 音樂為原創WebAudio柔和旋律與和弦，擲骰／開船／到站短音效；只在明確操作解鎖後播，音樂與音效各有開關、低音量、獨立偏好鍵，不影響遊戲館聲音設定。不新增外部音訊請求／麥克風／付費服務。
- 隱藏／離島／換帳號取消航行、音訊與鏡頭；快照停在中途船態，返回不自行續行。瀏覽器音訊拒絕可重試，不阻擋遊戲。
- 不改七島圖／會員API／公開名片驗證／私訊composer／商城／資料／schema／點數／Worker部署／bindings／vars／secrets／cron。
- 驗證：完整guard與107項既有回歸、真Chrome遠航速度／鏡頭連續／到達／取消／狀態恢復、真WebAudio非零RMS／雙靜音／隱藏暫停／離頁關閉／拒絕降級；Pages發布後比對線上檔案。
- guard:after PASS；相關Node／SQLite回歸107/107 PASS；真Chrome最終25/25 PASS，未做正式會員發訊或點數操作。
- 390px最遠food→manufacturing航路2847.31px、移動14236.53ms、含搖骰約15.5秒，200px/s；100ms採樣鏡頭最大53px、角色約224px/s，完整登船／航行／靠岸／登岸與原目標對齊，雙骰1+1合計進度仍恰2。
- 真AudioContext＋Analyser音樂與音效獨立非零RMS，雙關閉為0；首次只切音效不建立context。取消depart音效時sound bus RMS由0.011119變0，music仍0.007445；立即stop音源增加3，context仍running。離頁contextclosed、背景音源0、拒絕resume可繼續擲骰。
- 六種航行取消含海上BFCache恢復船態均PASS；84次合成API、建聊1／送訊1僅明確合成操作，外部請求0、pageerror0。音效控制獨立localStorage key，原遊戲館偏好保持。
- 交流島JS／CSS快取v4、world v2、audio v1；僅GitHub Pages發布，Worker和七島圖未改。
- 整合main b1502ed1c4ac74d900e2fd0b6b01b8e02ac803a1（並行PR259首頁兩快捷入口互換），自動合併index／契約不同hunk並保留新首頁位置；不還原或改動該功能。整合後完整guard:after亦PASS。
