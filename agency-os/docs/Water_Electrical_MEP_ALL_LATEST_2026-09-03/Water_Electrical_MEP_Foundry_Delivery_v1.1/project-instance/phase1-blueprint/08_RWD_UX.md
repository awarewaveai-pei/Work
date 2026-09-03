# RWD + Bounded Offline Web Experience

## Authoritative decision
One responsive web application only.

## Supported presentations
- Desktop/laptop browsers: full planning/administration experience.
- Tablet browsers: responsive administration/field use.
- Mobile browsers: field-focused responsive presentation of the same application.

## Explicit exclusions
- No native iOS application.
- No native Android application.
- No separate mobile codebase.
- No installable-PWA requirement.
- No web-app manifest/install-to-home-screen product requirement.

## Offline implementation boundary
Offline web is required but bounded. Architecture may use Service Worker, Cache Storage and IndexedDB; these are implementation primitives, not a separate mobile/PWA product.

### Phase 1 offline reads
At minimum cache previously synchronized:
- current/next dispatch;
- project/site summary;
- jobsite address/contact/navigation information needed in the field.

### Phase 1 offline writes
Only explicitly allow-listed safe operations may queue offline. Initial allow-list: dispatch acknowledgement. Planning changes, permission changes and other high-impact actions remain online-only unless a later evidence-backed ADR expands the allow-list.

### Synchronization rules
- queued action has stable idempotency key;
- re-authorize and check target version on server;
- stale acknowledgement becomes CONFLICT/REJECTED, never silently applied;
- synchronize company-system truth first, then deliver LINE/Google side effects;
- conflict/rejection is visible to user and operator;
- sensitive cached data is user-bound, minimized and protected at rest using the best browser/platform mechanism available for the selected stack.

## Responsive interaction rules
Desktop dispatch may use drag-and-drop. Narrow viewports use tap/select/assign. Both call the same application command and authorization policy. No hover-only critical action.
