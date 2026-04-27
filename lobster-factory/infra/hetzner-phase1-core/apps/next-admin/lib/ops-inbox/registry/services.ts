export type ServiceTarget =
  | { type: "local-repo"; repo_path: string; public_url?: string; host: "sg" | "eu" }
  | { type: "remote-ui-n8n"; ui_url: string; ssh_path: string; host: "eu" }
  | { type: "remote-ui-supabase"; ui_url: string; ssh_path: string; host: "eu" };

export const SERVICE_REGISTRY = {
  "javascript-nextjs": {
    type: "local-repo",
    repo_path: "lobster-factory/infra/hetzner-phase1-core/apps/next-admin",
    public_url: "https://app.aware-wave.com",
    host: "sg",
  },
  "node-api": {
    type: "local-repo",
    repo_path: "lobster-factory/infra/hetzner-phase1-core/apps/node-api",
    public_url: "https://api.aware-wave.com",
    host: "sg",
  },
  php: {
    type: "local-repo",
    repo_path: "lobster-factory/infra/hetzner-phase1-core/apps/wordpress",
    public_url: "https://aware-wave.com",
    host: "sg",
  },
  "trigger-workflows": {
    type: "local-repo",
    repo_path: "lobster-factory/packages/workflows",
    public_url: "https://trigger.aware-wave.com",
    host: "eu",
  },
  n8n: {
    type: "remote-ui-n8n",
    ui_url: "https://n8n.aware-wave.com/home/workflows",
    ssh_path: "/root/n8n/",
    host: "eu",
  },
  supabase: {
    type: "remote-ui-supabase",
    ui_url: "https://studio.aware-wave.com",
    ssh_path: "/root/supabase/docker/",
    host: "eu",
  },
} as const satisfies Record<string, ServiceTarget>;

export type KnownService = keyof typeof SERVICE_REGISTRY;

export const KNOWN_SERVICES = Object.keys(SERVICE_REGISTRY) as KnownService[];

export function getService(key: string | null): ServiceTarget | null {
  if (!key) return null;
  return (SERVICE_REGISTRY as Record<string, ServiceTarget>)[key] ?? null;
}
