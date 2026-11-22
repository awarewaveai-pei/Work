// Host gate client for site-flow steps (SITE-FLOW-COMPLETION-PLAN.md §1-3, card SF-G). next-admin holds no host
// shell (I3): every host action is one line to the SSH forced command scripts/aw-hosting-gate.sh.
//
// Output contract the gate's site-* verbs follow (card SF-E implements them): exit 0 = done, 126 = verb not
// allowed or the host switch AW_SITE_VERBS is off, anything else = failed; stdout's last non-empty line is one JSON
// object. site-create answers {"job":"sj-..."}; site-job answers {"state":"running"|"succeeded"|"failed","detail":"..."}.
//
// Provider adapter: ks-aw-01-docker speaks site-* verbs; ks-aw-01-staging-subdir maps the few wp sub-verbs that
// have a staging meaning onto the existing `staging-wp <slug>` (fixed scripts built here; no caller text reaches
// the script). Container steps (preflight/create/vhost/job) do not exist for a staging subdirectory site.
//
// Traps: the gate's grammar is the authority; the checks here only refuse obviously bad input before it costs an
// SSH round trip. Never put a secret on the command line (it lands in the host's auth log) -- stdin only.

import { connectSsh, readSshTargetFromEnv, sshExec, type SshExecResult } from "@/lib/repair-center/ssh";
import type { Client as SshClient } from "ssh2";

export const SITE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/; // = aw-hosting-gate.sh SLUG_RE
export const SITE_DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const SITE_JOB_RE = /^sj-[0-9]{14}-[0-9a-f]{8}$/;
const WP_ARG_RE = /^[A-Za-z0-9._:/@+=][A-Za-z0-9._:/@+=-]{0,511}$/; // never starts with "-" (no option smuggling)
const PLUGIN_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/; // = provision-staging PLUGIN_SLUG_RE
const MAINWP_ID_RE = /^[0-9a-f]{32,128}$/; // = provision-staging prepareMainWpChild
const STAGING_ROOT = "/var/www/html/staging"; // = aw-hosting-gate.sh ROOT
const STAGING_ADMIN_USER = "admin"; // = provision-staging STAGING_ADMIN_USER
const GATE_TIMEOUT_MS = 90_000; // under Cloudflare's ~100 s; anything longer is a background job

export const WP_SUBVERBS = ["install", "plugins", "open", "close", "set-mainwp-id", "put-bridge-pubkey", "reset-admin-password"] as const;
export type WpSubverb = (typeof WP_SUBVERBS)[number];

export interface GateTransport {
  exec(command: string, stdin?: string): Promise<SshExecResult>;
}

export type GateError = "invalid_argument" | "unsupported_on_provider" | "not_allowed" | "failed" | "bad_output" | "transport";
export type GateCall<T> = { ok: true; data: T } | { ok: false; error: GateError; detail: string };

export type HostJobState = "running" | "succeeded" | "failed";
export interface HostJobStatus {
  state: HostJobState;
  detail: string;
}

export interface SiteGateClient {
  readonly provider: string;
  preflight(): Promise<GateCall<Record<string, unknown>>>;
  /** Starts the background container job; returns its id. */
  create(): Promise<GateCall<{ jobId: string }>>;
  vhost(): Promise<GateCall<Record<string, unknown>>>;
  wp(sub: WpSubverb, args?: string[], stdin?: string): Promise<GateCall<Record<string, unknown>>>;
  job(jobId: string): Promise<GateCall<HostJobStatus>>;
}

export interface GateTarget {
  provider: string;
  slug: string | null;
  domain: string | null;
}

type EnvLike = { hosting_provider: string | null; base_url: string | null; wp_root_path: string | null; metadata: Record<string, unknown> };

/**
 * Host identity of an environment. Docker sites: slug = environments.metadata.host_slug (written by the step that
 * creates the row), domain = base_url's host. Staging subdirectory: slug from wp_root_path, as provision-staging does.
 */
