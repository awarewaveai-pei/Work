---
name: VPS Access Credentials
description: Hetzner SG/EU VPS SSH access — KEY-ONLY, password login disabled
type: reference
originSessionId: 4845860f-ee69-4e0f-a113-95f6686c9b87
---
## SG (Phase1 main services) — `5.223.93.113`

- **Auth**: SSH key only — **password login is disabled** on this server (verified 2026-05-08; old memory claiming `UcxTUVkPdkfP` etc. works was wrong/outdated)
- **Username**: `root`
- **Private key path (Windows)**: `C:\Users\user1115\.ssh\hetzner_trigger`
- **SSH command**:
  ```
  ssh -i "C:\Users\user1115\.ssh\hetzner_trigger" root@5.223.93.113
  ```
- **MCP `hetzner-ssh`**: pass `privateKeyPath: "C:\\Users\\user1115\\.ssh\\hetzner_trigger"` to `ssh_connect`
- **Services on this host**: WordPress, Node.js API, Next.js Admin, Nginx, Redis, n8n (or EU-only depending on profile), Uptime Kuma, Trigger.dev — see `agency-os/docs/operations/SG_PHASE1_DOCKER_LAYOUT.md`
- **Deploy**: run `/root/lobster-phase1/scripts/sg-deploy.sh <app>` (sync git → staging → build → up). Owner doc: `DEPLOY_ROLLBACK_RUNBOOK.md` §2.1.

## EU (Supabase only) — `204.168.175.41`

- Same private key (`hetzner_trigger`) works for EU.
- Services: Supabase Kong + Studio + Postgres.

## Hetzner Cloud Console (web)

- URL: https://console.hetzner.com
- Email: `awarewaveai@gmail.com`
- Password: see `C:\Users\user1115\Desktop\AWARE_WAVE_CREDENTIALS.md` §1 (do not paste here)

## Why password attempts fail

If SSH returns `All configured authentication methods failed` and you've tried passwords from old memory, **stop trying** — it's not fail2ban, it's that password auth was disabled. Switch to the key-based command above.
