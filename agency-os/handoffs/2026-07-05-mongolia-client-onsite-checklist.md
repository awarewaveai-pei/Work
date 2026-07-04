# 蒙古旅遊業新客戶 — 現場建站 Checklist（一頁版，v2 Cloudways）

> 用途：出差用客戶電腦時照做。**客戶電腦零檔案、零憑證** — 只用瀏覽器。
> 模式：**一次性交付，不含後續維護** → managed 主機 + 免費外掛優先 + 完工全帳密交割。
> 建立：2026-07-05 ｜ v2：Hetzner 裸 VPS → Cloudways（無人維護站不能用裸 VPS；Hostinger 續約跳價排除）
> 部署流程正本：`agency-os/docs/`（tourism Cloudways stack，commit 30cbaa4f）

---

## 出發前（在家做）

- [ ] 下面 public key 存手機記事本（可公開，不是密碼）：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK4ihPieknnd+m8VVWEm9SOvLY1JPXTlgmup1D+aivDP user@DESKTOP-N33595I
```

- [ ] 跟客戶確認：她的 email（註冊用）+ 她的信用卡（帳號一開始就是她的，不掛我們名下）
- [ ] 網域：她名下註冊（Namecheap/Cloudflare Registrar），還沒買就現場一起買

---

## 現場（客戶電腦，只用瀏覽器，約 15 分鐘）

1. 開 **https://www.cloudways.com/** → 用**客戶 email** 註冊（3 天免費試用，可先建站後綁卡）
2. **Launch Server**：

| 欄位 | 選 |
|---|---|
| Application | **WordPress**（最新版）|
| Provider | **DigitalOcean** |
| Size | **1GB**（$11/月固定；不夠日後一鍵升 2GB）|
| Location | **Frankfurt**（歐洲客群近；日韓客群多改 Singapore）|

3. 等 ~5 分鐘開好 → **Server → Master Credentials** 頁：
   - [ ] 啟用 **SSH Access**
   - [ ] SSH keys → 貼上面 public key
4. 開 Claude（Claude Code web / claude.ai）貼：
   > Cloudways 開好了，IP = x.x.x.x，SSH user = ___，客戶名 = ___，網域 = ___，開始建站
5. （網域）DNS A record 指到 IP — Cloudways 面板有教學，或丟給 Claude 遠端指導

---

## 之後 Claude 遠端做（你不用動）

- WP 基礎設定 + SSL（Cloudways 面板一鍵 Let's Encrypt）
- **免費外掛包**（她之後自己後台就能更新）：
  WooCommerce、Rank Math SEO、FluentForm（免費版）、FluentCRM（免費版）、
  Kadence 主題 + Kadence Blocks（免費版）、行程引擎（WP Travel Engine 免費版）、
  TranslatePress（免費版，1 語言對）、Currency Switcher、Site Kit
- 佈景 + 首頁/行程頁/關於/聯絡 基礎版型
- 完工後**移除我們的 SSH key** → 乾淨切割

## 付費授權（她自買，綁她 email，才有更新）

| 需求 | 買什麼 | 約多少 |
|---|---|---|
| 行程功能進階（團位/日期/報名）| WP Travel Engine Pro 或 travelwp 主題 | $59-99/年 |
| 多語超過 1 對（蒙/英/中…）| TranslatePress Business | ~€89/年 |
| 預約制（包車/導覽）才需要 | FluentBooking Pro | ~$99/年 |

> ❌ 不用 vault 的付費 zip — license 是我們的，她收不到更新，一年後變安全漏洞。

---

## 完工交割（切割清單）

- [ ] 交付：Cloudways 帳密（本來就她的）、wp-admin 帳密、網域帳密
- [ ] 移除我們 SSH key（Cloudways 面板 + wp-admin 多餘管理員帳號）
- [ ] 給她 1 頁「怎麼自己更新外掛/備份在哪」小抄
- [ ] 提醒：之後要維護服務再另簽（門留著，尾巴不留）

## 安全紅線（提醒自己）

- ❌ 客戶電腦不存任何 private key / user-env.ps1 / CREDENTIALS
- ❌ 不在客戶電腦瀏覽器「記住密碼」
- ✅ 用完所有 console 登出
