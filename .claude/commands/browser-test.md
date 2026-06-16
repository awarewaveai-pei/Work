Live browser testing via Chrome MCP (Claude-in-Chrome extension).

## Usage

```
/browser-test                        → test app.aware-wave.com (default smoke)
/browser-test <path>                 → test a specific path, e.g. /tools/canvas
/browser-test <full-url>             → test any URL
```

## What this does

Drives the user's real logged-in Chrome browser — no headless, no credentials needed.
Read the full methodology in `.claude/skills/browser-test/SKILL.md`.

## Steps

1. Call `mcp__Claude_in_Chrome__list_connected_browsers`
   → If empty: ask user to open Chrome and enable the Claude-in-Chrome extension

2. Navigate to target URL

3. Read page, find elements, interact via Chrome MCP tools

4. Verify via `javascript_tool` (React state, Fabric.js canvas, DOM)

5. Check `read_network_requests` for correct API calls

6. Screenshot for evidence

7. Report: flow results table + any bugs found + REALTEST_EVIDENCE line

## Default target

`https://app.aware-wave.com` — already logged in via user's Chrome session.
