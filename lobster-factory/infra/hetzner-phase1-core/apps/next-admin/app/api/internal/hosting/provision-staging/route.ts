/**
 * POST /api/internal/hosting/provision-staging
 *
 * HTTP_JSON hosting adapter bridge — called by Trigger.dev create-wp-site task.
 * Creates a WordPress subdirectory staging install on ks-aw-01 via SSH.
 *
 * Auth: Authorization: Bearer {LOBSTER_HOSTING_API_TOKEN}
 * Input: { organizationId, siteId, siteName }
 * Output: { environmentId, wpRootPath, stagingSiteUrl, wpAdminUrl, wpAdminUser }
 *
 * Host access: HOSTING_BRIDGE_SSH_* key, whose only power is the forced command
 * scripts/aw-hosting-gate.sh (verbs `staging-prepare <slug> <db>`, `staging-wp <slug>`). The command line
 * carries only the validated slug/db; scripts, passwords and ids travel on stdin. Every value put into a
 * script goes through shq(). Contract: lib/hosting/__tests__/hosting-gate-contract.test.ts.
 */

import { NextResponse } from "next/server";
import type { Client as SshClient } from "ssh2";
import { connectSsh, readSshTargetFromEnv, sshExec } from "@/lib/repair-center/ssh";
import { timingSafeEqual } from "../../../../../lib/ops-inbox/verifyIngestToken";
import { getSupabaseWriteClient } from "../../../../../lib/supabase-server";
import type { WebsiteSpec } from "../../../../../lib/onboarding/intake-form";
import { generateTarotImage } from "../../../../../lib/tarot/image-gen";
import { isR2Configured, buildWebImageKey, parseImageDataUrl, putDesignObject } from "../../../../../lib/storage/r2";
import { generateStagingAdminPassword, vaultStagingAdminPassword } from "../../../../../lib/hosting/staging-admin-credential";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STAGING_BASE_URL = "https://aware-wave.com/staging";
const WP_ROOT_BASE = "/var/www/html/staging";
const STAGING_ADMIN_EMAIL = "staging@aware-wave.com";
// Returned as wpAdminUser: MainWP registration (workflows addSiteToMainWp) must name this exact user.
const STAGING_ADMIN_USER = "admin";
const BRIDGE_ENV_PREFIX = "HOSTING_BRIDGE";
// Same patterns as aw-hosting-gate.sh SLUG_RE / DB_RE: a value the gate would refuse is a 422 here.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DB_RE = /^wp_[a-z0-9_]{1,60}$/;
const SITE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // = create-wp-site z.string().uuid()
const PLUGIN_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/; // = workflows/src/tasks/wp-install-plugins.ts pluginSlugs

function toSlug(name: string, siteId: string): string {
  // All-CJK names produce an empty base → fall back to "site" so the slug isn't "-<id>".
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18) || "site";
  return `${base}-${siteId.replace(/-/g, "").slice(0, 6)}`;
}

function toDbName(siteId: string): string {
  return `wp_s_${siteId.replace(/-/g, "").slice(0, 22)}`;
}

function slugFromWpPath(wpPath: string): string | null {
  const slug = wpPath.startsWith(`${WP_ROOT_BASE}/`) ? wpPath.slice(WP_ROOT_BASE.length + 1) : "";
  return SLUG_RE.test(slug) ? slug : null;
}

/** Runs `lines` as www-data in the site's dir via the gate's `staging-wp` verb; `wpcli` is predefined. */
function gateWp(conn: SshClient, slug: string, lines: string[]) {
  const wpcli = `wpcli() { php -d memory_limit=256M /usr/local/bin/wp --path=${shq(`${WP_ROOT_BASE}/${slug}/`)} "$@"; }`;
  return sshExec(conn, `staging-wp ${slug}`, [wpcli, ...lines].join("\n") + "\n");
}

// ── Content seeding (Stage C) ────────────────────────────────────────────────
// Turns the provisioned WP shell into a content-filled site using the AI website spec.
// The script travels as raw bytes on the SSH channel's stdin to the gate (staging-wp), never through a
// host shell, so CJK cannot mojibake. Every interpolated spec value is shq()-escaped (POSIX single-quote),
// confirmed injection-proof (a `'; echo PWNED;'` probe echoed as a literal, not executed).
const MAX_SEED_PAGES = 12; // bound wall time under the Cloudflare ~100s request ceiling

