import { NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { DEFAULT_SIGNUP_PRODUCT, isSelfSignupProductKey, type ProductKey } from "@/lib/portal/products";

/** false while createUser below pre-confirms the email without proof (KNOWN V1 GAP): the route stays closed. Flip only
 *  together with a confirmation-email flow -- an unproven email can be added to a brand (0103, /api/social/members). */
const SIGNUP_VERIFIES_EMAIL = false;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Portal signup — the FIRST real external consumer of the client/org identity model
// (lib/tenant-guard.ts, organizations/profiles/organization_memberships in 0001_core.sql).
// See PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §5/§7/§9/§11 for the full design + critic review.
//
// Same shape as app/api/onboarding/intake-browser/route.ts (env gate + Turnstile + rate limit)
// -- reused deliberately, this is the house pattern for a public-web write endpoint.
//
// Host enforcement (this route is served on app.aware-wave.com's Next.js instance too, since
// Next.js file-based routing is host-agnostic) lives in middleware.ts's isWrongHostForPortal(),
// NOT here -- one choke point, not duplicated per-route logic (critic finding C3).
//
// ⚠ PORTAL_SIGNUP_ENABLED IS THE ONLY GATE for this route, checked independently of Turnstile,
//   and required in EVERY environment including production (critic finding C3, 2026-08-29:
//   the original version only read this var inside a NODE_ENV!=production dev-bypass branch,
//   so in production it could never enable OR disable the route -- the de-facto gate was
//   TURNSTILE_SECRET_KEY, shared with the unrelated /intake form, meaning turning that form on
//   would have silently opened portal signup too). Leave PORTAL_SIGNUP_ENABLED unset in
//   production until this route is ready for real traffic; TURNSTILE_SECRET_KEY is required
//   ADDITIONALLY once it is.
//
// ⚠ KNOWN V1 GAP (documented, not silently assumed away): email_confirm:true below skips
//   Supabase's email-ownership verification -- there is no portal-specific transactional email
//   flow yet. Bounded by: (a) middleware.ts denies any user_kind=client session outside
//   /portal/* (critic finding C2 fix), so a signed-up-but-unverified email cannot reach the
//   admin console; (b) email-enumeration is not observable (see M5 fix below). Must still be
//   revisited before opening signup beyond a small invite list. Since 0103 (2026-10-15) (a) no longer
//   bounds it: a brand owner adds members by email (/api/social/members) and the member gets a role on
//   that brand, so an unverified signup for someone else's address would be handed their brand. Verify
//   email ownership here before PORTAL_SIGNUP_ENABLED opens (TASKS), or make members invitations.
//   Enforced, not just written: SIGNUP_VERIFIES_EMAIL (top of file) keeps this route closed whatever the env says
//   until a confirmation-email flow replaces email_confirm:true and flips it (with its own review).
// ─────────────────────────────────────────────────────────────────────────────

const SIGNUP_WINDOW_MIN = 10;
const SIGNUP_MAX_PER_WINDOW = 5;
const MAX_EMAIL_LEN = 254;
const MAX_ORG_NAME_LEN = 120;
const MAX_PASSWORD_LEN = 128;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SignupBody = {
  email?: string;
  password?: string;
  org_name?: string;
  product_key?: string;
  turnstile_token?: string;
};

/**
 * Rate-limit key. Critic finding M4 (2026-08-29): the original design counted ALL
 * portal_signup organizations globally, so one attacker's 5 signups locked out every
 * legitimate customer worldwide for 10 minutes (the same DoS shape intake-public/route.ts:25-26
 * already documents for that form). Scoping the count to a per-caller hash means an attacker
 * can only exhaust their OWN bucket. A raw IP is not stored -- only a salted hash, so the
 * counter can't be reverse-mapped to who signed up (privacy, not just security).
 * Residual (documented, accepted for V1): this is still count-then-write, not atomic, so a
 * burst of concurrent requests from the same caller could each observe a pre-limit count and
 * all proceed. Bounded by Turnstile (each attempt needs a fresh solve) and by being per-caller
 * rather than global -- worst case is that one caller's own burst briefly exceeds the nominal
 * cap, not a global lockout. A fully atomic fix would move this into a Postgres unique-window
 * constraint; tracked as a follow-up, not blocking V1 given the bounded worst case.
 */
function rateLimitKey(request: Request): string {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  // Critic finding M-2 (2026-08-29, CONFIRMED): docker-compose.yml wires this var as
  // `${PORTAL_SIGNUP_RATE_LIMIT_SALT:-}`, which sets an EMPTY STRING (not unset/undefined) when
  // the host env doesn't define it. `??` only falls back on null/undefined, so `""` silently won,
  // making the salt deterministic and the "not reverse-mappable" claim below false in exactly
  // the deploy shape this repo uses. `||` falls back on any falsy value including "".
  const salt = process.env.PORTAL_SIGNUP_RATE_LIMIT_SALT || "portal-signup-default-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function POST(request: Request) {
  // C3 fix + codex second-opinion finding 1 (2026-08-29, CONFIRMED): PORTAL_SIGNUP_ENABLED
  // alone used to be sufficient to open this route, with captcha only enforced IF
  // TURNSTILE_SECRET_KEY separately happened to be set. Flipping PORTAL_SIGNUP_ENABLED=true
  // without also setting TURNSTILE_SECRET_KEY (an easy operator mistake -- two unrelated env
  // vars with no dependency enforced between them) would open a service-role-backed,
  // unauthenticated account-creation endpoint to bots with ZERO captcha protection. Both are
  // now required together -- there is no partially-open state.
  if (!SIGNUP_VERIFIES_EMAIL || process.env.PORTAL_SIGNUP_ENABLED !== "true" || !process.env.TURNSTILE_SECRET_KEY) {
    return NextResponse.json(
      { ok: false, error: "coming_soon", message: "Portal signup is coming soon." },
      { status: 503 },
    );
  }

  // Critic finding (2026-08-29, minor): the length check below runs AFTER request.text() has
  // already buffered the whole body -- an unbounded read (nginx's client_max_body_size 50M is
  // the only real ceiling, buffered fully in Node heap per request). Reject oversized requests
  // by their declared Content-Length before reading anything.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 8_192) {
    return NextResponse.json({ ok: false, error: "request_too_large" }, { status: 413 });
  }
  const rawText = await request.text();
  if (rawText.length > 8_192) {
    return NextResponse.json({ ok: false, error: "request_too_large" }, { status: 413 });
  }

  let body: SignupBody;
  try {
    body = JSON.parse(rawText) as SignupBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Captcha is now unconditional (TURNSTILE_SECRET_KEY is guaranteed present by the gate above).
  if (!body.turnstile_token) {
    return NextResponse.json({ ok: false, error: "captcha_required" }, { status: 422 });
  }
  {
    const remoteip =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      undefined;
    const captchaOk = await verifyTurnstileToken(body.turnstile_token, remoteip);
    if (!captchaOk) {
      return NextResponse.json({ ok: false, error: "captcha_failed" }, { status: 422 });
    }
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const orgName = (body.org_name ?? "").trim();
  // Explicit whitelist -- an unrecognised value is a 422, not silently coerced to a default
  // (a typo'd product_key used to give the customer the wrong product with no error).
  if (body.product_key !== undefined && !isSelfSignupProductKey(body.product_key)) {
    return NextResponse.json({ ok: false, error: "invalid_product_key" }, { status: 422 });
  }
  const productKey: ProductKey = isSelfSignupProductKey(body.product_key) ? body.product_key : DEFAULT_SIGNUP_PRODUCT;

  if (
    !EMAIL_RE.test(email) || email.length > MAX_EMAIL_LEN ||
    password.length < 8 || password.length > MAX_PASSWORD_LEN ||
    !orgName || orgName.length > MAX_ORG_NAME_LEN
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_input",
        required: [
          `email (valid address, max ${MAX_EMAIL_LEN} chars)`,
          `password (8-${MAX_PASSWORD_LEN} chars)`,
          `org_name (1-${MAX_ORG_NAME_LEN} chars)`,
        ],
      },
      { status: 422 },
    );
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  const rlKey = rateLimitKey(request);
  const windowStart = new Date(Date.now() - SIGNUP_WINDOW_MIN * 60_000).toISOString();
  const { count, error: countErr } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("metadata->>source", "portal_signup")
    .eq("metadata->>rl_key", rlKey)
    .gte("created_at", windowStart);
  if (countErr) {
    console.error("[portal/signup] rate-limit count query failed", { error: countErr.message });
    return NextResponse.json({ ok: false, error: "rate_check_failed" }, { status: 503 });
  }
  if ((count ?? 0) >= SIGNUP_MAX_PER_WINDOW) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after_seconds: SIGNUP_WINDOW_MIN * 60 },
      { status: 429 },
    );
  }

  // Pre-generate the org id so app_metadata.org_id can be set at user-creation time (see
  // 0063_portal_complete_signup.sql header for why this ordering is required).
  const orgId = randomUUID();

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // see KNOWN V1 GAP above
    app_metadata: { user_kind: "client", org_id: orgId },
  });
  if (createErr || !created?.user) {
    const msg = (createErr?.message ?? "").toLowerCase();
    // Critic finding M-3 (2026-08-29): prefer the structured error code GoTrue actually sets
    // (`email_exists`, per @supabase/auth-js's error-codes.d.ts) over guessing from message
    // text. The direction that matters is under-inclusion, not over-inclusion: if this ever
    // stops matching a real duplicate, that email falls through to the 500 branch below instead
    // of the indistinguishable 202 -- silently re-opening the exact staff-email enumeration
    // oracle M5 exists to close. The substring check stays as a fallback in case GoTrue's error
    // shape varies by version, but the structured code is checked first.
    const looksLikeDuplicate = createErr?.code === "email_exists" || msg.includes("already") || msg.includes("registered");
    if (looksLikeDuplicate) {
      // M5 fix (critic, 2026-08-29): do NOT reveal "already registered" as a distinct 409.
      // The Supabase Auth project behind this route also holds STAFF admin-console accounts,
      // so a distinct response here would let an anonymous caller enumerate internal employee
      // emails, not just customer ones. A generic accepted-shaped response gives no signal
      // either way; real differentiation belongs in a future confirmation-email flow (see
      // KNOWN V1 GAP), not in this response's status code.
      return NextResponse.json(
        { ok: true, message: "If this address can sign up, you'll be able to log in shortly." },
        { status: 202 },
      );
    }
    // Codex second-opinion finding 3 (2026-08-29, CONFIRMED): the M5 fix above was originally
    // applied to EVERY createUser failure, not just the duplicate-email case -- which meant a
    // wrong service-role key, GoTrue being down, or any other real infra failure was ALSO
    // reported to the browser as "帳號建立完成", with no way for the customer or an operator to
    // learn signup silently didn't work. Only the enumeration-sensitive case (duplicate email)
    // gets the indistinguishable response; every other failure is a real, visible error.
    console.error("[portal/signup] auth.admin.createUser failed (non-duplicate)", {
      error: createErr?.message ?? "no user returned",
    });
    return NextResponse.json({ ok: false, error: "signup_failed" }, { status: 500 });
  }
  const userId = created.user.id;

  const { error: rpcErr } = await supabase.rpc("portal_complete_signup", {
    p_org_id: orgId,
    p_user_id: userId,
    p_org_name: orgName,
    p_email: email,
    p_product_key: productKey,
    p_rate_limit_key: rlKey,
  });
  if (rpcErr) {
    // M6 fix (critic, 2026-08-29): a network/timeout error from supabase-js can surface in
    // rpcErr even when Postgres actually committed (the function itself is atomic; the FAILURE
    // MODE here is losing the response, not losing the transaction). Blindly deleting the auth
    // user in that case would orphan a real organizations row and permanently squat the
    // customer's email in profiles.email (UNIQUE, 0001_core.sql:30) -- they could never sign up
    // again. Re-check before compensating: only delete the auth user if the org row is actually
    // absent.
    const { data: maybeOrg, error: recheckErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", orgId)
      .maybeSingle();
    if (maybeOrg) {
      console.error(
        "[portal/signup] rpc reported an error but organizations row exists -- treating as success, not compensating",
        { userId, orgId, rpcError: rpcErr.message },
      );
      return NextResponse.json({ ok: true, organization_id: orgId }, { status: 201 });
    }
    // Critic finding M-B (2026-08-29, CONFIRMED): the ORIGINAL version of this re-check
    // dropped its own `error` and treated "query failed" the same as "confirmed absent" --
    // exactly the scenario M6 exists to guard against (the same network/timeout that made
    // rpcErr unreliable can just as easily make THIS query fail too). "Couldn't check" and
    // "confirmed absent" are different states and must not be collapsed: only delete the auth
    // user when we are CERTAIN no organizations row exists. When uncertain, do nothing further
    // and surface a distinct error so an operator reconciles by hand -- never guess and delete.
    if (recheckErr) {
      console.error(
        "[portal/signup] CRITICAL: portal_complete_signup failed AND the re-check query itself failed -- state unknown, NOT compensating (would risk deleting a real account). Requires manual reconciliation.",
        { userId, orgId, rpcError: rpcErr.message, recheckError: recheckErr.message },
      );
      return NextResponse.json({ ok: false, error: "signup_state_unknown" }, { status: 500 });
    }
    const { error: cleanupErr } = await supabase.auth.admin.deleteUser(userId);
    if (cleanupErr) {
      console.error(
        "[portal/signup] CRITICAL: portal_complete_signup failed AND compensating deleteUser failed -- orphaned auth user requires manual cleanup",
        { userId, orgId, rpcError: rpcErr.message, cleanupError: cleanupErr.message },
      );
    }
    return NextResponse.json({ ok: false, error: "signup_write_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, organization_id: orgId }, { status: 201 });
}
