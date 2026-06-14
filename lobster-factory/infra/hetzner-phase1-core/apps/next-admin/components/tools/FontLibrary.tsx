"use client";

/**
 * FontLibrary — reusable font picker block (Google Fonts CJK + Latin + custom upload).
 * Ported from the vector-trace-demo.html 字型庫 prototype. Drop it anywhere a tool needs a
 * rich font chooser; it calls `onPick(family)` with the selected font family name (already
 * glyph-loaded). Other AIs/tools reuse it via `import FontLibrary from "@/components/tools/FontLibrary"`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GOOGLE_FONTS,
  CJK_FONTS,
  LATIN_FONTS,
  isCjkFont,
  ensureGoogleFonts,
  loadFont,
  loadUploadedFont,
} from "@/components/tools/font-library";

type Props = {
  current?: string;
  onPick: (family: string) => void;
};

export default function FontLibrary({ current, onPick }: Props) {
  const [filter, setFilter] = useState("");
  const [cat, setCat] = useState<"all" | "cjk" | "latin">("all");
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureGoogleFonts();
  }, []);

  const list = useMemo(() => {
    const all = [...uploaded, ...GOOGLE_FONTS];
    const q = filter.trim().toLowerCase();
    return all.filter((f) => {
      const up = uploaded.includes(f);
      if (cat === "cjk" && !CJK_FONTS.includes(f)) return false;
      if (cat === "latin" && !LATIN_FONTS.includes(f)) return false; // Latin tab = Latin only
      if (q && !f.toLowerCase().includes(q)) return false;
      return up || true;
    });
  }, [uploaded, filter, cat]);

  const pick = useCallback(
    async (name: string) => {
      await loadFont(name);
      onPick(name);
    },
    [onPick]
  );

  const onUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setError(null);
      try {
        const name = await loadUploadedFont(file);
        setUploaded((u) => (u.includes(name) ? u : [name, ...u]));
        onPick(name);
      } catch (err) {
        setError("字型載入失敗：" + (err instanceof Error ? err.message : String(err)));
      }
    },
    [onPick]
  );

  const tabBtn = (key: "all" | "cjk" | "latin", label: string) => (
    <button
      className="btn-secondary"
      style={{ fontSize: 12, fontWeight: cat === key ? 700 : 400 }}
      onClick={() => {
        setCat(key);
        setFilter("");
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        className="btn-secondary"
        placeholder="搜尋字型…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ width: "100%", fontSize: 12 }}
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {tabBtn("cjk", "中文")}
        {tabBtn("latin", "英文")}
        {tabBtn("all", "全部")}
        <label className="btn-secondary" style={{ fontSize: 12, cursor: "pointer" }}>
          ＋上傳
          <input
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            style={{ display: "none" }}
            onChange={(e) => {
              void onUpload(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error ? <span style={{ color: "#e5484d", fontSize: 11 }}>{error}</span> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 320, overflowY: "auto" }}>
        {list.map((f) => (
          <button
            key={f}
            onClick={() => void pick(f)}
            title={f}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 1,
              textAlign: "left",
              padding: "4px 6px",
              border: `1px solid ${current === f ? "#6366f1" : "var(--card-border)"}`,
              borderRadius: 4,
              background: current === f ? "#eef2ff" : "transparent",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 10, opacity: 0.6 }}>{uploaded.includes(f) ? `${f}（自有）` : f}</span>
            <span style={{ fontFamily: `"${f}"`, fontSize: 16 }}>{isCjkFont(f) ? "你好 永字 Ag123" : f}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
