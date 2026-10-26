# YouTube 全自動影片發佈系統

文章 → 卡通影片 → 多平台尺寸 → 自動上傳 YouTube + 發佈 WordPress，含 Supabase 主題佇列、熱門議題自動抓取、Telegram 通知、cron 排程。

## 流程

```
主題佇列(Supabase) ─┐
熱門議題抓取 ────────┤
                    ▼
controller.py ── 逐題呼叫 ──▶ pipeline.run()
                                  │
   Claude 生成文章+腳本 ──▶ DALL-E 卡通圖 ──▶ Edge TTS 配音
        ──▶ MoviePy 合成(Ken Burns+字幕) ──▶ FFmpeg 多尺寸輸出
        ──▶ 上傳 YouTube ──▶ 發佈 WordPress(內嵌影片)
                                  │
                          Telegram 通知 + 回寫 Supabase
```

## 檔案

| 檔案 | 用途 |
|------|------|
| `config.py` | 所有設定的單一來源，從環境變數 / `.env` 讀取 |
| `pipeline.py` | 單支影片全流程；可互動執行或被 controller 呼叫 `run()` |
| `controller.py` | 主控：抓佇列 + 抓熱門議題 + 通知 + 回寫狀態 |
| `setup.sql` | Supabase 建表 |
| `cron_setup.sh` | 設定每日排程 |
| `requirements.txt` | Python 依賴範圍（**moviepy 已鎖 <2.0**）；本機開發用 |
| `requirements.lock` | 映像實際安裝的版本＋hash（Linux 解出；重產指令在 `Dockerfile`）|
| `.env.example` | 設定範本 |

## 安裝

```bash
cd lobster-factory/infra/hetzner-phase1-core/apps/video-service

# 1. 系統依賴
sudo apt install ffmpeg fonts-noto-cjk      # Windows 請自行安裝 ffmpeg 並加 PATH

# 2. Python 環境
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 3. 設定
cp .env.example .env
# 編輯 .env 填入金鑰（至少 CLAUDE_API_KEY / OPENAI_API_KEY）

# 4. YouTube OAuth：到 Google Cloud Console 建 OAuth 用戶端(桌面)，
#    下載 client_secrets.json 放本目錄。首次執行會開瀏覽器授權，
#    產生 youtube_token.json（之後免再授權）。

# 5. Supabase（用 controller 排程才需要）：在 SQL Editor 執行 setup.sql
```

## 使用

### 手動跑單支
```bash
source .venv/bin/activate
python pipeline.py          # 互動選 A(主題生成) / B(沿用文章)
```

### 自動排程（讀 Supabase 佇列）
```bash
# 先在 Supabase topics 表插入主題，或設好熱門議題抓取
python controller.py        # 手動跑一輪
./cron_setup.sh             # 設定每天 09:00 自動跑
```

往 `topics` 表插一筆即可排入佇列：
```sql
insert into topics (topic, mode, priority) values ('2026 AI 趨勢', 'A', 1);
```

## 成本（每支影片）

| 項目 | 成本 |
|------|------|
| Claude 腳本 | ~$0.02–0.05 |
| DALL-E 3 圖（6–8 張）| ~$0.24–0.32 |
| Edge TTS 配音 | 免費 |
| **合計** | **約 $0.3–0.4 / 支** |

### 想更省（免費路線）
- **配音**：Edge TTS 已免費。要更自然可換 Kokoro / Chatterbox（本地、免費）。
- **圖片**：把 `IMAGE_MODEL` 那段改接本地 Flux / SDXL，或用 Pexels/Pixabay 免費 B-roll，可把每支降到 ~$0.02（只剩腳本 token）。
- 這版預設用 DALL-E 是為了零維運、開箱即用；要降成本再換圖片來源即可。

## 安全

- 金鑰一律走 `.env` / 環境變數，**不進 git**（`.gitignore` 已排除 `.env`、`client_secrets.json`、`youtube_token.json`）。
- `YOUTUBE_PRIVACY=private` + `WP_STATUS=draft` 可在測試期避免公開發佈。

## 已知限制

- `pytrends.trending_searches` 可能隨 Google 改版失效，預設關閉（`ENABLE_GOOGLE_TRENDS=false`）。
- moviepy 必須 1.x；若 `pip install moviepy` 裝到 2.x 會 import 失敗，請依 `requirements.txt` 鎖版。
