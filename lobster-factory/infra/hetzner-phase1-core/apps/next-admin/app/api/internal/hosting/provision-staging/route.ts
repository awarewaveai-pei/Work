/**
 * POST /api/internal/hosting/provision-staging
 *
 * HTTP_JSON hosting adapter bridge — called by Trigger.dev create-wp-site task.
 * Creates a WordPress subdirectory staging install on the SG VPS via SSH.
 *
 * Auth: Authorization: Bearer {LOBSTER_HOSTING_API_TOKEN}
 * Input: { organizationId, siteId, siteName }
 * Output: { environmentId, wpRootPath, stagingSiteUrl, wpAdminUrl, wpAdminUser }
 */

import { NextResponse } from "next/server";
import { Client as SshClient } from "ssh2";
import { timingSafeEqual } from "../../../../../lib/ops-inbox/verifyIngestToken";
import { getSupabaseWriteClient } from "../../../../../lib/supabase-server";
import type { WebsiteSpec } from "../../../../../lib/onboarding/intake-form";
import { generateTarotImage } from "../../../../../lib/tarot/image-gen";
import { isR2Configured, buildWebImageKey, parseImageDataUrl, putDesignObject } from "../../../../../lib/storage/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STAGING_BASE_URL = "https://aware-wave.com/staging";
const WP_ROOT_BASE = "/var/www/html/staging";
const WP_CLI = "php -d memory_limit=256M /usr/local/bin/wp";
const STAGING_ADMIN_EMAIL = "staging@aware-wave.com";
// Returned as wpAdminUser: MainWP registration (workflows addSiteToMainWp) must name this exact user.
const STAGING_ADMIN_USER = "admin";

function toSlug(name: string, siteId: string): string {
  // All-CJK names produce an empty base → fall back to "site" so the slug isn't "-<id>".
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18) || "site";
  return `${base}-${siteId.replace(/-/g, "").slice(0, 6)}`;
}

function toDbName(siteId: string): string {
  return `wp_s_${siteId.replace(/-/g, "").slice(0, 22)}`;
}

function randomPass(): string {
  const bytes = Array.from(
    { length: 16 },
    () => Math.floor(Math.random() * 36).toString(36)
  ).join("");
  return `Stg${bytes}!`;
}

function connectSsh(opts: { host: string; port: number; username: string; privateKey: string }): Promise<SshClient> {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    conn.on("ready", () => resolve(conn));
    conn.on("error", reject);
    conn.connect(opts);
  });
}

function sshExec(conn: SshClient, cmd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (d: Buffer) => { stdout += d.toString(); });
      stream.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      stream.on("close", (code: number) => resolve({ code, stdout, stderr }));
    });
  });
}

// ── Content seeding (Stage C) ────────────────────────────────────────────────
// Turns the provisioned WP shell into a content-filled site using the AI website spec.
// Mechanism verified on the SG container 2026-06-27: the whole bash script is base64-encoded
// in Node, single-quoted on the host, and only decoded (`base64 -d`) inside the container's
// bash stdin — so CJK bytes never pass through the host login shell / SSH / locale layer and
// cannot mojibake. Every interpolated spec value is shq()-escaped (POSIX single-quote), which
// was confirmed injection-proof (a `'; echo PWNED;'` probe echoed as a literal, not executed).
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
function buildSeedScript(spec: WebsiteSpec, wpPath: string): string {
  const L: string[] = [];
  L.push(`set -e`);
  L.push(`wpcli() { php -d memory_limit=256M /usr/local/bin/wp --path=${shq(wpPath + "/")} "$@"; }`);
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
  return L.join("\n");
}

