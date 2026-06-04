---
name: feedback_never_ask_for_credentials
description: Never ask user for API keys or credentials — always read user-env.ps1 first
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ac7d845c-d72c-46c1-9698-715335da8257
---

Never ask the user for an API key, token, password, or any credential.

**Why:** User has provided credentials many times and is frustrated by repeated requests. All credentials are in `mcp/user-env.ps1` on both machines.

**How to apply:** Before any task that needs a credential, read `C:\Users\USER\Work\mcp\user-env.ps1` (公司桌機) or `D:\Users\USER1115\Work\mcp\user-env.ps1` (筆電). If a key is empty in that file, say "this key is empty in user-env.ps1 — where should I get it?" instead of asking generically.

See [[reference_aware_wave_credentials]] for the full key inventory.
