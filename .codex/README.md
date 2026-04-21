# Codex MCP (local)

- **Tracked in git**: `config.toml.example` only.
- **Not tracked**: `config.toml` (see repo root `.gitignore`). Copy the example and adjust paths / `project_ref` / enabled flags.
- **Secrets**: use environment variables and `scripts/secrets-vault.ps1`; do not paste JWTs or DB passwords into files that may be shared.