// Generate ONE AI hero image from the spec's visual direction and install it at the top of the
// homepage (+ set as featured). flux-schnell is fast (~5-8s) so this fits inside the seed call's
// budget. Best-effort + idempotent (aw_hero_done option) — a failure never fails seeding.
// `media_sideload_image` (core) does the import+insert in one PHP eval, so no bash/php var passing.
async function generateAndInstallHeroImage(conn: SshClient, wpPath: string, spec: WebsiteSpec): Promise<string> {
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
  const script = [
    `wpcli() { php -d memory_limit=256M /usr/local/bin/wp --path=${shq(wpPath + "/")} "$@"; }`,
    `if [ "$(wpcli option get aw_hero_done 2>/dev/null)" = "1" ]; then echo "AW_HERO_SKIP"; exit 0; fi`,
    `wpcli eval ${shq(heroPhp)}`,
    `wpcli option update aw_hero_done 1 >/dev/null`,
  ].join("\n");
  const b64 = Buffer.from(script, "utf8").toString("base64");
  const res = await sshExec(conn, `echo '${b64}' | base64 -d | docker exec -i -u www-data lobster-wordpress bash`);
  const out = `${res.stdout}${res.stderr}`;
  return out.includes("AW_HERO_OK") || out.includes("AW_HERO_SKIP")
    ? `hero image: ${out.match(/AW_HERO_(OK|SKIP)[^\n]*/)?.[0] ?? "ok"}`
    : `hero image WARN: ${out.replace(/\s+/g, " ").slice(0, 200)}`;
}

