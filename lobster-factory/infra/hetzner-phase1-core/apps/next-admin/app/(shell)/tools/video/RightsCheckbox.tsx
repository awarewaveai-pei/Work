"use client";

/** D7: the uploader states they may use the file, on the upload screen. Upload buttons stay disabled until it is ticked;
 *  the server refuses an upload without `rightsConfirmed=true` as well. */
export default function RightsCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-primary)" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      我上傳的素材是自己的，或我有權使用（沒勾就不能上傳）
    </label>
  );
}
