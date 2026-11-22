// The frame every product door renders in (ADR 018 §2). Each app/<door.page>/layout.tsx wraps its children in this with its
// product key; staff open the same app inside the (shell) layout. The frame itself is app/PlatformFrame.tsx (one frame for
// the staff console and every door, K5); this keeps the door layouts' one-line call.
import type { ReactNode } from "react";
import type { ProductKey } from "@/lib/portal/products";
import { PlatformFrame } from "./PlatformFrame";

export async function ProductDoorShell({ productKey, bare = false, children }: { productKey: ProductKey; bare?: boolean; children: ReactNode }) {
  return PlatformFrame({ kind: "door", productKey, bare, children });
}
