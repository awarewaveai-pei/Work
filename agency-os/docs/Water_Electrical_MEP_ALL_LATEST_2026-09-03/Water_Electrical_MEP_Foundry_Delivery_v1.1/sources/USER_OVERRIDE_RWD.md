# User Override — RWD Web + Bounded Offline

Status: **AUTHORITATIVE USER OVERRIDE**
Date: 2026-09-03

The current project SHALL use one responsive web application (RWD).

- Native iOS app: NO
- Native Android app: NO
- Separate mobile codebase: NO
- Installable PWA requirement: NO
- Mobile browser access: YES, through the same RWD web application
- Desktop/tablet/mobile browser presentations share the same domain and application logic.
- Offline operation: YES, with a bounded Phase 1 offline scope.
- Service Worker / Cache Storage / IndexedDB: permitted implementation primitives for offline web, subject to architecture decision and security controls.
- Web app manifest / install-to-home-screen product requirement: NO.

This override supersedes PWA/mobile-first implementation wording in the source specification while preserving field use from mobile browsers and the owner's offline-operation requirement.
