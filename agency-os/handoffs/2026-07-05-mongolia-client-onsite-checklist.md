# 蒙古旅遊業新客戶 — 現場開機 Checklist（一頁版）

> 用途：出差用客戶電腦時照做。**客戶電腦零檔案、零憑證** — 只用瀏覽器。
> 建立：2026-07-05 ｜ 搭配 Claude 遠端全自動設置

---

## 出發前（在家做）

- [ ] 確認 Hetzner 帳號密碼記得 + 2FA 手機帶著
- [ ] 下面 public key 存手機記事本（可公開，不是密碼）：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK4ihPieknnd+m8VVWEm9SOvLY1JPXTlgmup1D+aivDP user@DESKTOP-N33595I
```

- [ ] （可選，更省事）console → Security → API Tokens 產一個 Read/Write token 交給 Claude 進 vault → 現場連 console 都不用點，對話說「開機」即可

---

## 現場（客戶電腦，只用瀏覽器，約 10 分鐘）

1. 開 **https://console.hetzner.com/** → 登入
2. **New Project** → 名稱 = 客戶名
3. **Add Server**：

| 欄位 | 選 |
|---|---|
| Location | **Falkenstein (FSN1)** |
| Image | **Ubuntu 24.04** |
| Type | Shared vCPU → **CPX21**（3 vCPU / 4GB）|
| SSH keys | **Add SSH key** → 貼上面那串 → 打勾 |
| 其他 | 預設即可 |

4. **Create & Buy now** → 記下畫面上的 **IPv4**
5. 開 Claude（Claude Code web 或 claude.ai）貼：
   > 新主機開好了，IP = x.x.x.x，客戶名 = ___，網域 = ___，開始設置

---

## 之後 Claude 遠端做（你不用動）

- Day-1 硬化：防火牆 / fail2ban / 自動安全更新 / SSH 鎖 key-only
- 裝 WordPress 棧（nginx + PHP + MariaDB + SSL）
- 旅遊外掛包（vault `/opt/lobster-plugins/` 40 檔中的旅遊組）：travelwp 主題、
  kadence 全套、fluent-booking/forms/crm/campaign、WooCommerce + product-addons +
  points + coupons、translatepress 多語、advanced-google-maps、wp-rocket、recaptcha
- 免費外掛：WooCommerce、Rank Math SEO、行程引擎（依 travelwp 綁定）、Currency Switcher
- Cloudflare 接網域（CDN + 免費 WAF）
- 交付：wp-admin 網址 + 管理帳號（密碼走安全通道，不進 git）

---

## 安全紅線（提醒自己）

- ❌ 客戶電腦不存任何 private key / user-env.ps1 / CREDENTIALS
- ❌ 不在客戶電腦瀏覽器「記住密碼」
- ✅ 用完 Hetzner console 登出
