// Invariant: VW accepts an identity only when next-admin signed it (HMAC keyed with VW_INTERNAL_TOKEN); network topology is not a boundary.
// Canonical string must match next-admin app/api/video/workbench/session/route.ts.
const crypto = require("node:crypto");
const SKEW_SECONDS = 30;
const canonical = (f) => ["vw-session-v1", f.userId, f.orgId, f.billingOrgId, f.userKind, f.role, f.expires].join("\n");
const sign = (token, f) => crypto.createHmac("sha256", token).update(canonical(f)).digest("base64url");
function verify(token, headers, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token) return false;
  const h = (n) => String(headers[n] ?? "");
  const fields = { userId: h("x-vw-user-id"), orgId: h("x-vw-org-id"), billingOrgId: h("x-vw-billing-org-id"), userKind: h("x-vw-user-kind"), role: h("x-vw-role"), expires: h("x-vw-expires") };
  if (!/^\d{1,12}$/.test(fields.expires) || Number(fields.expires) + SKEW_SECONDS < nowSeconds) return false;
  const given = Buffer.from(h("x-vw-signature")), want = Buffer.from(sign(token, fields));
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
module.exports = { sign, verify };
