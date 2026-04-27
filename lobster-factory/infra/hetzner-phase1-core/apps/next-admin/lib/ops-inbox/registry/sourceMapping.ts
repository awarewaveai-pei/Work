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
  const map: Record<string, KnownService> = {
    "aware-wave.com": "php",
    "app.aware-wave.com": "javascript-nextjs",
    "api.aware-wave.com": "node-api",
    "n8n.aware-wave.com": "n8n",
    "studio.aware-wave.com": "supabase",
    "trigger.aware-wave.com": "trigger-workflows",
  };
  return map[hostname.toLowerCase()] ?? null;
}

export function netdataHostToTag(host: string | undefined): { host: "sg" | "eu" | null } {
  if (!host) return { host: null };
  const v = host.toLowerCase();
  if (v.includes("sin") || v.includes("wordpress-ubuntu")) return { host: "sg" };
  if (v.includes("hel") || v.includes("awarewave-eu")) return { host: "eu" };
  return { host: null };
}
