# Remotion 遷移計畫 — 取代 Creatomate 自架動畫影片生成

**建立於：** 2026-06-25  
**狀態：** 待執行（Phase 0 尚未開始）  
**背景：** 完整的架構分析已完成，本文件是可直接交接給下個 session 的執行手冊

---

## 一、背景與決策摘要

### 為什麼要做

用戶過去使用 Creatomate 生成動畫影片（每支 $0.003–0.02），現在要自架取代，零 API 費用，且要求動畫品質相同甚至更好。

### 已確認的現況（讀過 code）

現有影片生成系統是 **EU VPS（204.168.175.41）的 Python video-service**，純 ffmpeg，**沒有 canvas / node-canvas**。

```
現有能力：
  Ken Burns zoom/pan（圖片緩慢縮放移動）
  drawtext 字幕疊加
  TTS 配音（Edge / OpenAI）
  多格式輸出（16:9 / 9:16 / 4:5）

現有缺口（Creatomate 有，我們沒有）：
  文字動畫（TextSlideUp / TypeWriter / FadeIn / BounceScale）
  場景轉場（slide / wipe / zoom flip）
  疊加構圖（圓形遮罩 / 標題 overlay / 評分框）
  多層動畫（背景 pan + 前景文字 + overlay 同時動）
```

### 已決定的技術選型

**用 Remotion（不是裸 ffmpeg，不是 Revideo，不是 canvas）**

理由：
- React 寫動畫組件 → 比 ffmpeg filter chain 快 5 倍開發速度
- Remotion 內部仍用 ffmpeg 編碼，不是「砍掉 ffmpeg」
- 現有 Next.js 技能直接上手
- 用戶有 57 個 Creatomate JSON 作為設計藍圖

### 遷移策略：漸進式，不是一刀切

```
不動：Python TTS 音頻生成 / R2 上傳 / Claude 腳本生成 / ffmpeg 本身
替換：pipeline.py 的 _render_scene_ffmpeg() 合成層
     → 改為 Remotion React 組件負責動畫合成
```

現有 Python service 繼續跑，Remotion 作為新的 rendering backend 並聯，
VideoStudio UI 加模板選擇 → 有選模板 → Remotion；無模板 → 現有 ffmpeg path。

---

## 二、Remotion 原理（新 session 必讀）

```
你寫的 React 組件（定義動畫）
        ↓
Remotion 用 Headless Chromium 每秒截 30 幀
        ↓
ffmpeg 把幀序列 + 音頻壓縮成 MP4
```

所以 Remotion 需要：Node.js 20 + Chromium + ffmpeg（都可以裝在 Docker）

---

## 三、Creatomate JSON 參考素材

用戶的 57 個模板位於：
`C:\Users\user1115\Downloads\video json-20260624T170049Z-3-001.zip`

已解壓到：`/tmp/creatomate_json/video json/`（本機 session 暫存）

每個 `.docx` 檔案內容是 Creatomate JSON（docx 包含 word/document.xml，去掉 XML tag 就是 JSON）。

**命名規則：**
```
<比例> - <類型> - <代碼> <動畫風格名>.docx
範例：16_9 - video - 3p3t1a PanSlide TextLeft 3Scenes.docx
      比例=16:9, 類型=video, 3張圖3段文字1音軌, 動畫=Pan滑動+左側文字
```

**提取 JSON 的方法（Python）：**
```python
import zipfile, re
with zipfile.ZipFile("檔案.docx") as z:
    with z.open("word/document.xml") as f:
        raw = f.read().decode("utf-8", errors="replace")
        text = re.sub(r"<[^>]+>", " ", raw)
        text = re.sub(r"&quot;", '"', text)
        text = re.sub(r"\s+", " ", text).strip()
        # text 現在是 Creatomate JSON
```

**建議優先翻譯的 5 個模板（最通用）：**
1. `16_9 - video - 1p1t1a ScaleBG TextSlideUp.docx` — 最簡單，1圖1文字，文字滑入
2. `16_9 - video - 3p3t1a PanSlide TextLeft 3Scenes.docx` — 標準3場景滑動
3. `16_9 - video - 1p1t1a CircleMask TextSlideUpReveal ScalePanBG.docx` — 圓形遮罩
4. `16_9 -video - 3p3t1a TextTypewriter.docx` — 打字機效果
5. `16_9 - video - 3p3t1a Photo Highlights SlidesZoom TextReveal.docx` — 多圖幻燈片

---

## 四、關鍵現有檔案（執行前必讀）

