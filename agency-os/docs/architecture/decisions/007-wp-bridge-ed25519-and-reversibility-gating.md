# ADR 007: wp-bridge 採 Ed25519 非對稱簽章 + 可逆性分類門控

- 狀態：已接受
- 日期：2026-06-05

## 脈絡

`aware-wave-wp-bridge`（clean-room WordPress 控制平面，設計 SSOT：`lobster-factory/packages/wp-bridge-plugin/WP_BRIDGE_CONTROL_PLANE_DESIGN.md`）讓 AI 對客戶 WordPress 站（首站 soulfulexpression.org，Hostinger LIVE）讀寫一切。兩個跨系統邊界、**不可逆/高成本迴轉**的選擇必須定案：

1. **認證機制**：站上憑證若被偷能否偽造寫入？參考工具 `jonjonesai/mega-kadence-bridge` 用明文 `credentials.json` + `?_key=`（憑證進 log、被駭即全偽造）。HMAC/Basic 等對稱方案，伺服器須持共享密鑰 → 站被駭即可全偽造。
2. **回滾語意**：self-healing transaction 對「內容/option」可乾淨還原；但對**有外部副作用的操作**（Woo 收款/退款、FluentCRM 群發、permalink 結構）若假裝能自動 undo，會造成真實世界損害（已寄信收不回、已收款、深層頁全 404）。

兩者一旦上線並被 SDK / WP 外掛 / vault / Dashboard 多處依賴，反悔成本極高（要換簽章演算法 = 全租戶 re-key；要改門控分類 = 重審每個端點）。

## 決策

1. **認證 = Ed25519 非對稱簽章**：客戶端 SDK / SaaS 控制平面持**私鑰**（在 vault，永不下放到站）；WP 外掛只存**公鑰**。每請求簽 `METHOD\nPATH\nTIMESTAMP\nNONCE\nsha256(body)` + timestamp(±300s) + nonce 單次 + header-only（`?_key=` 一律拒）。→ **站被駭也偽造不了寫入**。已實作 `includes/Auth/SignatureVerifier.php`，真測 7/7 PASS。
2. **可逆性分類門控**：每個寫入端點啟動時標三類之一 —— 可逆（自動 self-healing 回滾）／不可逆敏感（dry-run → Dashboard approvals 人工核可 → 才 commit，**永不自動回滾**）／拒絕（白名單外的裸 SQL/shell/eval）。分類表為 SSOT，見 DESIGN §I「可逆性分類門控表」。

## 後果

- 正面：站側零私鑰 → 主機淪陷不等於可偽造寫入（爆炸半徑最小）；不可逆操作永不被「假裝 undo」誤導，符合 30-yr 安全紀律；可商業販售（clean-room、不受 GPL 傳染）。
- 負面／代價：Ed25519 需 PHP `sodium` 擴充（本機 CLI 須 `-d extension=sodium`；Hostinger 須確認啟用）；非對稱簽章運算略重於 HMAC（控制操作可接受）；人工門控類犧牲「全自動」速度換安全（刻意取捨）。
- 需跟進文件／腳本：
  - `lobster-factory/packages/wp-bridge-plugin/WP_BRIDGE_CONTROL_PLANE_DESIGN.md`（§E 認證、§I 門控表 — SSOT）
  - `lobster-factory/packages/wp-bridge-plugin/includes/Auth/SignatureVerifier.php`（已實作）
  - vault keys：`WP_<TENANT>_BRIDGE_PRIVATE_KEY` / `WP_<TENANT>_BRIDGE_KEY_ID`（`secrets-vault.ps1`）
  - 未來 `wp-bridge-client`（簽章 wrapper）、`.claude/agents/wp-rest-operator.md`（門控繼承）
  - 門控的人工核可重用既有 `app/api/ops/approvals/**`（不新建平行審批流）
