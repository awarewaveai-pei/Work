// next-admin dev server that cannot reach any Supabase: the UI test (social-manager.spec.ts) answers every /api/social
// call itself, and nothing here may touch production data (memory: never test against a production container).
// The Supabase variables are set to "" IN THIS PROCESS, then the Next CLI runs in it: Next keeps an existing empty
// value over .env.local (@next/env), and an empty value cannot travel through a shell on Windows (cmd and WSL drop
// it), which is why this is a script and not an env prefix. With auth unconfigured, middleware lets a dev server
// through (middleware.ts isSupabaseAuthConfigured / isDevelopment).
// Usage (from the repo root): node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs [port]  (no port: $PORT, then 3902)
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "../../../apps/next-admin");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "POSTIZ_API_BASE_URL", "POSTIZ_API_KEY"]) process.env[k] = "";
process.chdir(app);
process.argv = [process.argv[0], "next", "dev", "-p", process.argv[2] ?? process.env.PORT ?? "3902"];
createRequire(path.join(app, "package.json"))("next/dist/bin/next");
