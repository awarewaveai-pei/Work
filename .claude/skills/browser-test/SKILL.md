---
name: browser-test
description: Live browser testing via Chrome MCP (Claude-in-Chrome extension). Drives the user's real logged-in Chrome session — no headless, no credentials needed. Use for e2e verification of authenticated features, Canvas/Fabric.js tools, React app state, API calls. Trigger on "幫我測", "瀏覽器測試", "browser test", "Chrome 測一下", "live test", "測一下 XXX 頁面", "幫我跑一下 e2e".
---

# Browser Test (Chrome MCP)

Uses **Claude-in-Chrome** (`mcp__claude-in-chrome__*`) to drive the user's real Chrome browser.
Not headless — uses the already-logged-in session. Complementary to `/playwright` (which is headless + scripted).

The server id is `claude-in-chrome` — lowercase, hyphens. `mcp__Claude_in_Chrome__*` is not a tool name; every call under it fails.

**Load the tools before the first call.** They are deferred: only their names are in context, not their schemas, so calling one unloaded fails with `InputValidationError`. Load the whole set in ONE `ToolSearch` call — one round-trip, not one per tool:

```
ToolSearch  query="select:mcp__claude-in-chrome__list_connected_browsers,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_network_requests,mcp__claude-in-chrome__read_console_messages"
```

In a Codex session the same source applies — use Codex's own browser tooling for the equivalent steps. The flow and the evidence format below do not change.

---

## Pre-flight

```
mcp__claude-in-chrome__list_connected_browsers
```

- If result is empty → ask user to open Chrome and enable the Claude-in-Chrome extension
- If result has a browser → proceed with that `browser_id`

---

## Standard test flow

### 1. Navigate

```
mcp__claude-in-chrome__navigate  url=<target>
```

Wait for `read_page` to show the page content before proceeding.

### 2. Read page structure

```
mcp__claude-in-chrome__read_page
```

Use this to find elements by role, text, or aria-label before clicking.
Prefer `find` over pixel-clicking — it returns `ref_id` for precise interaction.

```
mcp__claude-in-chrome__find  query="<button text or label>"
```

### 3. Interact

```
mcp__claude-in-chrome__form_input  ref=<ref_id>  value=<text>
mcp__claude-in-chrome__javascript_tool  action=javascript_exec  text="<js>"
mcp__claude-in-chrome__computer  action=left_click  ref=<ref_id>
```

Click order of preference:
1. `form_input` for inputs
2. `find` → get ref → `computer` with `action=left_click` and that `ref` (most reliable for React apps)
3. `javascript_tool` to trigger via JS if click doesn't fire React handlers

### 4. Verify via JS (preferred over screenshots for logic checks)

```javascript
// Check React state or DOM
document.querySelector('[data-testid="X"]')?.textContent

// Check Fabric.js canvas (canvas editor pages)
window.__fc?.getObjects()?.map(o => ({type: o.type, text: o.text}))

// Check network activity
performance.getEntriesByType('resource').filter(r => r.duration === 0)  // still loading
```

**Fabric.js canvas access** (if no `window.__fc`):

```javascript
const canvas = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas');
let fib = canvas.__reactFiber$;
// Find key starting with __reactFiber$
const key = Object.keys(canvas).find(k => k.startsWith('__reactFiber$'));
fib = canvas[key];
// Walk fiber tree to find Fabric canvas instance
let f = fib;
for (let i = 0; i < 6; i++) { f = f?.return; }
const fc = f?.memoizedState?.next?.memoizedState?.current;
window.__fc = fc;  // cache globally
fc?.getObjects()
```

### 5. Check network requests

```
mcp__claude-in-chrome__read_network_requests
```

Verify: correct API endpoints called, correct HTTP method, status 200/201.

### 6. Screenshot for evidence

There is no `screenshot` tool. A screenshot is an action on `computer`:

```
mcp__claude-in-chrome__computer  action=screenshot
```

Take after key state changes (after form submit, after generation, after upload).

---

## app.aware-wave.com specifics

| Page | URL | Key things to verify |
|------|-----|----------------------|
| Canvas Editor | `/tools/canvas` | Fabric.js loads, `+ 文字` adds 1 object (not 2), export works |
| Mockup Studio | `/tools/mockup` | Design selected, "合成 Mockup" fires POST `/api/tools/studio/generate` → 200, result image appears |
| My Designs | `/tools/designs` | Designs list loads, click opens editor |
| Onboarding | `/onboarding` | Steps flow, no stuck states |

Known issue (2026-06-16): `+ 文字` on Canvas Editor creates 2 overlapping i-text objects. Workaround: `fc.remove(fc.getObjects()[1])`.

---

## Report format

After testing, output:

```
## Browser Test — <page> — <date>

**Result**: PASS / FAIL / PARTIAL

| Flow | Result | Evidence |
|------|--------|----------|
| Page loads | ✅ | screenshot: no console errors |
| [action] | ✅/❌ | JS: fc.getObjects() returned N objects |
| API call | ✅ | POST /api/... → 200 |

**Bugs found**:
- [bug description] — file:line if known

**REALTEST_EVIDENCE**: tool=mcp__claude-in-chrome | cmd=navigate+JS+screenshot | exit=0 | ms=<N>
```

---

## Tips

- **React 18 event delegation**: native `.click()` sometimes doesn't fire React handlers. Use `find` + `computer left_click` with ref instead.
- **Long JS execution blocks screenshots**: if page JS is heavy (large chunk parsing), `javascript_tool` still works but `screenshot` may timeout. Wait ~30s and retry.
- **Chrome MCP health**: after heavy `toDataURL()` or complex JS, the extension may need ~10s cooldown. Retry `list_connected_browsers` until healthy.
- **Auth**: Chrome MCP uses the already-logged-in session — no credentials needed. The user must be logged in before testing.
- **Don't use `sleep`**: use polling (retry `list_connected_browsers` or `read_page`) instead of Bash sleep commands.
