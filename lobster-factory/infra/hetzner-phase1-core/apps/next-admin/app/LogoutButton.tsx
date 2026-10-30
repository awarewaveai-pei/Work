"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/ssr";

// Sidebar logout. Uses the browser client (which owns the session cookies) so signOut()
// clears them, then bounces to /login. Kept tiny + dependency-free on purpose.
/** `page`: on a page background (portal, door foot), where the sidebar's light text would be invisible on white. */
export function LogoutButton({ variant = "sidebar" }: { variant?: "sidebar" | "page" } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      style={{
        background: variant === "page" ? "var(--card-bg)" : "#fff",
        border: variant === "page" ? "1px solid var(--card-border)" : "1px solid var(--sidebar-border)",
        borderRadius: 6,
        color: variant === "page" ? "var(--text-primary)" : "var(--sidebar-text)",
        fontSize: 11,
        padding: "5px 10px",
        cursor: "pointer",
        width: variant === "page" ? "auto" : "100%",
        marginTop: 8,
      }}
    >
      {busy ? "登出中…" : "登出"}
    </button>
  );
}
