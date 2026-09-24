# 交流貼文可見性契約

- 預設列表與詳情只回傳 published，hidden 不出現在前台，不能透過直接 handle 繞過。
- ownOnly=true 為私人管理查詢，必須有伺服器已驗證 actor.userId；只查該作者的 published / hidden，忽略 payload 中的 UID。不得恢復或查出 draft / archived。
- 隱藏與重新顯示沿用 updateExchangeZonePost，hidden 必須是布林值。單一條件 UPDATE 同時限制作者、handle、原狀態；重送相同目標狀態為冪等操作。
- 不變更 body / card_row_id / published_at / expires_at / point_cost / publish_operation_id，不扣點或退款，不改名片本身的公開設定。
- 作者透過「我的貼文」查看隱藏狀態、重新顯示或刪除。隱藏中的編輯按鈕停用，須先重新顯示。
- 隱藏後既有優惠券傳送／核銷、按讚及交流聯絡仍受 published 條件限制。優惠券自己的期限及每會員限核銷一次規則不變。
- 網路或資料庫錯誤不得先呈現成功；前端切換公／私清單必須忽略過期回應，避免私有內容出現在公開頁籤。
- 測試：test/exchange-zone-visibility.test.mjs，加入完整 change guard。