```
lobster-factory/
├── infra/hetzner-phase1-core/
│   ├── apps/
│   │   ├── video-service/
│   │   │   ├── pipeline.py        ← 核心：_render_scene_ffmpeg() 這個 function 是要被取代的
│   │   │   ├── server.py          ← EU HTTP server，POST /render, GET /job
│   │   │   └── Dockerfile         ← EU video service Docker 設定
│   │   │
│   │   └── next-admin/
│   │       ├── app/api/video/
│   │       │   ├── generate/route.ts    ← 入口
│   │       │   ├── draft/route.ts
│   │       │   ├── render-draft/route.ts
│   │       │   └── status/route.ts     ← polling
│   │       │
│   │       └── lib/content/
│   │           ├── blocks/
│   │           │   ├── video-pipeline.ts  ← 主流程協調
│   │           │   ├── video-prepare.ts   ← 準備場景（不渲染）
│   │           │   └── video-render.ts    ← 送 EU 渲染
│   │           │
│   │           └── video/
│   │               ├── video-script-core.ts  ← Claude 腳本生成
│   │               └── render-client.ts      ← EU HTTP client（要在這裡加 Remotion routing）
│   │
│   └── docker-compose.yml   ← 要在這裡加 remotion-service
```

**EU VPS 位置：** `204.168.175.41`（不是 SG 5.223.93.113）  
**EU 部署方式：** 直接 SSH 操作（非 sg-deploy.sh，那是 SG 專用）

---

## 五、執行計畫（四個 Phase）

### Phase 0 — 素材準備（30 分鐘）

**目標：** 把 57 個 Creatomate JSON 提取出來存進 repo

```bash
# 在本機 Windows 跑
python3 << 'EOF'
import zipfile, re, json, os

zip_path = r"C:\Users\user1115\Downloads\video json-20260624T170049Z-3-001.zip"
out_dir = r"D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\content\video\templates\creatomate-source"

os.makedirs(out_dir, exist_ok=True)

with zipfile.ZipFile(zip_path) as z:
    for name in z.namelist():
        if not name.endswith(".docx"):
            continue
        with z.open(name) as docx:
            with zipfile.ZipFile(docx) as inner:
                with inner.open("word/document.xml") as f:
                    raw = f.read().decode("utf-8", errors="replace")
                    text = re.sub(r"<[^>]+>", " ", raw)
                    text = re.sub(r"&quot;", '"', text)
                    text = re.sub(r"&amp;", "&", text)
                    text = re.sub(r"\s+", " ", text).strip()
                    # 找 JSON 開頭
                    start = text.find('{ "name"')
                    if start == -1:
                        start = text.find('{"name"')
                    if start != -1:
                        json_str = text[start:]
                        try:
                            parsed = json.loads(json_str)
                            fname = os.path.basename(name).replace(".docx", ".json")
                            with open(os.path.join(out_dir, fname), "w", encoding="utf-8") as out:
                                json.dump(parsed, out, ensure_ascii=False, indent=2)
                            print(f"OK: {fname}")
                        except json.JSONDecodeError as e:
                            print(f"FAIL: {name} — {e}")
EOF
```

**DoD：** `lib/content/video/templates/creatomate-source/` 有 57 個 .json 檔

---

### Phase 1 — EU Docker 加 Remotion service（2–3 小時）

**目標：** Remotion 在 EU VPS 跑起來，能接受 { image, narration, duration } → 輸出 MP4

**Step 1：確認 EU VPS 資源**
```bash
ssh root@204.168.175.41
free -h          # 需要至少 1.5GB 空閒（Headless Chrome 需要 ~512MB）
docker ps        # 看現有容器
cat /root/*/docker-compose.yml | grep -A3 video
```

**Step 2：建立 Remotion service**

新增目錄：`lobster-factory/infra/hetzner-phase1-core/apps/remotion-service/`

```
remotion-service/
├── Dockerfile
├── package.json
├── src/
│   ├── index.ts          ← HTTP server（接受 render 請求）
│   ├── compositions/
│   │   └── ScaleBGTextSlideUp.tsx   ← 第一個模板
│   └── Root.tsx          ← Remotion 入口
└── remotion.config.ts
```

**Dockerfile 關鍵點：**
```dockerfile
FROM node:20-alpine
# Chromium 依賴
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium-browser
# ffmpeg
RUN apk add --no-cache ffmpeg
# Remotion
RUN npm install -g @remotion/cli
```

**HTTP server 接口設計：**
```
POST /render-remotion
Body: {
  template: "scale-bg-text-slide-up",   // 模板名
  scenes: [{
    imageUrl: "https://...",
    narrationText: "旁白文字",
    audioUrl: "https://.../audio.mp3",  // 已由 Python TTS 生成
    duration: 6.5                        // 秒（由 Python TTS 算好的）
  }],
  outputFormat: "16x9",
  title: "影片標題"
}
Response: { jobId: "xxx" }

GET /job-remotion?jobId=xxx
Response: { status: "running"|"done"|"error", outputUrl?: "https://r2/..." }
```

**Step 3：加進 EU docker-compose.yml**
```yaml
remotion-service:
  build: ./apps/remotion-service
  ports:
    - "3002:3002"
  environment:
    - R2_BUCKET=...
    - R2_ENDPOINT=...
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

**Step 4：第一個 Remotion 組件（ScaleBG TextSlideUp）**

對照 `16_9 - video - 1p1t1a ScaleBG TextSlideUp.docx` 的 JSON 翻譯。

```tsx
// src/compositions/ScaleBGTextSlideUp.tsx
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface Props {
  imageUrl: string;
  text: string;
}

