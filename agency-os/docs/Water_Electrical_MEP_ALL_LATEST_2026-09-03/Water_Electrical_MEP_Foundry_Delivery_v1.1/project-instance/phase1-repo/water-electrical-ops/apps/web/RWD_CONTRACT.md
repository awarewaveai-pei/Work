# RWD + Offline Web Contract

- One responsive web application.
- Same domain commands and authorization at all viewport widths.
- Desktop may use drag/drop; narrow view uses tap/select/assign equivalent.
- No `apps/mobile`, React Native/Flutter/Capacitor/Cordova scaffold.
- No installable PWA product requirement and no `.webmanifest` artifact.
- Service Worker/Cache Storage/IndexedDB are allowed only as offline-web implementation primitives.
- Phase 1 offline reads: current/next dispatch and field site summary previously synchronized.
- Phase 1 offline write allow-list begins with dispatch acknowledgement.
- Server re-authorizes and version-checks every queued command before commit.
