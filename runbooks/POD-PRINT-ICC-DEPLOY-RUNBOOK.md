# POD Print ICC / PDF-X OutputIntent Deploy Runbook ([0-a-gs])

> **目的**：把 POD/Tarot 印刷軌的「CMYK PDF → PDF/X-1a（帶 ICC `/OutputIntent`）」最後一哩部署上線。
> **狀態**：程式碼 + Dockerfile + compose 已就緒（2026-06-13）；**SG VPS Alpine 真機 REALTEST 通過**。**正式啟用 = High risk（prod deploy），需操作者 go-ahead**。

> **REALTEST 證據（2026-06-13，SG VPS ephemeral 容器）**：`docker run --rm node:20-alpine` + `apk add ghostscript`（gs **10.06.0**）跑真 CMYK PDF（pdf-lib 產，含 TrimBox）經本 runbook §1 的 gs 命令 → **GS_EXIT=0、`/OutputIntent`×2、`PDF/X-1a:2001` 命中、`/DeviceCMYK`×1（未轉 RGB）、`/DestOutputProfile`×1、bundled ICC 存在**。容器與測試檔已清除，未碰 prod stack。

---

## 0. 背景（為什麼需要這步）

- pdf-lib 能產 CMYK PDF + TrimBox/BleedBox，但 **無法寫 ICC `/OutputIntent`**（PR #1512 closed，library 停維護）。
- 印刷廠 preflight 要 `/OutputIntent`（指定印刷色彩條件）。沒有 → 退件。
- 解法：**Ghostscript 後處理**。但 `gs -dPDFX` 單獨 **不會** 寫 `/OutputIntent`（只做 conformity + 色彩轉換）— 必須配一個 `PDFX_def.ps` pdfmark 檔（`lib/studio/pdfx-def.ts` 動態生成），且 **def 檔要排在 input PDF 之前**。
- 來源：Ghostscript 官方 doc（VectorDevices / Creating a PDF/X document）+ upstream `lib/PDFX_def.ps`（web-researcher 2026-06-13）。

## 1. 已就緒的程式碼（本機已驗）

| 檔案 | 角色 |
|------|------|
| `lib/studio/pdfx-def.ts` | 純函式生成 `PDFX_def.ps`（pdfmark：ICC stream N=4 + OutputIntent + Catalog 掛載） |
| `lib/studio/ghostscript-pdfx.ts` | `applyOutputIntent()`：寫 def.ps+in.pdf → 跑 gs → **後驗 `/OutputIntent` 存在否則 throw** |
| `apps/next-admin/Dockerfile` | runner stage `RUN apk add --no-cache ghostscript`（自帶 `/usr/share/ghostscript/iccprofiles/default_cmyk.icc` SWOP） |
| `docker-compose.yml` | `POD_OUTPUT_INTENT_DEPLOYED:-false` + 三個 `POD_ICC_*` override（預設空=用 bundled） |

**gs 命令**（與 `ghostscript-pdfx.ts` `gsArgs()` 一致，def 在 input 前）：
```bash
gs -dPDFX -dBATCH -dNOPAUSE -dPDFXCompatibilityPolicy=1 \
   -sColorConversionStrategy=CMYK -sDEVICE=pdfwrite \
   -sOutputFile=out.pdf  PDFX_def.ps  in.pdf
```
`-dPDFX` 強制 `CompatibilityLevel=1.3`（無 object stream）→ `/OutputIntent` 為 plaintext，可 grep 後驗。

## 2. ICC profile 授權（採購待辦，非阻塞）

| Profile | 授權 | 結論 |
|---------|------|------|
| `default_cmyk.icc`（gs 自帶，SWOP） | AGPL（容器內當工具用，不單獨散布 profile） | **MVP 預設用它**；US 目的地色彩正確 |
| Adobe `JapanColor2001Coated` / `USWebCoatedSWOP` | Adobe 授權，**不可重散布** | 不可 COPY 進 image |
| ECI `ISOcoated_v2` / `PSOcoated_v3` | ECI，**不可重散布**（需書面許可） | 不可用 |
| basICColor `ISOcoated_v2_bas.ICC` | Creative Commons（下載後讀 README 確認 sub-type） | **可商用重散布** → TW/EU coated 最佳免費具名 |

