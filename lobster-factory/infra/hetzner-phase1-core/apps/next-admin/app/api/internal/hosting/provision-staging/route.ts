/**
 * POST /api/internal/hosting/provision-staging
 *
 * HTTP_JSON hosting adapter bridge — called by Trigger.dev create-wp-site task.
 * Creates a WordPress subdirectory staging install on the SG VPS via SSH.
 *
 * Auth: Authorization: Bearer {LOBSTER_HOSTING_API_TOKEN}
 * Input: { organizationId, siteId, siteName }
 * Output: { environmentId, wpRootPath, stagingSiteUrl, wpAdminUrl }
 */

import { NextResponse } from "next/server";
import { Client as SshClient } from "ssh2";
import { timingSafeEqual } from "../../../../../lib/ops-inbox/verifyIngestToken";
import { getSupabaseWriteClient } from "../../../../../lib/supabase-server";
import type { WebsiteSpec } from "../../../../../lib/onboarding/intake-form";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STAGING_BASE_URL = "https://aware-wave.com/staging";
const WP_ROOT_BASE = "/var/www/html/staging";
const WP_CLI = "php -d memory_limit=256M /usr/local/bin/wp";
const STAGING_ADMIN_EMAIL = "staging@aware-wave.com";

function toSlug(name: string, siteId: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18);
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
  L.push(`wpcli option update aw_seed_done 1 >/dev/null`);
  L.push(`echo "AW_SEED_OK home=$HOME_ID pages=${pages.length}"`);
  return L.join("\n");
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
  return `content seeded: ${out.match(/AW_SEED_(OK|SKIP)[^\n]*/)?.[0] ?? "ok"}`;
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
  const sshHost = process.env.SG_SSH_HOST?.trim() || "5.223.93.113";
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
  const sshHost = process.env.SG_SSH_HOST?.trim() || "5.223.93.113";
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
      `docker exec -u www-data lobster-wordpress bash -c "${WP_CLI} core install --url='${stagingSiteUrl}' --title='${siteName.replace(/'/g, "")} Staging' --admin_user=admin --admin_password='${adminPass}' --admin_email=${STAGING_ADMIN_EMAIL} --path=${wpPath}/ --skip-email --quiet 2>&1"`
    );
    if (installResult.code !== 0 && !installResult.stdout.includes("already installed")) {
      throw new Error(`wp core install failed: ${installResult.stdout} ${installResult.stderr}`);
    }

    // 6. Install Kadence theme
    const themeResult = await sshExec(
      conn,
      `docker exec -u www-data lobster-wordpress bash -c "${WP_CLI} theme install kadence kadence-child-theme-two --activate --path=${wpPath}/ --quiet 2>&1 || ${WP_CLI} theme install kadence --activate --path=${wpPath}/ --quiet 2>&1"`
    );
    const themeOk = themeResult.code === 0 || themeResult.stdout.includes("already installed");

    // 7. Always install Kadence Blocks + base plugins; add manifest-specific slugs
    const basePlugins = ["kadence-blocks", "seo-by-rank-math", "fluent-smtp", "litespeed-cache"];
    const ecommercePlugins = manifestSlug === "wc-core" || manifestSlug === "wc-custom"
      ? ["woocommerce", "woo-gutenberg-products-block"]
      : [];
    const crmPlugins = pluginSlugs.includes("fluentcrm") ? ["fluentcrm"] : [];
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
      provisioningNotes: [
        ...(!themeOk ? ["WARN: Kadence theme install had issues"] : []),
        ...(!pluginsOk ? ["WARN: some plugins may not have installed"] : [`Plugins installed: ${allPlugins.join(", ")}`]),
        `staging/${slug}/ — subdirectory install on aware-wave.com`,
        `DB: ${dbName} on lobster-wordpress-db`,
        `Admin: admin / ${adminPass}`,
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
