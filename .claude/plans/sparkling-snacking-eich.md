# 計畫：部落格自動影片生成 (2 站 × 2 支/天)

## Context

用戶有 2 個 WP 網站，每天各需自動生成 2 支 15–30 秒影片插入文章，預算 $0–5/月。  
Repo 內已有完整影片生成 pipeline (`agency-os/docs/video_generator/full_pipeline_v3.py`)，使用：
- Claude (腳本生成) → Pixabay API (免費圖片) → Edge TTS (免費語音) → FFmpeg (合成)  
- 估算成本：~$0.003/支（Claude Haiku） × 120 = **< $1/月**，符合預算

CPX32 已有 FFmpeg，video-service Docker 容器已存在於 `lobster-factory/infra/hetzner-phase1-core/apps/video-service/`。

---

## 架構

```
WP 文章存為 Draft
  → n8n EU webhook
  → video-service HTTP API (CPX32)
      → Claude Haiku: 生成影片腳本 (場景/旁白/關鍵字)
      → Pixabay API: 搜圖 (免費)
      → Edge TTS: 生成旁白音訊 (免費)
      → FFmpeg: 合成 15–30s MP4
  → WP REST API: 上傳影片到媒體庫
  → WP REST API: 更新文章插入 video block
```

---

## 實作步驟

### 步驟 1 — 加 HTTP API 到 video-service

**修改檔案：**
- `lobster-factory/infra/hetzner-phase1-core/apps/video-service/api.py` (NEW)  
  - Flask app，`POST /generate` 接收 `{title, excerpt, tags, language}`  
  - 呼叫 `full_pipeline_v3.py` 邏輯（Pixabay-only 模式，跳過 DALL-E）  
  - 非同步跑 FFmpeg，回傳 `{job_id}`  
  - `GET /job/{id}` 查狀態，完成後回 `{status: done, video_url}`  
- `lobster-factory/infra/hetzner-phase1-core/apps/video-service/requirements.txt` (UPDATE)  
  - 加 `flask>=3.0`  

**關鍵設定（Pixabay-only 模式）：**
```python
USE_DALLE = False          # 跳過 DALL-E ($0)
IMAGE_SOURCE = "pixabay"   # 免費
TTS_ENGINE = "edge-tts"    # 免費
CLAUDE_MODEL = "claude-haiku-4-5-20251001"  # 最便宜
VIDEO_DURATION = 20        # 秒，可調 15–30
```

### 步驟 2 — 部署 video-service 到 CPX32

**修改檔案：**
- `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml` (UPDATE)  
  加入 video-service service block：
  ```yaml
  video-service:
    build: ./apps/video-service
    ports: ["127.0.0.1:8765:8765"]
    volumes: ["/tmp/videos:/output"]
    environment:
      - ANTHROPIC_API_KEY
      - PIXABAY_API_KEY
    restart: unless-stopped
  ```
- nginx/Apache vhost：加 `/video-service/` proxy 到 `localhost:8765`（限內網或加 token auth）

**部署指令：**
```bash
# 在 CPX32 上
cd /root/lobster-phase1
git pull
docker compose up -d video-service
```

### 步驟 3 — n8n Workflow（每站一個，共 2 個）

**Workflow 命名：** `tenant-<slug>-content-video_auto_generate`

**節點：**
1. **Webhook** — WP 呼叫 (post_status = draft, post_type = post)  
   需在 WP 加 `publish_post` action hook 打 n8n webhook URL  
2. **HTTP Request** — `POST https://cpx32-internal/video-service/generate`  
   Body: `{title, excerpt, tags, language: "zh-TW"}`  
3. **Wait / Poll Loop** — 每 10 秒 `GET /job/{id}`，直到 `status: done`（最多等 5 分鐘）  
4. **HTTP Request** — `POST /wp/v2/media`（WP Application Password auth）  
   上傳影片 binary  
5. **HTTP Request** — `PATCH /wp/v2/posts/{post_id}`  
   更新 `content`，在文章頂部插入 `<!-- wp:video {"id":XXX} -->` block  

**WP Application Password 設定：**
- WP 後台 → 用戶 → 應用程式密碼 → 生成一組給 n8n  
- 存入 n8n Credential (HTTP Basic Auth)  

### 步驟 4 — WP 端 webhook hook

每個 WP 站加一小段 code（`functions.php` 或 mu-plugin）：
```php
add_action('transition_post_status', function($new, $old, $post) {
    if ($new === 'draft' && $old === 'auto-draft' && $post->post_type === 'post') {
        wp_remote_post(N8N_WEBHOOK_URL, [
            'body' => json_encode([
                'post_id'  => $post->ID,
                'title'    => $post->post_title,
                'excerpt'  => $post->post_excerpt ?: wp_trim_words($post->post_content, 50),
                'tags'     => wp_get_post_tags($post->ID, ['fields' => 'names']),
            ]),
            'headers' => ['Content-Type' => 'application/json'],
        ]);
    }
}, 10, 3);
```

---

## 成本估算

| 項目 | 費用 |
|------|------|
| Claude Haiku (腳本) | ~$0.003/支 × 120 = **$0.36/月** |
| Pixabay | 免費 |
| Edge TTS | 免費 |
| FFmpeg on CPX32 | 免費（已付主機費）|
| **總計** | **< $1/月** |

---

## 驗證計畫

1. **實測**：手動 `curl POST` 到 video-service `/generate`，等 `/job/{id}` 回 done，下載 MP4 確認有影像+聲音
2. **Review**：讀 docker-compose.yml 確認 port binding 正確；讀 n8n workflow JSON 確認 poll loop 有 timeout
3. **抓蟲**：Grep `ANTHROPIC_API_KEY` 確認沒 hardcode；Grep `PIXABAY_API_KEY` 確認從 env 取
4. **WORKLOG**：記錄部署指令 + curl 輸出 + 生成影片 URL 作為 REALTEST_EVIDENCE

---

## 執行順序

1. 確認 Pixabay API key（免費申請：pixabay.com/api/docs/）
2. 確認 WP Application Passwords 已啟用（WP 5.6+ 預設開）
3. 步驟 1 → 2 → 3 → 4 依序執行
4. 先對一個站測試通，再複製 workflow 給第二個站
