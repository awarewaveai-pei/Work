# U11.5 第 4 級驗證：話題佇列全自動實跑（正式站，2026-11-19）

結果：PASS 到 `reviewed`（人工審核站的終點；未對外發布）。`scheduled` 依設計到不了，見 F1。

- 組織 AwareWave Ops `39ad4149-5044-4077-8d9a-b6b916de0e21`；站 aware-wave.com `7aa8ab64-3e2b-48bc-9c6b-9b09e735bb5e`
- 自動發布關：`wp_sites.content_defaults->>'publishMode'` = NULL → `autoPublishes()` false（`lib/content/brand-voice.ts:119`）；UI ⑤ 顯示「人工審核」
- 排程：`client_schedules` content_pipeline enabled=t every_5m daily_limit=2；主機 `/etc/cron.d/awarewave-schedules` `*/5` poke run-due；開始前今日（UTC）started=0
- 話題 `cdeaacca-4350-4bf7-8aa9-f852d92ba4ab`「小坪數居家收納：五個好上手的整理習慣」，formats {article,video}，scheduled_for 2026-11-19 00:00Z（台北 08:00）；UI 加一題 → 核准（未按「核准並開始」）

## 時間軸（UTC，content_topics.status vN @updated_at）
- 00:45:12 proposed v1（UI 建立）→ 00:45:30 approved v2（UI 核准）
- 00:50:01 generating v3（cron tick，started_on=2026-11-19）
- 00:55:09 drafted v4：WP post 55 草稿；review pass=true（文章完整／5743 字／SEO 86／無禁用說法）
- 01:00:02 waiting_video v5：video job `6d89bcfc-0194-4d40-a0e0-b0b86ff78637`
- 01:05:04 embedded → reviewed v10：16x9.mp4 嵌入文章（embedded_at 01:05:04.113Z），last_error NULL
- 核准到 reviewed 共 19.5 分鐘（4 次 tick）

## 專案列 media_production_projects
- `d8c3af33-80b0-4f55-96f0-bf12c069d6cc` source=content_topic autonomy=full_auto lifecycle_stage=review last_error NULL

## 花費（ai_call_logs，該 org，00:49–01:06Z）
- content/article-generate claude-opus-5-5 ×1 US$0.2575；video/script claude-opus-5-5 ×1 US$0.0523；content/topics flux-schnell 圖 ×3 US$0.0090（job_id=話題 id）
- 合計 US$0.3189 = **NT$10.2** vs UI 預估「核准並開始（約 NT$7.4）」（`topicCostTwd(["article","video"])`）→ 超出 38%
- 上限：系統只有「每天最多開始 N 題」（daily_limit=2，題數非金額）；沒有單題金額上限可設。依邊界未改 daily_limit；本題用掉 1/2。

## 未公開證據
- `docker exec lobster-wordpress wp --allow-root post get 55` → post_status=draft，post_date_gmt=0000-00-00 00:00:00
- `curl -o /dev/null -w %{http_code} "https://aware-wave.com/?p=55"` → 404；REST `/wp-json/wp/v2/posts/55` → 401；公開搜尋 `posts?search=小坪數` → `[]`
- 無社群草稿（formats 不含 social；artifacts 無 social）
- 影片 R2 網址 Range GET → 206（檔案在）

## 問題（一行一個）
- F1 驗收寫「跑到已排程」，但 `scheduled` 只在 autoPublishes=true 且 scheduled_for 在未來才出現（`lib/content/topics/tick.ts:106`）；自動發布關的站停在 `reviewed`（`tick.ts:105`）。驗收應改為 reviewed，或另測「auto 站＋未來時間」（有真實發布風險，需操作者決定）。
- F2 預估低估：UI NT$7.4 vs 實際 NT$10.2。文章單次 US$0.2575 已超過預估；配圖 3 張（`make.ts:53` TOPIC_ARTICLE_IMAGES）未計入 `topicCostUsd`（`lib/content/topics/cost.ts:23-33`）。
- F3 無金額上限：只有題數 cap（`tick.ts:15` DAILY_START_CAP、`client_schedules.daily_limit`）；「核對花費與上限」只能用題數＋單題預估代替。
- F4 花費靠時間窗＋org 合計：ai_call_logs 只有圖片帶 job_id=話題 id，文章／腳本呼叫沒有話題關聯；同 org 多人同時用會混算。
