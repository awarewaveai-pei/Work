"use client";
// Sender side of "傳回" (R0-PLAN 2026-11-05-photocraft-pro C8.1): the pro editor's dock posts the edited PNG on
// BroadcastChannel CANVAS_RETURN_CHANNEL; this tab takes it only for a ticket it issued itself (openInCanvas ... ret) for
// `tool`, and acks only when onReturn put it into the slot. No ack within ~2 s = the dock saves to My Designs instead.
import { useEffect, useRef } from "react";
import { CANVAS_RETURN_CHANNEL, issuedReturnTickets } from "./canvas-handoff";

export type CanvasReturnHandler = (slot: string, image: string /* PNG data URL */) => boolean | Promise<boolean>;

/**
 * One message from the channel: true = ack it. A ticket stays valid after a return (edit again, send again); a reload
 * forgets every ticket. onReturn returns false when the slot is gone (e.g. the deck was regenerated); it must answer
 * quickly (well under 2 s): put the image in place and do any network save without awaiting it.
 */
export async function acceptCanvasReturn(tool: string, data: unknown, onReturn: CanvasReturnHandler): Promise<boolean> {
  const d = data as { type?: unknown; id?: unknown; image?: unknown } | null;
  if (!d || d.type !== "return" || typeof d.id !== "string" || typeof d.image !== "string") return false;
  const ticket = issuedReturnTickets.get(d.id);
  if (!ticket || ticket.tool !== tool) return false;
  try {
    return (await onReturn(ticket.slot, d.image)) === true;
  } catch (err) {
    console.error("[canvas-return]", err);
    return false;
  }
}

/** Take edited images back from the pro editors for tickets this tab issued with `openInCanvas(..., { tool, slot, label })`. */
export function useCanvasReturn(tool: string, onReturn: CanvasReturnHandler): void {
  const handler = useRef(onReturn);
  handler.current = onReturn;
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return; // no channel: every return lands in My Designs
    const ch = new BroadcastChannel(CANVAS_RETURN_CHANNEL);
    let open = true;
    ch.onmessage = (e: MessageEvent) => {
      void acceptCanvasReturn(tool, e.data, (slot, image) => handler.current(slot, image)).then((ok) => {
        if (ok && open) ch.postMessage({ type: "ack", id: (e.data as { id: string }).id });
      });
    };
    return () => {
      open = false;
      ch.close();
    };
  }, [tool]);
}
