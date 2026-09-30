# Video Workbench UX reconciliation audit — 2026-09-10

## Verdict

The deployed page is a developer control panel, not the planned producer workbench. It does not implement the four-domain user flow defined by the LEGO architecture.

## Evidence

| Finding | Evidence | Consequence |
|---|---|---|
| Eight technical tabs are peers: Generate, Remotion, Timeline, Bible, Footage, Operations, Release, History, Info. | `apps/next-admin/app/(shell)/tools/video/VideoStudio.tsx:598-606` | The producer must understand internal renderers, contracts and ledgers before starting a project. |
| The plan defines four domains, where Media Core is an invisible coordinating boundary rather than a UI tool. | `MEDIA_PRODUCTION_LEGO_PLATFORM_PLAN.md:54-65` | Current navigation exposes implementation details that must be hidden behind typed workflow transitions. |
| Timeline is a raw JSON paste box and explicitly cannot render. | `TimelineValidationPanel.tsx:34-40` | It is useful only to an engineer; it interrupts the producer journey and cannot be the primary directing surface. |
| Bible, footage, release and operations each independently request organization UUID. | `StoryBibleWorkbench.tsx:17-30`; `FootageEditor.tsx:22,94`; `ReleaseDeliveryPanel.tsx:13,90`; `MediaOperationsPanel.tsx:5-27` | One project has no shared context; users can accidentally work against unrelated tenants or abandon the flow. |
| Bible authoring accepts comma-separated asset UUIDs and exposes no asset picker. | `StoryBibleWorkbench.tsx:35,39` | The screen makes users operate database identities instead of choosing visual character references. |
| Bible UI does not expose `role` or `rightsNote` even though its own model contains them. | `StoryBibleWorkbench.tsx:6-7,35` | Character continuity and rights cannot be authored completely. |
| The planned Bible requires voice/style anchors, target duration/profile, shot requirements, parent lineage and explicit continuity review. | `PHASE_5_SHORT_DRAMA_AND_FOOTAGE_EDIT_CONTRACT.md:29-40` | Current document/UI is structurally incomplete for short-drama production. |
| Delivery still asks for platform JSON, URL map, site ID, post ID and video URL. | `ReleaseDeliveryPanel.tsx:81-92` | It is an adapter test surface, not a Release-first delivery workspace. |`n| Script handoff forces a React remount to transfer data. | `VideoTabs.tsx:47-60,72-94` | Draft state is page-local rather than a durable production project; navigation and recovery are fragile. |

## Required information architecture

1. **Projects / Workbench** — choose or create a production project, select one mode: quick video, short drama, real-footage edit. The project supplies organization, brief, rights scope and current artifact/revision.
2. **Create** — mode-specific human tools: script/storyboard, Bible/character board, footage bin/edit plan. Users select assets by title/thumbnail; UUIDs stay internal.
3. **Produce and review** — derived Timeline, render state, transcript/captions, QA and candidate comparison. Renderer selection, capability IDs and Timeline JSON are advanced evidence, not default navigation.
4. **Release and outcomes** — choose an approved candidate, then create website/social drafts, see receipts and outcome snapshots. Platform payload JSON is hidden behind structured forms.

Media Core remains a non-visual coordinator. Admin-only provider, entitlement and capability settings are separated from production work.

## Acceptance gates for the replacement

- A producer can complete a quick video, a short drama or footage edit without typing a UUID, SHA-256, raw Timeline JSON or Postiz payload.
- An active project is the only source of organization, selected asset, Bible revision, Timeline, candidate and Release context.
- Every screen shows where the project is in `Create → Produce → Review → Release → Measure` and blocks invalid forward transitions with actionable guidance.
- Bible supports character visual/voice/style anchors, wardrobe/continuity states, locations, props, episode package and revision diff/approval.
- Advanced evidence remains accessible from a project inspector without appearing as top-level navigation.
- Existing Quick Engine, Remotion, footage, QA, WordPress and Postiz routes remain adapters; no existing production path is removed during UI migration.

