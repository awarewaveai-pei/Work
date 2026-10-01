# 決策：aware-wave.com DMARC 何時從 p=none 升到 quarantine/reject

**日期：** 2026-09-10
**模式：** 直接決策，非 `/decide` 面板（單一維度、標準協定知識可判斷，無需多角色辯論）
**決策者：** Claude（操作者已於本輪全權delegate：「需要決定的事都你決定」）

## 決定

**現在不升級。** 維持 `p=none` 至 **2026-09-28**（= p=none 起算 2026-08-29 滿 30 天），之後照下表機械分階段推進，不是一次跳到 reject：

| 日期（含以後） | 條件 | 動作 | 狀態 |
|---|---|---|---|
| 2026-09-28 | rua 報表顯示三個已知寄件來源（Cloudflare Email Routing／Amazon SES／Resend）皆對齊，零未解釋失敗 | `p=quarantine; pct=25` | ✅ **2026-10-01 已執行**（見下方「執行紀錄」；9/28 排程提醒有準時觸發推播，實際報表查核延到 10/1 才做） |
| 2026-10-15 | 同上，pct=25 期間零未解釋失敗 | `pct=100` | 待執行，尚未建排程提醒 |
| +14 天（≈2026-10-29） | 同上，pct=100 期間零未解釋失敗 | `p=reject` | 待執行 |
| 任一階段 | 出現未解釋的失敗（非測試信、非已知第三方） | **凍結在當前階段**，先查明原因，不得跳過原因逕自往下推進 | — |

## 執行紀錄

**2026-10-01｜階段 1 執行（p=none → p=quarantine;pct=25）**

操作者手動下載 10 份 Google DMARC rua 報表（2026-09-08～2026-09-29），逐份解壓解析：DKIM 100% pass、SPF 100% pass、disposition 全 none，零失敗；來源 IP 全落在 AWS SES 固定區段，簽章組合穩定（Resend DKIM on root + SES DKIM + SPF via `send.aware-wave.com`）。樣本涵蓋 9/10 SPF 修補前後，確認無回歸。符合過關條件，執行升級：Cloudflare API PATCH `_dmarc.aware-wave.com`（record id `f28b0da709e0379d4921e99fc39b8c36`）→ `v=DMARC1; p=quarantine; pct=25; rua=mailto:peijingartstudio@gmail.com; fo=1`，CF API 直接 GET 覆查確認生效。完整證據鏈見 `agency-os/WORKLOG.md` 2026-10-01「DMARC 升第一階段」條目。

**殘留**：只驗證了 Google 一家收信方；2026-10-15 複查時應同時確認是否有 Microsoft/Yahoo 等其他主要收信方的報表，不要只看 google.com 寄件者。9/28 一次性排程提醒已耗用，10/15 這一步需另開新 routine（或操作者手動記得）。

## 為什麼不是今天做

1. **今天剛改的 SPF（補 `include:_spf.resend.com`，見 WORKLOG 同日條目）還沒有任何觀察窗**——DMARC 執行等於拿一個幾分鐘前才生效的授權去做正式測試，時機上不成立。
2. **p=none 至今僅 12 天（8/29 起算）**，DMARC 標準做法（RFC 7489 業界慣例）建議至少覆蓋 2–4 週的寄信週期（含週期性/低頻寄件者）才有足夠 aggregate report 樣本判斷「執行後會不會誤傷」。
3. **爆炸半徑不對稱**：DMARC 執行做錯 = 客戶/交易信被 quarantine 或 reject，是會被使用者感知到的生產事故；不執行 = 現狀維持，零新增風險。標準工程判斷是「數據不夠時不做不可逆的執行面變更」。
4. **分階段（pct 漸進）而非一次到 reject**：即使 9/28 條件都滿足，一次跳 100% reject 仍把「當下方案覆蓋率不完整」的風險全部一次性兌現；分階段讓任何遺漏的寄件來源在低影響比例下先暴露。

## 誰去查 rua 報表

`rua=mailto:peijingartstudio@gmail.com`（操作者信箱）。我目前沒有任何工具能讀取這個信箱，所以 9/28 這一步需要操作者本人開信箱看聚合報表，或另外接一個 DMARC 報表解析服務（如 dmarcian／Postmark DMARC digests）——這個「怎麼看報表」本身不是本次決策範圍，先用最低成本的「操作者手動看」路徑，若嫌麻煩再評估工具。

## 回滾

DNS TXT 記錄單筆修改，任何一步都能立即改回 `p=none`；沒有不可逆的部分。

## Switch Conditions（何時重開這個決策）

- 新增了 rua 報表之外看不到、無法確認對齊的寄件管道（例如新接一個行銷 ESP）→ 先確認該管道 SPF/DKIM 對齊後才能繼續往下一階段推進，不受本表日期驅動
- 9/28 前如果需要提早執行（例如遭遇釣魚仿冒事件，需要立刻擋假冒寄件）→ 這屬於安全事件應變，走 High-risk-STOP 流程單獨決策，不套用本表的漸進時程