function shq(s: unknown): string {
  return `'${String(s ?? "").replace(/'/g, `'\\''`)}'`;
}

function htmlEscape(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHomepageHtml(spec: WebsiteSpec): string {
  const hero = spec.homepage?.hero;
  const sections = spec.homepage?.sections ?? [];
  const parts: string[] = [];
  if (hero?.headline) parts.push(`<!-- wp:heading {"level":1} --><h1>${htmlEscape(hero.headline)}</h1><!-- /wp:heading -->`);
  if (hero?.subheadline) parts.push(`<!-- wp:paragraph --><p>${htmlEscape(hero.subheadline)}</p><!-- /wp:paragraph -->`);
  if (hero?.cta_text) {
    const href = htmlEscape(hero.cta_url || "#");
    parts.push(`<!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="${href}">${htmlEscape(hero.cta_text)}</a></div><!-- /wp:button --></div><!-- /wp:buttons -->`);
  }
  for (const sec of sections) {
    if (sec?.headline) parts.push(`<!-- wp:heading --><h2>${htmlEscape(sec.headline)}</h2><!-- /wp:heading -->`);
    if (sec?.body) parts.push(`<!-- wp:paragraph --><p>${htmlEscape(sec.body)}</p><!-- /wp:paragraph -->`);
  }
  return parts.join("\n");
}

// One idempotent bash script. Completion-gated: the `aw_seed_done` option is set LAST, so a
// half-seed never short-circuits a retry; every create is guarded by slug so a re-run repairs
// rather than duplicates.
function buildSeedScript(spec: WebsiteSpec): string[] {
  const L: string[] = [];
  L.push(`set -e`);
  L.push(`if [ "$(wpcli option get aw_seed_done 2>/dev/null)" = "1" ]; then echo "AW_SEED_SKIP already seeded"; exit 0; fi`);
  if (spec.site_name) L.push(`wpcli option update blogname ${shq(spec.site_name)}`);
  if (spec.tagline) L.push(`wpcli option update blogdescription ${shq(spec.tagline)}`);
  // Exclude the homepage slugs (incl. our reserved aw-home) so a colliding spec slug can't
  // blank the front page by matching the aw-home lookup below.
  const pages = (spec.sitemap ?? []).filter((p) => p && !p.is_homepage && p.slug !== "home" && p.slug !== "aw-home").slice(0, MAX_SEED_PAGES);
  for (const p of pages) {
    const slug = (p.slug || "").trim();
    if (!slug) continue;
    L.push(`if ! wpcli post list --post_type=page --name=${shq(slug)} --field=ID 2>/dev/null | grep -q .; then wpcli post create --post_type=page --post_status=publish --post_name=${shq(slug)} --post_title=${shq(p.title || slug)} >/dev/null; fi`);
  }
  const homeTitle = (spec.sitemap ?? []).find((p) => p?.is_homepage)?.title || "首頁";
  const homeHtml = buildHomepageHtml(spec);
  L.push(`HOME_ID=$(wpcli post list --post_type=page --name=aw-home --field=ID 2>/dev/null | head -n1)`);
  L.push(`if [ -z "$HOME_ID" ]; then HOME_ID=$(wpcli post create --post_type=page --post_status=publish --post_name=aw-home --post_title=${shq(homeTitle)} --post_content=${shq(homeHtml)} --porcelain); fi`);
  L.push(`wpcli option update show_on_front page`);
  L.push(`wpcli option update page_on_front "$HOME_ID"`);
  const rm = spec.plugin_config?.rankmath;
  const seoTitle = rm?.site_title || spec.seo?.meta_title;
  const seoDesc = rm?.meta_description || spec.seo?.meta_description;
  if (seoTitle) L.push(`wpcli post meta update "$HOME_ID" rank_math_title ${shq(seoTitle)} >/dev/null 2>&1 || true`);
  if (seoDesc) L.push(`wpcli post meta update "$HOME_ID" rank_math_description ${shq(seoDesc)} >/dev/null 2>&1 || true`);
  // Brand colours → Additional CSS via core wp_update_custom_css_post() (theme-agnostic; verified
  // rendering on the 曦光 site 2026-06-27). Kadence's own palette option storage is undocumented/
  // fragile, so we tint the key elements (buttons/headings/links/header) with the AI brand palette.
  const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null);
  const primary = hex(spec.design?.primary_color) ?? hex(spec.plugin_config?.kadence?.global_color_palette?.[0]);
  const secondary = hex(spec.design?.secondary_color) ?? hex(spec.plugin_config?.kadence?.global_color_palette?.[1]);
  if (primary) {
    const sec = secondary ?? primary;
    const css =
      `:root{--aw-primary:${primary};--aw-secondary:${sec}}` +
      `.wp-block-button__link,.wp-element-button{background-color:${primary} !important;border-color:${primary} !important;color:#fff !important}` +
      `h1,h2,h3,.entry-title,.site-title,.site-branding a{color:${sec} !important}` +
      `a{color:${primary}}body{--global-palette1:${primary};--global-palette2:${sec}}` +
      `.site-header-wrap,.site-top-header-wrap{border-top:4px solid ${primary}}`;
    L.push(`wpcli eval ${shq(`wp_update_custom_css_post('${css}');`)}`);
  }
  L.push(`wpcli option update aw_seed_done 1 >/dev/null`);
  L.push(`echo "AW_SEED_OK home=$HOME_ID pages=${pages.length}"`);
  return L;
}