export function gateTargetOf(env: EnvLike): GateTarget {
  const provider = env.hosting_provider ?? "";
  let domain: string | null = null;
  try {
    domain = env.base_url ? new URL(env.base_url).hostname.toLowerCase() : null;
  } catch {
    domain = null;
  }
  if (domain && (domain.length > 253 || !SITE_DOMAIN_RE.test(domain))) domain = null;
  let slug: string | null = null;
  if (provider === "ks-aw-01-staging-subdir") {
    const p = (env.wp_root_path ?? "").replace(/\/+$/, "");
    const s = p.startsWith(`${STAGING_ROOT}/`) ? p.slice(STAGING_ROOT.length + 1) : "";
    slug = SITE_SLUG_RE.test(s) ? s : null;
  } else {
    const s = env.metadata?.host_slug;
    slug = typeof s === "string" && SITE_SLUG_RE.test(s) ? s : null;
  }
  return { provider, slug, domain };
}

const fail = <T>(error: GateError, detail: string): GateCall<T> => ({ ok: false, error, detail });

function lastJson(stdout: string): Record<string, unknown> | null {
  const line = stdout.split("\n").map((l) => l.trim()).filter(Boolean).pop();
  if (!line) return null;
  try {
    const v = JSON.parse(line);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function run(transport: GateTransport, command: string, stdin?: string): Promise<GateCall<Record<string, unknown>>> {
  let res: SshExecResult;
  try {
    res = await transport.exec(command, stdin);
  } catch (e) {
    return fail("transport", e instanceof Error ? e.message : String(e));
  }
  const tail = (res.stderr || res.stdout).trim().slice(-400);
  if (res.code === 126) return fail("not_allowed", tail || "gate refused the command (verb not allowed or AW_SITE_VERBS off)");
  if (res.code !== 0) return fail("failed", `exit ${res.code}: ${tail}`);
  const data = lastJson(res.stdout);
  return data ? { ok: true, data } : fail("bad_output", "gate printed no JSON object on its last line");
}

/**
 * Fixed staging-wp scripts for the sub-verbs that mean something on a staging subdirectory site. `set -euo pipefail`
 * is required: the gate runs the script with plain `bash` (aw-hosting-gate.sh run_wp), so without it a failed wp
 * command followed by the closing echo would exit 0 and read as success.
 */
function stagingScript(slug: string, sub: WpSubverb, args: string[]): string[] | string {
  const head = ["set -euo pipefail", `wpcli() { php -d memory_limit=256M /usr/local/bin/wp --path='${STAGING_ROOT}/${slug}/' "$@"; }`];
  switch (sub) {
    case "set-mainwp-id":
      if (args.length !== 1 || !MAINWP_ID_RE.test(args[0])) return "set-mainwp-id needs one hex id";
      return [
        ...head,
        `wpcli option update mainwp_child_uniqueId ${args[0]} --quiet >/dev/null`,
        `wpcli user meta update ${STAGING_ADMIN_USER} mainwp_child_user_enable_passwd_auth_connect 0 --quiet >/dev/null`,
        `echo '{"ok":true}'`,
      ];
    case "plugins":
      if (args.length === 0 || !args.every((a) => PLUGIN_SLUG_RE.test(a))) return "plugins needs WordPress.org plugin slugs";
      return [...head, `wpcli plugin install ${args.join(" ")} --activate --quiet >/dev/null`, `echo '{"ok":true}'`];
    default:
      return `wp ${sub} has no staging-subdir mapping`;
  }
}

export function createSiteGateClient(target: GateTarget, transport: GateTransport): SiteGateClient {
  const { provider, slug, domain } = target;
  const docker = provider === "ks-aw-01-docker";
  const staging = provider === "ks-aw-01-staging-subdir";
  const needSlug = <T>(): GateCall<T> | null => (slug ? null : fail("invalid_argument", "environment has no valid host slug"));
  const dockerOnly = <T>(verb: string): GateCall<T> | null =>
    docker ? needSlug<T>() : fail("unsupported_on_provider", `${verb} is not available for hosting_provider ${provider || "(none)"}`);

  return {
    provider,
    async preflight() {
      const bad = dockerOnly<Record<string, unknown>>("site-preflight");
      if (bad) return bad;
      if (!domain) return fail("invalid_argument", "environment base_url has no valid domain");
      return run(transport, `site-preflight ${slug} ${domain}`);
    },
    async create() {
      const bad = dockerOnly<{ jobId: string }>("site-create");
      if (bad) return bad;
      if (!domain) return fail("invalid_argument", "environment base_url has no valid domain");
      const r = await run(transport, `site-create ${slug} ${domain}`);
      if ("error" in r) return fail(r.error, r.detail);
      const job = r.data.job;
      return typeof job === "string" && SITE_JOB_RE.test(job) ? { ok: true, data: { jobId: job } } : fail("bad_output", "site-create returned no job id");
    },
    async vhost() {
      const bad = dockerOnly<Record<string, unknown>>("site-vhost");
      if (bad) return bad;
      return run(transport, `site-vhost ${slug}`);
    },
    async wp(sub, args = [], stdin) {
      if (!(WP_SUBVERBS as readonly string[]).includes(sub)) return fail("invalid_argument", `unknown wp sub-verb ${String(sub)}`);
      const noSlug = needSlug<Record<string, unknown>>();
      if (noSlug) return noSlug;
      if (!args.every((a) => WP_ARG_RE.test(a))) return fail("invalid_argument", "wp argument outside the allowed characters");
      if (docker) return run(transport, ["site-wp", slug, sub, ...args].join(" "), stdin);
      if (staging) {
        if (stdin !== undefined) return fail("unsupported_on_provider", "staging-subdir sub-verbs take no stdin");
        const script = stagingScript(slug as string, sub, args);
        if (typeof script === "string") return fail("unsupported_on_provider", script);
        return run(transport, `staging-wp ${slug}`, script.join("\n") + "\n");
      }
      return fail("unsupported_on_provider", `wp is not available for hosting_provider ${provider || "(none)"}`);
    },
    async job(jobId) {
      const bad = dockerOnly<HostJobStatus>("site-job");
      if (bad) return bad;
      if (!SITE_JOB_RE.test(jobId)) return fail("invalid_argument", "malformed job id");
      const r = await run(transport, `site-job ${jobId}`);
      if ("error" in r) return fail(r.error, r.detail);
      const state = r.data.state;
      if (state !== "running" && state !== "succeeded" && state !== "failed") return fail("bad_output", "site-job returned no known state");
      return { ok: true, data: { state, detail: typeof r.data.detail === "string" ? r.data.detail.slice(0, 400) : "" } };
    },
  };
}

/** The production transport: the HOSTING_BRIDGE_SSH_* key (host key pinned), one connection per call. Null = not configured. */
export function sshGateTransport(): GateTransport | null {
  const target = readSshTargetFromEnv("HOSTING_BRIDGE", { explicit: true });
  if (!target) return null;
  return {
    async exec(command, stdin) {
      let conn: SshClient | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            conn = await connectSsh(target);
            return sshExec(conn, command, stdin);
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`gate_timeout_${GATE_TIMEOUT_MS}ms`)), GATE_TIMEOUT_MS);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        try {
          (conn as SshClient | null)?.end();
        } catch {
          /* already closed */
        }
      }
    },
  };
}

/** A transport for an unconfigured bridge: every call fails as a transport error (reads show "unknown", never done). */
export const unconfiguredTransport: GateTransport = {
  exec: async () => {
    throw new Error("hosting bridge SSH not configured (HOSTING_BRIDGE_SSH_*)");
  },
};
