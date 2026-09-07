# 全自動內容發佈系統（原型 — 部分已退役）

> **⚠️ P6 退役公告（2026-06-16）**
> 直連發佈與排程主控已移除，請勿再執行本資料夾的 Python 主控：
> - 🗑️ `publisher.py`（10 平台直連發佈）— 違反 R1（與 Postiz 雙套社群發佈）+ R4（繞過 wp-bridge Ed25519 簽章）。**社群發佈一律走 Postiz；WordPress 一律走 wp-bridge 簽章發佈。**
> - 🗑️ `master_controller.py`（cron 自動發佈主控）+ `cron_setup.sh`（其排程安裝器）— 編排已收斂進 next-admin `lib/content/pipeline.ts`（P4 headless 編排器，draft-first）。
> 本資料夾**保留為 P7 影片生成參考**：`full_pipeline_v3.py`（文章→影片）及其依賴（`topic_fetcher.py` / `quality_control.py` / `growth.py` / `config.py` / `setup.sql`）僅作影片微服務移植參考，不再作為發佈執行入口。
> SSOT：`agency-os/docs/operations/CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md` §10 P6。

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `config.py` | 所有設定集中在這裡（P7 參考） |
| `setup.sql` | Supabase 建表 SQL（P7 參考） |
| `topic_fetcher.py` | 自動抓熱門議題（P7 參考） |
| `full_pipeline_v3.py` | 文章→影片主腳本（**P7 影片參考，保留**） |
| `quality_control.py` | 品質控制（P7 參考） |
| `growth.py` | 成長功能（P7 參考） |

## 安裝

```bash
sudo apt install ffmpeg fonts-noto-cjk
pip install -r requirements.txt   # moviepy 已鎖 1.0.3（程式用 1.x API，2.x 會炸）
```

## 設定步驟

1. `setup.sql` → Supabase SQL Editor 執行
2. **密鑰走環境變數（不再編輯 config.py）**：`cp .env.example .env` → 填值 → 載入：
   ```bash
   set -a; source .env; set +a        # Linux/macOS
   ```
   沒填的欄位對應功能會自動略過，不會報錯。
3. YouTube OAuth → 放 client_secrets.json 到同資料夾
4. Freepik 素材 → 下載後放到 assets/backgrounds/ 和 assets/characters/

> **密鑰原則**：所有 key 從環境變數讀取，禁止寫進 `config.py` / commit 進 git。
> 本機可由 vault（`mcp/user-env.ps1`）注入；VPS cron 用 systemd `EnvironmentFile`。

## 執行（已退役 — 見頂部 P6 公告）

~~`python master_controller.py` / cron 排程~~ 已於 P6 移除。發佈與編排改走生產路徑：

- **內容編排**：next-admin `lib/content/pipeline.ts`（`byKind` article→quality→publish，draft-first）。
- **WordPress 發佈**：wp-bridge 簽章發佈（`lib/content/publish/wordpress-core.ts`，draft-first 紅線）。
- **社群發佈**：Postiz（唯一社群發佈路徑，P5）。

本資料夾僅保留作 P7 影片生成（`full_pipeline_v3.py`）移植參考，不再直接排程執行。

## 平台設定說明

### WordPress
後台 → 使用者 → 編輯個人資料 → 應用程式密碼 → 新增

### YouTube OAuth
1. Google Cloud Console → 建立專案
2. 啟用 YouTube Data API v3
3. 建立 OAuth 憑證（桌面應用程式）
4. 下載 JSON → 改名為 client_secrets.json

### Instagram / Facebook / Threads
需要 Meta Business 帳號 + Meta for Developers

### Bluesky
登入 bsky.social → 設定 → 應用程式密碼

### Reddit
reddit.com/prefs/apps → 建立 app（script 類型）

### TikTok
developers.tiktok.com → 申請 Content Posting API

### Pinterest
developers.pinterest.com → 建立 app → 取得 access token

### LinkedIn
linkedin.com/developers → 建立 app → 申請 w_member_social 權限

## 重要行為（v3 修正後）

- **IG / Pinterest**：發圖前會先把第一張場景圖上傳到 **WordPress 媒體庫**取得公開 URL（兩平台 API 都強制要公開 URL）。所以這兩個平台需要 WordPress 設定正確才會發。
- **TikTok**：未審核（unaudited）的 app 只能 `SELF_ONLY`，預設即此。app 通過 audit 後才把 `TIKTOK_PRIVACY=PUBLIC_TO_EVERYONE`。
- **Reddit**：自動發文易被當 spam ban，**預設關閉**。確認目標 subreddit 規則允許後，設 `REDDIT_ENABLE=true` + `REDDIT_SUBREDDITS=...`。
- **冪等**：同一主題重跑時，已成功（`publish_log.status=done`）的平台會自動略過，不會重傳 YouTube 造成重複影片。
- **成本**：Claude 費用依實際 token 用量計算（非寫死），記入 `cost_log`。
- **JSON 穩健性**：Claude 回傳非合法 JSON 時自動重試（最多 2 次）再失敗才中止該主題。

## 每月費用估算

| 項目 | 費用 |
|---|---|
| Claude API | ~$1.5–3 |
| DALL-E 3 | ~$3–6 |
| VPS 伺服器 | $5–10 |
| 其他 | $0 |
| **總計** | **$10–20** |

## 圖片來源優先順序

1. Pixabay API（免費，自動抓卡通插圖）
2. DALL-E 3 API（$0.04/張，找不到時用）
3. Freepik 素材庫（手動準備，放 assets/ 資料夾）
4. 純色背景（備用）
