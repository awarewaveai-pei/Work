"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/ssr";

// Sidebar logout. Uses the browser client (which owns the session cookies) so signOut()
// clears them, then bounces to /login. Kept tiny + dependency-free on purpose.
export function LogoutButton() {
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
        background: "none",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 6,
        color: "var(--sidebar-text)",
        fontSize: 11,
        padding: "5px 10px",
        cursor: "pointer",
        width: "100%",
        marginTop: 8,
      }}
    >
      {busy ? "登出中…" : "登出"}
    </button>
  );
}