// Generate ONE AI hero image from the spec's visual direction and install it at the top of the
// homepage (+ set as featured). flux-schnell is fast (~5-8s) so this fits inside the seed call's
// budget. Best-effort + idempotent (aw_hero_done option) — a failure never fails seeding.
// `media_sideload_image` (core) does the import+insert in one PHP eval, so no bash/php var passing.
async function generateAndInstallHeroImage(conn: SshClient, slug: string, spec: WebsiteSpec): Promise<string> {
  if (!isR2Configured()) return "hero image skipped: R2 not configured";
  const style = (spec.design?.image_style || "warm natural light, soft handcrafted texture, atmospheric").slice(0, 200);
  // imagen-4 (Google) over flux-schnell: flux-schnell renders gibberish pseudo-text on hero banners
  // even with negative prompts; Imagen honours "no text" reliably for clean photographic heroes.
  const prompt = `${style}. A wide cinematic hero banner photograph for ${spec.site_name || "a brand"}. Photorealistic, atmospheric, tasteful, high detail. Absolutely no text, no words, no letters, no captions, no signage, no logo, no watermark anywhere in the image.`;
  const gen = await generateTarotImage({ model: "imagen-4", prompt, aspectRatio: "16:9" });
  if (!gen.ok) return `hero image gen failed: ${"error" in gen ? gen.error : "gen_failed"}`;
  const parsed = parseImageDataUrl(gen.image);
  if (!parsed) return "hero image: unparseable output";
  const key = buildWebImageKey();
  const put = await putDesignObject(key, parsed.buffer, parsed.mime);
  if (!put.ok) return "hero image: R2 upload failed";
  const url = put.publicUrl; // public https R2 URL — controlled, no user input
  const heroPhp =
    `$url='${url}';$h=get_page_by_path('aw-home');if(!$h){echo 'AW_HERO_NOHOME';return;}` +
    `require_once(ABSPATH.'wp-admin/includes/media.php');require_once(ABSPATH.'wp-admin/includes/file.php');require_once(ABSPATH.'wp-admin/includes/image.php');` +
    `$att=media_sideload_image($url,$h->ID,null,'id');if(is_wp_error($att)){echo 'AW_HERO_ERR '.$att->get_error_message();return;}` +
    `$img=wp_get_attachment_url($att);$b='<!-- wp:image {"id":'.$att.',"sizeSlug":"large","align":"wide"} --><figure class="wp-block-image alignwide size-large"><img src="'.$img.'" alt="" class="wp-image-'.$att.'"/></figure><!-- /wp:image -->';` +
    `wp_update_post(array('ID'=>$h->ID,'post_content'=>$b.$h->post_content));set_post_thumbnail($h->ID,$att);echo 'AW_HERO_OK att='.$att;`;
  const res = await gateWp(conn, slug, [
    `if [ "$(wpcli option get aw_hero_done 2>/dev/null)" = "1" ]; then echo "AW_HERO_SKIP"; exit 0; fi`,
    `wpcli eval ${shq(heroPhp)}`,
    `wpcli option update aw_hero_done 1 >/dev/null`,
  ]);
  const out = `${res.stdout}${res.stderr}`;
  return out.includes("AW_HERO_OK") || out.includes("AW_HERO_SKIP")
    ? `hero image: ${out.match(/AW_HERO_(OK|SKIP)[^\n]*/)?.[0] ?? "ok"}`
    : `hero image WARN: ${out.replace(/\s+/g, " ").slice(0, 200)}`;
}

