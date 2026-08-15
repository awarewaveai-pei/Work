# soulfulexpression.org — DNS 遷移對照表（Hostinger → Cloudflare）

> **這份是「執行用」文件，只管 DNS 記錄怎麼搬。**
> 更大的脈絡（主機架構、WPML 多語、CF 快取/APO、Supabase、安全性）在需求 brief：
> [`../docs/cloudflare-wpml-migration-plan.md`](../docs/cloudflare-wpml-migration-plan.md)
> —— 該檔開頭有 **2026-08-15 現況更新**，載明它哪些前提已作廢，先讀那段再讀本文。
> 硬死線與執行順序追蹤於 `agency-os/TASKS.md`「🔴【硬死線 2026-11-12】」。

> **用途**：Cloudflare 只會提供「我們手動建進去的記錄」。任何一條漏掉，切換 nameserver 的當下就會靜默消失。
> **最貴的漏失是信箱** —— Starter Business Email 已預付到 2029-06-03，漏掉 MX/SPF/DKIM 客戶就直接收不到信。
>
> **清點時間**：2026-08-15（`dig` 逐型別查詢，來源 8.8.8.8；`dig ANY` 不可靠故未採用）
> **清點方式**：apex 全型別 + 信箱相關子網域 + 30 個常見子網域 + 萬用字元探測
> **SOA serial 當時**：`2026081301`（切換前請重查，serial 變動代表 Hostinger 端有人改過）

---

## 完整記錄清單（13 筆）

| # | 型別 | 名稱 | 值 | CF Proxy | 關鍵性 |
|---|------|------|-----|----------|--------|
| 1 | A | `@` | `191.101.230.176` | 🟠 **開** | 網站 |
| 2 | AAAA | `@` | `2a02:4780:3:724:0:3826:ec85:2` | — | ⚠️ **不要建**，見下方說明 |
| 3 | CNAME | `www` | `soulfulexpression.org` | 🟠 **開** | 網站 |
| 4 | MX | `@` | `mx1.hostinger.com`（優先 **5**） | ⚪ 關 | 🔴 **信箱** |
| 5 | MX | `@` | `mx2.hostinger.com`（優先 **10**） | ⚪ 關 | 🔴 **信箱** |
| 6 | TXT | `@` | `v=spf1 include:_spf.mail.hostinger.com ~all` | — | 🔴 **信箱**（SPF） |
| 7 | TXT | `@` | `google-site-verification=9gqMu5Xz8A6-92XlVwslA6PT5ilTWSAisFYSKzIfslc` | — | Search Console 驗證 |
| 8 | TXT | `_dmarc` | `v=DMARC1; p=none` | — | 🔴 **信箱**（DMARC） |
| 9 | CNAME | `hostingermail-a._domainkey` | `hostingermail-a.dkim.mail.hostinger.com` | ⚪ 關 | 🔴 **信箱**（DKIM） |
| 10 | CNAME | `hostingermail-b._domainkey` | `hostingermail-b.dkim.mail.hostinger.com` | ⚪ 關 | 🔴 **信箱**（DKIM，目前 `p=` 空值） |
| 11 | CNAME | `autodiscover` | `autodiscover.mail.hostinger.com` | ⚪ 關 | 信箱用戶端自動設定 |
| 12 | CNAME | `autoconfig` | `autoconfig.mail.hostinger.com` | ⚪ 關 | 信箱用戶端自動設定 |
| 13 | A | `ftp` | `191.101.230.176` | ⚪ 關 | 隨 hosting 一起退場，切換時可不建 |

**未發現**：CAA 記錄、萬用字元（`*`）記錄、staging/dev/api/cdn 等子網域、其他驗證用 TXT。

---

## ⚠️ AAAA 記錄要「刻意不建」

第 2 筆 `AAAA → 2a02:4780:...` **就是間歇性失效的那個位址**。

- 30 天實測：三個 monitor 各約 42,000 次檢查，失敗率 0.107%–0.115%；失敗原因 **130/139（94%）為 IPv6 專屬**（`ETIMEDOUT` 119 / `ECONNREFUSED` 11）
- apex 與 `www` 只要開 Cloudflare proxy（🟠），**Cloudflare 會用自己的 IPv6 對外服務**，回源走 IPv4
- 所以**不要把 Hostinger 的 AAAA 複製過去** —— 這一步就是 IPv6 問題的永久解

## ⚪ 哪些一定不能開 Proxy

MX 本身不是 proxy 的對象；`autodiscover` / `autoconfig` / DKIM 這些 CNAME **若被 proxy，會回傳 Cloudflare 的 IP 而不是 Hostinger 的信箱主機**，用戶端自動設定與 DKIM 驗證會壞。**一律灰雲（DNS only）**。

---

## 切換前檢核（每項打勾才動 nameserver）

- [ ] 13 筆記錄已在 Cloudflare 建好（`ftp` 可略）
- [ ] 逐筆與本表對照一次（特別是 SPF 的 `~all`、DKIM 的完整 CNAME 目標）
- [ ] 重新 `dig` 一次確認 SOA serial 未變（變了代表 Hostinger 端有異動，需重新清點）
- [ ] Cloudflare 端 TTL 先設低（切換後觀察期用）
- [ ] 已有可還原的新備份（見 `BACKUP_RESTORE_PROOF.md`）
- [ ] 切換後驗證：網站 200、`https://` 憑證正常、**寄一封測試信進出**、DKIM/SPF 通過（可用 mail-tester）

## 回滾

Hostinger 端 nameserver 改回 `ns1.dns-parking.com` / `ns2.dns-parking.com` 即可。**因此切換前不要刪除 Hostinger 的 DNS 區域**，保留原始區域作為回滾路徑。

---

## 重查指令

```bash
# 在有 dig 的環境（EU VPS）執行
sh /tmp/dns-inventory.sh
```

腳本來源：`scratchpad/dns-inventory.sh`（逐型別查詢，非 `dig ANY`）。
