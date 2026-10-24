// Its own module so a route that stores a URL (content sources, wp_sites) need not import the trending stack. For a
// URL fetched once on a customer's say-so, use lib/collect/net/remote-file (address gate on every hop, pinned connection).

/**
 * SSRF guard: https only, no internal/loopback/private hosts. Used for any
 * non-hardcoded (env / future DB-UI) feed URL.
 *
 * 限制：只比對 URL 字面 host，不解析 DNS → 擋不住 DNS rebinding。因此 env
 * CONTENT_TRENDING_FEEDS 視為「受信任營運者」輸入；未來開放任意使用者貼 feed 時，
 * 必須在 fetch 前加 DNS 解析後比對或 allowlist。
 */
export function isSafePublicHttps(rawUrl: string): boolean {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol !== "https:") return false;
  let h = u.hostname.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);  // 去 IPv6 中括號
  // IPv6 位址：只放行全球單播 2000::/3（首段四位、2 或 3 開頭）。multicast ff、ULA fc/fd、link-local fe80、::、::1、
  // IPv4-mapped ::ffff:、NAT64 64:ff9b: 都在範圍外——用允許清單，不逐一列舉（逐一列舉會漏，也會誤擋 fdic.gov 這類網域）。
  if (h.includes(":")) return /^[23][0-9a-f]{3}:/.test(h);
  h = h.replace(/\.+$/, "");                                       // "localhost." 與 "localhost" 是同一台
  if (!h.includes(".")) return false;                              // 單段名稱 = 內網／Docker 服務名（lobster-nginx）
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/^(22[4-9]|2[3-5]\d)\./.test(h)) return false;                    // multicast 224/4、保留 240/4、廣播
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false;  // CGNAT 100.64/10
  return true;
}