**現況**：所有目的地預設走 bundled SWOP（產出合法 PDF/X-1a，色彩=SWOP）。要 region-accurate：把 CC/授權 `.icc` COPY 進 image + 設對應 `POD_ICC_<name>` env，**零程式改動**（`resolveIccPath()` 已支援）。tw-local（Japan Color）色彩精準度 = 採購決策，列待辦。

## 3. 部署步驟（High risk — 需 go-ahead）

> 走標準 `sg-deploy.sh`（內建 test gate → healthcheck → smoke → 失敗自動 rollback）。**勿**手動 git pull / docker build。

1. 確認程式碼已 merge 到 main（pdfx-def.ts / ghostscript-pdfx.ts / Dockerfile / compose）。
2. `/check-drift` 確認 SG drift 清零；`/verify` build gate 過；`npx tsc --noEmit` 0。
3. SG 設 env：`POD_OUTPUT_INTENT_DEPLOYED=true`（在 SG 的 `.env` / compose env file）。
4. 跑 `sg-deploy.sh next-admin`（會 rebuild image → gs 進 image）。
5. **部署後驗證**（見 §4）。

## 4. 部署後驗證（必做）

```bash
# a. gs 真的在 image 裡
docker exec lobster-next-admin gs --version
docker exec lobster-next-admin test -f /usr/share/ghostscript/iccprofiles/default_cmyk.icc && echo ICC_OK

# b. 真實 API 出 PDF/X：呼叫 print 模式（需 operator role header + POD_DESIGNS_ENABLED=true）
#    tw-local/mpc/printninja 不再回 output_intent_not_deployed，而是回 application/pdf
curl -s -X POST https://app.aware-wave.com/api/tools/image/process \
  -H 'content-type: application/json' -H 'x-ops-claims-role: operator' \
  -d '{"mode":"print","destination":"tgc","image":"data:image/png;base64,...."}' | head -c 200
#    （tgc 一直可用；CMYK 目的地在 flag=true 後應回 PDF。把回傳 base64 decode 後 grep /OutputIntent）

# c. 下載一張 CMYK 印刷檔，本機 grep（-dPDFX 無 object stream，plaintext 可見）
grep -a -c /OutputIntent downloaded.pdf      # 應 ≥ 1
grep -a -o 'PDF/X-1a:2001' downloaded.pdf     # 應命中
```

**Gate**：`/OutputIntent` count ≥ 1 且 `PDF/X-1a:2001` 命中 = PASS。否則 `applyOutputIntent` 會 throw `GsOutputIntentMissingError`（route catch → ok:false code=bake_failed），不會靜默輸出壞檔。

## 5. Rollback

- 最快：SG 設 `POD_OUTPUT_INTENT_DEPLOYED=false` → CMYK 目的地退回 `output_intent_not_deployed`（友善 ok:false，TGC sRGB PNG 仍可用），重啟容器。
- 完整：`sg-deploy.sh` 失敗自動 rollback 到上一個 healthy image（gs 隨之消失，無副作用）。
- Dockerfile 的 `apk add ghostscript` 是 additive，移除只需 revert 該行 + rebuild。

## 6. 風險與紅線

- **High risk**：步驟 3-4 動 prod image + env。需操作者明示 go-ahead。
- gs `apk add` 增約 ~50MB image size（可接受）。
- ICC 採購（Japan Color 色彩精準）= 業務決策，不阻塞 MVP（SWOP 已產合法 PDF/X-1a）。
- **絕不**用 `-dNOSAFER`（ICC 路徑需在容器可讀絕對路徑，預設 SAFER 模式即可）。