async function seedContentFromSpec(conn: SshClient, slug: string, websiteSpecId: string): Promise<string> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return "content seed skipped: no DB client";
  const { data, error } = await supabase
    .from("website_specs")
    .select("spec_data")
    .eq("id", websiteSpecId)
    .single();
  if (error || !data?.spec_data) {
    return `content seed skipped: spec not found (${error?.message ?? "no row"})`;
  }
  const spec = data.spec_data as WebsiteSpec;
  const res = await gateWp(conn, slug, buildSeedScript(spec));
  const out = `${res.stdout}${res.stderr}`;
  if (res.code !== 0 || !(out.includes("AW_SEED_OK") || out.includes("AW_SEED_SKIP"))) {
    return `content seed WARN (code ${res.code}): ${out.replace(/\s+/g, " ").slice(0, 300)}`;
  }
  // Best-effort AI hero image (never fails the seed result).
  let heroNote = "hero image skipped";
  try {
    heroNote = await generateAndInstallHeroImage(conn, slug, spec);
  } catch (e) {
    heroNote = `hero image error: ${e instanceof Error ? e.message : String(e)}`;
  }
  return `content seeded: ${out.match(/AW_SEED_(OK|SKIP)[^\n]*/)?.[0] ?? "ok"} | ${heroNote}`;
}