export const ScaleBGTextSlideUp: React.FC<Props> = ({ imageUrl, text }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  
  // 背景縮放（Ken Burns 替代）
  const scale = interpolate(frame, [0, durationInFrames], [1.1, 1.0]);
  
  // 文字滑入（spring 物理彈性）
  const textY = spring({ frame: frame - 20, fps, config: { damping: 80 } });
  const textTranslateY = interpolate(textY, [0, 1], [60, 0]);
  const textOpacity = interpolate(frame, [20, 35], [0, 1]);
  
  return (
    <AbsoluteFill>
      <Img src={imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
      <div style={{
        position: "absolute", bottom: "15%", left: "10%", right: "10%",
        background: "rgba(0,0,0,0.6)", padding: "20px 30px", borderRadius: 8,
        transform: `translateY(${textTranslateY}px)`, opacity: textOpacity,
        color: "white", fontSize: 42, fontWeight: 700, lineHeight: 1.4
      }}>
        {text}
      </div>
    </AbsoluteFill>
  );
};
```

**DoD Phase 1：**
- `curl http://204.168.175.41:3002/health` → 200
- 送一個測試 render request → 收到 jobId
- 30 秒後 poll job → 收到 R2 URL → 影片可播

---

### Phase 2 — 翻譯優先 5 個模板（10–15 小時，可分多 session）

每個模板流程：
1. 讀 creatomate-source/{name}.json
2. 理解動畫結構（元素、timing、easing、type）
3. 對應翻成 Remotion 組件
4. 在 Root.tsx 註冊
5. 加進 server.ts 的 template routing

**翻譯對照表（Creatomate → Remotion）：**

| Creatomate animation type | Remotion 做法 |
|--------------------------|---------------|
| `pan` (縮放移動) | `interpolate(frame, [0, dur], [startScale, endScale])` |
| `slide` (滑入) | `spring()` + `interpolate()` 換算 translateX/Y |
| `text-appear` (文字逐字) | `interpolate` 每幀截取字串 |
| `fade` | `interpolate(frame, [in, in+10], [0, 1])` opacity |
| `zoom` | `spring()` + scale |
| `wipe` | `clipPath` 漸進展開 |

---

### Phase 3 — 接進現有 Pipeline（2–3 小時）

**目標：** VideoStudio 加模板選擇 → 選了模板的影片走 Remotion，其他走現有 Python

**修改 render-client.ts：**
```typescript
export async function submitRender(params: RenderParams) {
  if (params.templateId) {
    // 走 Remotion
    return submitRemotionRender(params);
  }
  // 走現有 Python EU service
  return submitLegacyRender(params);
}
```

**修改 VideoStudio.tsx：**
- 在「標題動畫」下方加「動畫模板」選擇區
- 模板列表硬碼（Phase 2 翻好幾個就加幾個）
- 選了模板 → `templateId` 傳進 handleDraft()

**DoD Phase 3：**
- 在 VideoStudio 選模板 → 生成的影片有動畫效果
- 不選模板 → 走舊路徑，舊影片不受影響

---

### Phase 4 — 完整模板庫（持續進行）

57 個 Creatomate JSON 逐步翻，優先順序：
1. 先做 16:9（最常用）
2. 再做 9:16（Reels/TikTok）
3. 最後 4:5 / 1:1

---

## 六、尚未決定的事項（下個 session 需確認）

1. **EU VPS 記憶體**：Headless Chrome 需要 ~512MB，需確認 EU VPS 空閒記憶體夠不夠
   - 指令：`ssh root@204.168.175.41 'free -h && docker stats --no-stream'`

2. **音頻處理**：Remotion 可以自己處理 `<Audio>` 組件，還是繼續讓 Python TTS 生成 mp3 再傳給 Remotion？
   - 建議：Python TTS 生 mp3 → URL 傳給 Remotion（最小改動）

3. **字幕顯示**：保留現有 ffmpeg drawtext 字幕風格？還是改用 Remotion 的字幕組件（更漂亮但要重做）？

4. **EU 部署方式**：EU 不用 sg-deploy.sh。確認 EU 目前的部署腳本在哪裡

---

## 七、不要動的東西

- Python TTS 邏輯（audio 生成）
- Claude 腳本生成（video-script-core.ts）
- R2 上傳邏輯
- 現有 Python video-service（繼續跑，作為 fallback）
- SG 任何東西（這個改動只在 EU）
- ffmpeg 本身（Remotion 需要它）

---

## 八、參考資料

- Remotion 官方文件：https://remotion.dev
- Remotion Docker 部署：https://www.remotion.dev/docs/docker
- Remotion useCurrentFrame / spring：https://www.remotion.dev/docs/use-current-frame
- 用戶的 Creatomate JSON：`C:\Users\user1115\Downloads\video json-20260624T170049Z-3-001.zip`

---

_計畫建立：2026-06-25 | 建立者：Claude Code session 853a7d72_
