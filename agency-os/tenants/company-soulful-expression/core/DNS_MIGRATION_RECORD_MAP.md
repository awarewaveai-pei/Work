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

## 清點當下的記錄清單（13 筆 —— 事後證實不完整，見表後警告）

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

> ⚠️ **上表已知不完整** —— 逐型別清點是靠「猜 selector 名稱」探測 `_domainkey`，只猜了 `-a` / `-b`，**漏掉 `hostingermail-c`**。實際 Cloudflare zone 為 **14 筆**，DKIM 實況見下一節。上表保留原樣是為了誠實記錄清點當下的認知，**不要拿它當回滾清單**。

---

## 🔴 DKIM 實況（2026-08-16 實測修正）

清點表的 DKIM 欄位**與實際簽章情形不符**。實測（mail-tester，10/10、`dkim=pass`）顯示 Hostinger 目前簽章用的 selector 是 **`hostingermail1`**：

```
dkim=pass (2048-bit key) header.d=soulfulexpression.org header.s=hostingermail1
```

四個 selector 的真實狀態：

| selector | Hostinger 舊 zone | Cloudflare zone | 內容 | 是否實際使用 |
|---|---|---|---|---|
| `hostingermail-a` | ✅ CNAME | ✅ CNAME | 有金鑰（2048-bit） | ❌ 未用（舊的） |
| `hostingermail-b` | ✅ CNAME | ✅ CNAME | `p=` **空值** | ❌ |
| `hostingermail-c` | ✅ CNAME | ✅ CNAME（14:54 UTC 補建） | `p=` **空值** | ❌ |
| `hostingermail1` | ❌ **不存在** | ✅ TXT（14:54 UTC 新建，內嵌公鑰） | 有金鑰（2048-bit） | ✅ **就是這把** |

**兩個推論**（證據強，但標示為推論）：

1. **切換前該網域的 DKIM 很可能是失效的** —— Hostinger 自己的 zone 從未發布 `hostingermail1`，而它們的外寄 MTA（經 MailChannels relay）用該 selector 簽章。驗證方查不到金鑰 ⇒ `dkim=fail`。搬到 Cloudflare 並補上這筆之後才 `dkim=pass`。**這次遷移不只沒弄壞信箱，還修好了一個既存問題。**
2. **因此回滾有代價** —— 把 nameserver 改回 `ns1/ns2.dns-parking.com` 會失去 `hostingermail1`，DKIM 退回失效狀態（DMARC 是 `p=none`，信仍會送達，但認證分數掉、進垃圾桶風險升高）。**回滾仍然可行且安全，但不再是「零損失」**，若要回滾請先在 Hostinger DNS 區域補上 `hostingermail1` TXT。

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

- [x] **14 筆**記錄已在 Cloudflare 建好（12 筆批次 + `hostingermail-c` / `hostingermail1` 補建）
- [ ] 逐筆與本表對照一次（特別是 SPF 的 `~all`、DKIM 的完整 CNAME 目標）
- [ ] 重新 `dig` 一次確認 SOA serial 未變（變了代表 Hostinger 端有異動，需重新清點）
- [ ] Cloudflare 端 TTL 先設低（切換後觀察期用）
- [ ] 已有可還原的新備份（見 `BACKUP_RESTORE_PROOF.md`）
- [ ] 切換後驗證：網站 200、`https://` 憑證正常、**寄一封測試信進出**、DKIM/SPF 通過（可用 mail-tester）

## 回滾

Hostinger 端 nameserver 改回 `ns1.dns-parking.com` / `ns2.dns-parking.com` 即可。**因此切換前不要刪除 Hostinger 的 DNS 區域**，保留原始區域作為回滾路徑。

⚠️ **回滾前先讀上面「DKIM 實況」** —— Hostinger 舊 zone 沒有 `hostingermail1`，直接回滾會讓 DKIM 退回失效狀態。要無損回滾，先在 Hostinger DNS 補一筆 `hostingermail1._domainkey` TXT（值從 Cloudflare zone 複製）。

---

## 重查指令

```bash
# 在有 dig 的環境（EU VPS）執行
sh /tmp/dns-inventory.sh
```

腳本來源：`scratchpad/dns-inventory.sh`（逐型別查詢，非 `dig ANY`）。
