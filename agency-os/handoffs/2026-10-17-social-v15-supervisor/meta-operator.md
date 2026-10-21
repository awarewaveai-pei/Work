# Meta 後台：操作者要親手做的步驟

用現有 app「AwareWave Postiz」（已是上線模式、已有隱私權政策，2026-10-15 已驗過）。不送審、不做公司驗證。不需要給任何人密碼。
等 Codex 的程式部署上線後再做第 4 步以後（webhook 網址要先能回應）。

1. 登入 https://developers.facebook.com/apps/ → 選「AwareWave Postiz」，確認角色頁你是「管理員」。（角色說明 https://developers.facebook.com/docs/development/build-and-test/app-roles/）
2. 「使用案例／權限」加這 7 個（一般存取權限會自動給，不用按送審）：`pages_show_list`、`pages_manage_metadata`、`pages_read_engagement`、`pages_manage_engagement`、`pages_messaging`、`instagram_basic`、`instagram_manage_messages`；廣告再加 `ads_read`、`ads_management`。（https://developers.facebook.com/docs/graph-api/overview/access-levels/）
3. 「設定 › 基本資料」複製「應用程式密鑰」→ 放進 `mcp/user-env.ps1` 的 `META_APP_SECRET`；自己想一串長亂碼當 `META_WEBHOOK_VERIFY_TOKEN`，也放進去。
4. 「Webhooks」選物件「Page」→ 回呼網址填 `https://app.aware-wave.com/api/webhooks/meta`、驗證權杖填第 3 步那串 → 訂閱欄位勾 `feed`、`messages`；物件再選「Instagram」勾 `messages`。（https://developers.facebook.com/docs/graph-api/webhooks/getting-started）
5. 開「圖形 API 測試工具」https://developers.facebook.com/tools/explorer/ → 選這個 app、勾第 2 步的權限 → 產生用戶權杖 → 換長效權杖（https://developers.facebook.com/docs/facebook-login/guides/access-long-lived）→ 查 `me/accounts`，拿到 Aware Wave 和 Soulful 兩個粉專的權杖（用長效權杖換出的粉專權杖不會過期）。
6. 兩個粉專權杖放進 `mcp/user-env.ps1`：`META_PAGE_TOKEN_<Aware Wave 粉專 ID>`、`META_PAGE_TOKEN_<Soulful 粉專 ID>`。
7. 讓兩個粉專接上 app：在測試工具用各自的粉專權杖送 `POST /<粉專ID>/subscribed_apps?subscribed_fields=feed,messages`，回 `{"success": true}` 就好。（https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-pages）
8. 廣告權杖：到「商業設定 › 系統用戶」建一個，指派兩個廣告帳號，產生含 `ads_read`、`ads_management` 的權杖；建不了就用第 5 步的長效用戶權杖（60 天會過期，要記得換）→ 放進 `META_MARKETING_ACCESS_TOKEN`。（https://developers.facebook.com/docs/marketing-api/overview/authorization/）
9. 跟我說「Meta 金鑰放好了」。我會把變數送上主機、在系統裡登記兩個粉專／IG／廣告帳號屬於哪個品牌，再用你的小帳號留言測一次。自動回覆和暫停廣告兩個開關先關著，測完你點頭才開。

做不到的（Meta 規定要審核＋公司驗證）：IG 貼文底下的留言自動回覆。來源 https://developers.facebook.com/documentation/instagram-platform/webhooks/setup （「Advanced Access is required for comments」）。FB 留言、FB 私訊、IG 私訊、廣告都可以做。