// Wire a newly-provisioned client into the content toolchain: create a WP Application Password,
// register a wp_sites row carrying organization_id (so SEO Content / Video can target it), and
// stamp client_config.site_url on the org. Without this the built client is invisible to the
// content tools (connectivity audit 2026-06-27). Idempotent: skips if wp_sites row exists.
// NOTE: 租戶歸屬走 wp_sites.organization_id，**不再是** client_config.site_url 的 hostname 比對
// —— 那套猜測在 2026-08-26 (439499c7) 移除，因為所有 staging 站的 hostname 都相同。
// Best-effort — a wiring failure must NOT fail the provision.
async function wireClientToContentTools(
  conn: SshClient,
  slug: string,
  organizationId: string | undefined,
  siteName: string,
  siteUrl: string,
): Promise<string> {
  if (!organizationId) return "wiring skipped: no organizationId";
  const supabase = getSupabaseWriteClient();
  if (!supabase) return "wiring skipped: no DB client";
  const cleanUrl = siteUrl.replace(/\/$/, "");
  try {
    // Read org metadata first (for the brand colour + to merge site_url later).
    const { data: org } = await supabase.from("organizations").select("metadata").eq("id", organizationId).single();
    const meta = (org?.metadata ?? {}) as Record<string, unknown>;
    const cc = (meta.client_config ?? {}) as Record<string, unknown>;
    const brandColor = ((cc.brandColors as { primary?: string } | undefined)?.primary) ?? "#5855d0";

    // 1. RESERVE the wp_sites row FIRST (token empty, inactive). `wp_sites` has a unique index on
    //    lower(url) (0039_wp_sites.sql:18), so a duplicate insert fails atomically (23505) → that
    //    is our idempotency. Crucially we mint the app-password only AFTER winning this reservation,
    //    so a concurrent/retry race can never leave an orphaned WP credential.
    const { error: insErr } = await supabase
      .from("wp_sites")
      .insert({ name: siteName, url: cleanUrl, username: "admin", token: "", color: brandColor, active: false,
                // organization_id 是租戶歸屬的**權威欄位**（migration 0061）。0061 回填了當時
                // 既有的 5 列，但這個 insert 一直沒填它 —— 也就是說在此之前每一個新佈建的站
                // organization_id 都是 null，而 null 對 client 是 fail-closed（canAccessOrg），
                // 客戶頁與內容工具都看不到自己的站。這裡有 organizationId（函式開頭已擋 falsy）。
                organization_id: organizationId });
    if (insErr) {
      return (insErr as { code?: string }).code === "23505"
        ? "wiring skipped: wp_sites row already exists"
        : `wiring WARN: wp_sites insert failed (${insErr.message})`;
    }

    // 2. We won the reservation → mint a WP Application Password (REST API auth for content tools).
    const apRes = await gateWp(conn, slug, [
      `wpcli user application-password create ${STAGING_ADMIN_USER} 'AwareWave Content' --porcelain 2>/dev/null`,
    ]);
    const appPw = apRes.stdout.trim().split(/\s+/).pop() ?? "";
    if (appPw.length < 16) {
      // Roll back the placeholder so a later re-run can complete wiring cleanly.
      await supabase.from("wp_sites").delete().eq("url", cleanUrl).eq("token", "");
      return `wiring WARN: app-password not created (code ${apRes.code})`;
    }

    // 3. Activate the row with the real token + stamp client_config.site_url (用於健康探測與顯示；
    //    租戶歸屬看的是 organization_id，不是這個 URL。spread 保留 brandColors 等既有鍵）。
    await supabase.from("wp_sites").update({ token: appPw, active: true }).eq("url", cleanUrl);
    meta.client_config = { ...cc, site_url: cleanUrl };
    await supabase.from("organizations").update({ metadata: meta }).eq("id", organizationId);
    return "wired: site_url + wp_sites + app-password";
  } catch (e) {
    return `wiring error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// mode:"seed" — a short, synchronous seed-only call. The persistent Trigger.dev `create-wp-site`
// task makes this AFTER the provision call returns, so neither call hits the CF ~100s ceiling and
// the work runs in a process that survives (next-admin can't run post-response background work).
async function handleSeedMode(body: { websiteSpecId?: string; wpPath?: string; siteId?: string }): Promise<Response> {
  const { websiteSpecId, wpPath, siteId } = body;
  if (!websiteSpecId || !wpPath) {
    return NextResponse.json({ error: "websiteSpecId and wpPath required for seed mode" }, { status: 422 });
  }
  const slug = slugFromWpPath(wpPath);
  if (!slug) {
    return NextResponse.json({ error: `wpPath must be ${WP_ROOT_BASE}/<slug>` }, { status: 422 });
  }
  const target = readSshTargetFromEnv(BRIDGE_ENV_PREFIX, { explicit: true });
  if (!target) {
    return NextResponse.json({ error: "hosting bridge SSH not configured (HOSTING_BRIDGE_SSH_*)" }, { status: 503 });
  }
  let conn: SshClient | null = null;
  try {
    conn = await connectSsh(target);
    const seeded = await seedContentFromSpec(conn, slug, websiteSpecId);
    return NextResponse.json({ ok: true, siteId: siteId ?? null, seeded });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "seed_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  } finally {
    conn?.end();
  }
}

async function prepareMainWpChild(conn: SshClient, slug: string, uniqueId: string | undefined): Promise<string | null> {
  if (uniqueId === undefined) return null;
  if (!/^[0-9a-f]{32,128}$/.test(uniqueId)) return "WARN: mainwpChildUniqueId malformed; MainWP child not prepared";
  const res = await gateWp(conn, slug, [
    `{ wpcli option update mainwp_child_uniqueId ${uniqueId} --quiet && wpcli user meta update ${STAGING_ADMIN_USER} mainwp_child_user_enable_passwd_auth_connect 0 --quiet; } >/dev/null 2>&1`,
  ]);
  return res.code === 0
    ? "MainWP child prepared (unique security id set; password auth off for the admin)"
    : "WARN: MainWP child preparation failed; MainWP registration will be refused";
}

export async function POST(request: Request) {
  // Auth
  const apiToken = process.env.LOBSTER_HOSTING_API_TOKEN?.trim();
  if (!apiToken) {
    return NextResponse.json({ error: "LOBSTER_HOSTING_API_TOKEN not configured" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!timingSafeEqual(bearer, apiToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { organizationId?: string; siteId?: string; siteName?: string; manifestSlug?: string; pluginSlugs?: string[]; websiteSpecId?: string; mode?: string; wpPath?: string; mainwpChildUniqueId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Seed-only mode (separate short call from create-wp-site after provision) — see handleSeedMode.
  if (body.mode === "seed") {
    return handleSeedMode(body);
  }

  const { organizationId, siteId, siteName, manifestSlug = "wp-basic", pluginSlugs = [] } = body;
  if (!siteId || !siteName) {
    return NextResponse.json({ error: "siteId and siteName required" }, { status: 422 });
  }

  if (!SITE_ID_RE.test(siteId)) {
    return NextResponse.json({ error: "siteId must be a uuid" }, { status: 422 });
  }
  const slug = toSlug(siteName, siteId.toLowerCase());
  const dbName = toDbName(siteId.toLowerCase());
  if (!SLUG_RE.test(slug) || !DB_RE.test(dbName)) {
    return NextResponse.json({ error: "derived slug/db name invalid" }, { status: 422 });
  }
  if (!Array.isArray(pluginSlugs) || pluginSlugs.some((s) => typeof s !== "string" || !PLUGIN_SLUG_RE.test(s))) {
    return NextResponse.json({ error: "pluginSlugs must be wordpress.org slugs" }, { status: 422 });
  }
  const target = readSshTargetFromEnv(BRIDGE_ENV_PREFIX, { explicit: true });
  if (!target) {
    return NextResponse.json({ error: "hosting bridge SSH not configured (HOSTING_BRIDGE_SSH_*)" }, { status: 503 });
  }

  const wpPath = `${WP_ROOT_BASE}/${slug}`;
  const stagingSiteUrl = `${STAGING_BASE_URL}/${slug}/`;
  const wpAdminUrl = `${stagingSiteUrl}wp-admin/`;
  const adminPass = generateStagingAdminPassword();
  const environmentId = crypto.randomUUID();

  let conn: SshClient | null = null;
  try {
    conn = await connectSsh(target);

    // 1–4. Dir + DB + the site's own DB account + WordPress core + wp-config, all inside the gate
    // (idempotent; next-admin never holds a DB password). One site ↔ one DB ↔ one DB account.
    const prep = await sshExec(conn, `staging-prepare ${slug} ${dbName}`);
    const prepState = prep.stdout.match(/AW_PREPARE_OK state=(\w+)/)?.[1];
    if (prep.code !== 0 || !prepState) {
      throw new Error(`staging-prepare failed (code ${prep.code}): ${prep.stderr.trim() || prep.stdout.trim()}`);
    }

    // 5. Install WordPress. Detect "already installed" by `core is-installed` exit code: `core install`
    // reports it via WP_CLI::log, which --quiet suppresses (exit 0, empty stdout). A retry
    // (fetchWithRetry in trigger-build) reaching an installed site must not vault this call's fresh
    // password — WP kept the FIRST one.
    const isInstalled = await gateWp(conn, slug, [`wpcli core is-installed >/dev/null 2>&1`]);
    const alreadyInstalled = isInstalled.code === 0;
    if (!alreadyInstalled) {
      // The password goes in on stdin (--prompt), never on an argv; wp-cli echoes prompted values to
      // stdout, so stdout is discarded and only stderr may reach the error text.
      const installResult = await gateWp(conn, slug, [
        `printf '%s\\n' ${shq(adminPass)} | wpcli core install --url=${shq(stagingSiteUrl)} --title=${shq(`${siteName} Staging`)} --admin_user=${STAGING_ADMIN_USER} --admin_email=${STAGING_ADMIN_EMAIL} --skip-email --prompt=admin_password --quiet >/dev/null`,
      ]);
      if (installResult.code !== 0) {
        throw new Error(`wp core install failed: ${installResult.stderr.trim()}`);
      }
    }
    const adminCredNote = alreadyInstalled
      ? `Admin password unchanged (site already installed; user ${STAGING_ADMIN_USER})`
      : await vaultStagingAdminPassword({
          organizationId, siteId, slug, stagingSiteUrl, adminUser: STAGING_ADMIN_USER, password: adminPass,
        });

    // 6. Install base theme — skip for wp-tourism (apply-manifest installs TravelWP via localZip step)
    let themeOk = true;
    if (manifestSlug !== "wp-tourism") {
      const themeResult = await gateWp(conn, slug, [
        `wpcli theme install kadence kadence-child-theme-two --activate --quiet 2>&1 || wpcli theme install kadence --activate --quiet 2>&1`,
      ]);
      themeOk = themeResult.code === 0 || themeResult.stdout.includes("already installed");
    }

    // 7. Install base plugins; tourism uses Elementor/TravelWP so kadence-blocks is excluded
    const basePlugins = manifestSlug === "wp-tourism"
      ? ["seo-by-rank-math", "fluent-smtp"]
      : ["kadence-blocks", "seo-by-rank-math", "fluent-smtp", "litespeed-cache"];
    const ecommercePlugins = manifestSlug === "wc-core" || manifestSlug === "wc-custom"
      ? ["woocommerce", "woo-gutenberg-products-block"]
      : [];
    const crmPlugins = pluginSlugs.includes("fluent-crm") ? ["fluent-crm"] : [];
    const formPlugins = ["fluentform"];
    // The catalog marks mainwp-child installSource "manifest", but the manifest runner is off in prod,
    // so this is the only path that installs it. Without it MainWP registration (create-wp-site
    // addSiteToMainWp) is refused with "child plugin not detected".
    const managementPlugins = ["mainwp-child"];

    const allPlugins = [...new Set([
      ...basePlugins,
      ...ecommercePlugins,
      ...crmPlugins,
      ...formPlugins,
      ...managementPlugins,
      ...pluginSlugs, // validated against PLUGIN_SLUG_RE above
    ])];

    const pluginResult = await gateWp(conn, slug, [
      `wpcli plugin install ${allPlugins.map(shq).join(" ")} --activate --quiet 2>&1`,
    ]);
    const pluginsOk = pluginResult.code === 0;

    // 7b. Let MainWP connect without the admin password: mainwp-child accepts the Unique Security ID
    // only when password auth is off for the connecting user. Runs on every call — a retry reaching
    // an installed site must carry THIS run's id, the one create-wp-site sends to MainWP.
    // The id is a credential: request-only, never in the response, notes or error text.
    const mainwpNote = await prepareMainWpChild(conn, slug, body.mainwpChildUniqueId);

    // Wire this client into the content toolchain (app-password + wp_sites + site_url) so SEO
    // Content / Video can target it. Synchronous (~2s) and best-effort — never fails the provision.
    const wiringNote = await wireClientToContentTools(conn, slug, organizationId, siteName, stagingSiteUrl);

    // Content seeding is intentionally NOT done here. Seeding adds ~15-25s of WP-CLI work which,
    // on top of the ~71-90s provision, blew past the hosting-adapter / Cloudflare ~95-100s ceiling
    // → the run was marked "blocked" (verified live 2026-06-27). And next-admin can NOT run
    // post-response background work in this standalone deploy (`after()`/`void async` get cut —
    // WORKLOG 2026-06-17). So seeding runs as a SEPARATE short call (mode:"seed", handled at the
    // top of POST) that the persistent Trigger.dev `create-wp-site` task makes AFTER this provision
    // call returns. Each call stays under the CF ceiling; the orchestrator surfaces seed status.
    return NextResponse.json({
      environmentId,
      wpRootPath: wpPath,
      stagingSiteUrl,
      wpAdminUrl,
      wpAdminUser: STAGING_ADMIN_USER,
      provisioningNotes: [
        ...(!themeOk ? ["WARN: Kadence theme install had issues"] : []),
        ...(!pluginsOk ? ["WARN: some plugins may not have installed"] : [`Plugins installed: ${allPlugins.join(", ")}`]),
        wiringNote,
        `staging/${slug}/ — subdirectory install on aware-wave.com`,
        `DB: ${dbName} on lobster-wordpress-db (own account; ${prepState})`,
        // Never the password: these notes land in Trigger.dev run output + ops_action_runs.
        adminCredNote,
        ...(mainwpNote ? [mainwpNote] : []),
        `Org: ${organizationId ?? "n/a"} Site: ${siteId}`,
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "provisioning_failed", detail: msg }, { status: 500 });
  } finally {
    conn?.end();
  }
}
