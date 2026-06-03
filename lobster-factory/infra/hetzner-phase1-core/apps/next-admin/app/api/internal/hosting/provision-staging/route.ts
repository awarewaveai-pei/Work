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

  let body: { organizationId?: string; siteId?: string; siteName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { organizationId, siteId, siteName } = body;
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

    return NextResponse.json({
      environmentId,
      wpRootPath: wpPath,
      stagingSiteUrl,
      wpAdminUrl,
      provisioningNotes: [
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