async function seedContentFromSpec(conn: SshClient, wpPath: string, websiteSpecId: string): Promise<string> {
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
  const script = buildSeedScript(spec, wpPath);
  const b64 = Buffer.from(script, "utf8").toString("base64");
  const res = await sshExec(conn, `echo '${b64}' | base64 -d | docker exec -i -u www-data lobster-wordpress bash`);
  const out = `${res.stdout}${res.stderr}`;
  if (res.code !== 0 || !(out.includes("AW_SEED_OK") || out.includes("AW_SEED_SKIP"))) {
    return `content seed WARN (code ${res.code}): ${out.replace(/\s+/g, " ").slice(0, 300)}`;
  }
  // Best-effort AI hero image (never fails the seed result).
  let heroNote = "hero image skipped";
  try {
    heroNote = await generateAndInstallHeroImage(conn, wpPath, spec);
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
  wpPath: string,
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
    const apRes = await sshExec(
      conn,
      `docker exec -u www-data lobster-wordpress bash -c "${WP_CLI} user application-password create admin 'AwareWave Content' --path=${wpPath}/ --porcelain 2>/dev/null"`,
    );
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
  const keyB64 = process.env.SG_SSH_PRIVATE_KEY_B64?.trim();
  const sshHost = process.env.SG_SSH_HOST?.trim() || "145.239.195.47";
  if (!keyB64) {
    return NextResponse.json({ error: "SG_SSH_PRIVATE_KEY_B64 not configured" }, { status: 503 });
  }
  let conn: SshClient | null = null;
  try {
    const privateKey = Buffer.from(keyB64, "base64").toString("utf8");
    conn = await connectSsh({ host: sshHost, port: 22, username: "root", privateKey });
    const seeded = await seedContentFromSpec(conn, wpPath, websiteSpecId);
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

  let body: { organizationId?: string; siteId?: string; siteName?: string; manifestSlug?: string; pluginSlugs?: string[]; websiteSpecId?: string; mode?: string; wpPath?: string };
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

  const keyB64 = process.env.SG_SSH_PRIVATE_KEY_B64?.trim();
  const sshHost = process.env.SG_SSH_HOST?.trim() || "145.239.195.47";
  const dbUser = process.env.WP_STAGING_DB_USER?.trim() || "wpuser";
  const dbPass = process.env.WP_STAGING_DB_PASS?.trim() || "";
  const dbRootPass = process.env.WP_STAGING_DB_ROOT_PASS?.trim() || "";

  if (!keyB64) {
    return NextResponse.json({ error: "SG_SSH_PRIVATE_KEY_B64 not configured" }, { status: 503 });
  }

  const slug = toSlug(siteName, siteId);
  const dbName = toDbName(siteId);
  const wpPath = `${WP_ROOT_BASE}/${slug}`;
  const stagingSiteUrl = `${STAGING_BASE_URL}/${slug}/`;
  const wpAdminUrl = `${stagingSiteUrl}wp-admin/`;
  const adminPass = randomPass();
  const environmentId = crypto.randomUUID();

  let conn: SshClient | null = null;
  try {
    const privateKey = Buffer.from(keyB64, "base64").toString("utf8");
    conn = await connectSsh({ host: sshHost, port: 22, username: "root", privateKey });

    // 1. Create staging directory with correct owner
    const mkdirResult = await sshExec(
      conn,
      `docker exec lobster-wordpress bash -c "mkdir -p ${wpPath} && chown www-data:www-data ${wpPath}"`
    );
    if (mkdirResult.code !== 0) {
      throw new Error(`mkdir failed: ${mkdirResult.stderr}`);
    }

    // 2. Create MySQL database (dbName is alphanumeric-safe, no quoting needed)
    const createDbSql = dbRootPass
      ? `CREATE DATABASE IF NOT EXISTS ${dbName}; GRANT ALL PRIVILEGES ON ${dbName}.* TO '${dbUser}'@'%'; FLUSH PRIVILEGES;`
      : `CREATE DATABASE IF NOT EXISTS ${dbName};`;
    const createDbUser = dbRootPass ? "root" : dbUser;
    const createDbPass = dbRootPass || dbPass;
    const createDbCmd = `docker exec lobster-wordpress-db mariadb -u ${createDbUser} -p'${createDbPass}' -e "${createDbSql}"`;
    await sshExec(conn, createDbCmd);

    // 3. Download WordPress core
    const dlResult = await sshExec(
      conn,
      `docker exec -u www-data lobster-wordpress bash -c "${WP_CLI} core download --path=${wpPath}/ --quiet 2>&1"`
    );
    if (dlResult.code !== 0 && !dlResult.stdout.includes("WordPress files seem to already be present")) {
      throw new Error(`wp core download failed: ${dlResult.stdout} ${dlResult.stderr}`);
    }

    // 4. Create wp-config.php
    const configResult = await sshExec(
      conn,
      `docker exec -u www-data lobster-wordpress bash -c "${WP_CLI} config create --dbname=${dbName} --dbuser=${dbUser} --dbpass='${dbPass}' --dbhost=lobster-wordpress-db --path=${wpPath}/ --quiet 2>&1"`
    );
    if (configResult.code !== 0 && !configResult.stdout.includes("already exists")) {
      throw new Error(`wp config create failed: ${configResult.stdout} ${configResult.stderr}`);
    }

    // 5. Install WordPress
    const installResult = await sshExec(
      conn,
      `docker exec -u www-data lobster-wordpress bash -c "${WP_CLI} core install --url='${stagingSiteUrl}' --title='${siteName.replace(/'/g, "")} Staging' --admin_user=${STAGING_ADMIN_USER} --admin_password='${adminPass}' --admin_email=${STAGING_ADMIN_EMAIL} --path=${wpPath}/ --skip-email --quiet 2>&1"`
    );
    if (installResult.code !== 0 && !installResult.stdout.includes("already installed")) {
      throw new Error(`wp core install failed: ${installResult.stdout} ${installResult.stderr}`);
    }

    // 6. Install base theme — skip for wp-tourism (apply-manifest installs TravelWP via localZip step)
    let themeOk = true;
    if (manifestSlug !== "wp-tourism") {
      const themeResult = await sshExec(
        conn,
        `docker exec -u www-data lobster-wordpress bash -c "${WP_CLI} theme install kadence kadence-child-theme-two --activate --path=${wpPath}/ --quiet 2>&1 || ${WP_CLI} theme install kadence --activate --path=${wpPath}/ --quiet 2>&1"`
      );
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

    const allPlugins = [...new Set([
      ...basePlugins,
      ...ecommercePlugins,
      ...crmPlugins,
      ...formPlugins,
      ...pluginSlugs.filter((s) => s && s.length > 2),
    ])];

    const pluginList = allPlugins.join(" ");
    const pluginResult = await sshExec(
      conn,
      `docker exec -u www-data lobster-wordpress bash -c "${WP_CLI} plugin install ${pluginList} --activate --path=${wpPath}/ --quiet 2>&1"`
    );
    const pluginsOk = pluginResult.code === 0;

    // Wire this client into the content toolchain (app-password + wp_sites + site_url) so SEO
    // Content / Video can target it. Synchronous (~2s) and best-effort — never fails the provision.
    const wiringNote = await wireClientToContentTools(conn, wpPath, organizationId, siteName, stagingSiteUrl);

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
        `DB: ${dbName} on lobster-wordpress-db`,
        `Admin: ${STAGING_ADMIN_USER} / ${adminPass}`,
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
