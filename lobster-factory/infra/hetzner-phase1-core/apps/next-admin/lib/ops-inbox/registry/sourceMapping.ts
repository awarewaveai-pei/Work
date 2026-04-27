import type { KnownService } from "./services";

export function sentryProjectSlugToService(slug: string | undefined): KnownService | null {
  if (!slug) return null;
  const map: Record<string, KnownService> = {
    "javascript-nextjs": "javascript-nextjs",
    "node-api": "node-api",
    php: "php",
    n8n: "n8n",
    supabase: "supabase",
    "trigger-workflows": "trigger-workflows",
  };
  return map[slug] ?? null;
}

export function kumaHostnameToService(hostname: string | undefined): KnownService | null {
  if (!hostname) return null;
  const h = hostname.toLowerCase().replace(/^https?:\/\//, "").split(/[/:?]/)[0];
  const map: Record<string, KnownService> = {
    "aware-wave.com": "php",
    "www.aware-wave.com": "php",
    "app.aware-wave.com": "javascript-nextjs",
    "api.aware-wave.com": "node-api",
    "n8n.aware-wave.com": "n8n",
    "studio.aware-wave.com": "supabase",
    "supabase.aware-wave.com": "supabase",
    "trigger.aware-wave.com": "trigger-workflows",
    "uptime.aware-wave.com": "javascript-nextjs",
  };
  return map[h] ?? null;
}

/** Fallback: extract service from monitor name when hostname doesn't match. */
export function kumaMonitorNameToService(name: string | undefined): KnownService | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("node-api") || n.includes("api health")) return "node-api";
  if (n.includes("next admin") || n.includes("app.aware-wave")) return "javascript-nextjs";
  if (n.includes("wordpress") || n.includes("aware-wave.com (")) return "php";
  if (n.includes("n8n")) return "n8n";
  if (n.includes("supabase")) return "supabase";
  if (n.includes("trigger")) return "trigger-workflows";
  return null;
}

export function netdataHostToTag(host: string | undefined): { host: "sg" | "eu" | null } {
  if (!host) return { host: null };
  const v = host.toLowerCase();
  if (v.includes("sin") || v.includes("wordpress-ubuntu")) return { host: "sg" };
  if (v.includes("hel") || v.includes("awarewave-eu")) return { host: "eu" };
  return { host: null };
}
