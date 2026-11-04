/**
 * Typed door to public/editor-shared/bg-remove.js — the ONE place the 🪄 去背 request and messages live for both
 * /tools/canvas (Fabric 7, imports it here) and public/vector-editor.html (Fabric 5, loads the same file as <script type="module">).
 * drift guard: lib/studio/__tests__/editor-bg-remove-drift.test.ts
 */
import * as shared from "../../public/editor-shared/bg-remove.js";

export type RemoveBgResult = { ok: true; image: string } | { ok: false; error: string };
export type ViewBefore = { cropX?: number; cropY?: number; width: number; height: number; scaleX: number; scaleY: number };

export const REMOVE_BG_URL = shared.REMOVE_BG_URL as string;
export const OPS_ROLE_HEADER = shared.OPS_ROLE_HEADER as Record<string, string>;
export const BG_MSG = shared.BG_MSG as {
  intro: string; needImage: string; busy: string; ok: string; failed: (why: string) => string; keyOk: string; reverted: string; revertFailed: (why: string) => string;
  nothingToRevert: string; picked: (hex: string) => string; pickFailed: (why: string) => string; pickHint: string;
};
export const isRouteImage = shared.isRouteImage as (url: unknown) => boolean;
export const requestRemoveBg = shared.requestRemoveBg as (dataUrl: string, fetchImpl?: typeof fetch) => Promise<RemoveBgResult>;
export const hexAtClient = shared.hexAtClient as (el: HTMLCanvasElement, clientX: number, clientY: number) => string;
export const keepViewAfterSwap = shared.keepViewAfterSwap as (before: ViewBefore, oldNaturalW: number, newNaturalW: number) => ViewBefore & { cropX: number; cropY: number };
