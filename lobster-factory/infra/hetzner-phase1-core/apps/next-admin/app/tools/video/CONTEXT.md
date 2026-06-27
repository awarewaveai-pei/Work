# AI Video Director (Context)

The video-generation feature at `/tools/video`. A script + N images go in; an AI
"director" arranges a polished narrated video, which Remotion renders deterministically.
This file is a glossary only — no implementation details. Decisions live in ADRs.

## Language

**Director**:
The AI step that, given a Script and the Image set, produces a Timeline. It decides
arrangement only — it never renders pixels.
_Avoid_: editor, AI editor, composer

**Timeline**:
The validated JSON the Director outputs — the full edit-decision list (intro, ordered
Scenes, transitions, overlays, outro). The Render Service consumes it as-is.
_Avoid_: plan, EDL, storyboard, manifest

**Scene**:
The atomic unit of a video: exactly one Image + one narration chunk + its on-screen
treatment. Scene length equals its narration's TTS duration.
_Avoid_: clip, slide, segment

**Image**:
One visual asset bound 1:1 to a Scene (AI-generated "custom" or Pexels "broll").
_Avoid_: photo, picture, asset, media

**Spine**:
The strict 1 Image : 1 Scene : 1 narration backbone that the Director arranges along.
Chosen over a decoupled asset pool to reuse the existing script/TTS pipeline unchanged.
_Avoid_: track model, timeline model

**Layer**:
One simultaneously-animating element stacked within a Scene (background, image,
headline, subtitle, logo, lower-third, vignette, audio). Depth of layering — not the
Spine — is what makes a video look professional.
_Avoid_: track, element, overlay (overlay = a specific Layer role)

**Template**:
A reusable building block for one visual job: a per-Scene animation, an intro/outro, a
transition, a chart, a lower-third. The Director picks Templates by role, not at random.
_Avoid_: composition (that's the Remotion render-side term), effect, preset

**Style Pack**:
A pre-approved bundle of Templates that share one aesthetic (e.g. "clean explainer",
"cinematic brand", "punchy reels"). The Director draws a whole video from one Pack to
guarantee visual consistency.
_Avoid_: theme, vibe, preset, kit

**Grid Scene**:
A special Scene that shows several Images in one frame (grid / montage / split) instead
of the default single Image. The controlled exception to the Spine's 1:1 rule.
_Avoid_: collage, gallery

**Render Service**:
The self-hosted `remotion-service` on the EU VPS that turns a Timeline into an MP4 on R2.
The Director and the Render Service never share state beyond the Timeline.
_Avoid_: renderer, backend, encoder

**Production Mode**:
The user's per-video choice of which engine produces the video. Chosen at script
handoff. Two values: Quick Engine and Director Engine. The two engines coexist
permanently; the choice is never global.
_Avoid_: render mode, quality tier, pipeline choice

**Quick Engine**:
The existing Python ffmpeg path (Ken Burns + drawtext subtitles + fade + concat).
Fast, cheap, simple look. Stays the default and the fallback — never removed.
_Avoid_: legacy path, basic mode, ffmpeg mode

**Director Engine**:
The new path: AI Director → Timeline → ONE Remotion composition for the whole video,
keeping native `<TransitionSeries>` transitions, native `<Audio>` music with ducking,
and cross-scene continuity. Long videos are produced by Frame-Range Sharding. Rich,
layered, cinematic look.
_Avoid_: remotion mode, premium mode, cinematic engine, per-scene clips

**Frame-Range Sharding**:
The render technique for the Director Engine: the single composition is split into
time/frame ranges rendered in parallel processes, then losslessly concatenated. Splits
by frame range (mechanical, seamless), never by Scene. Enables 1–10 min videos at
feasible speed with per-shard fault recovery.
_Avoid_: scene splitting, clip rendering, chunking
