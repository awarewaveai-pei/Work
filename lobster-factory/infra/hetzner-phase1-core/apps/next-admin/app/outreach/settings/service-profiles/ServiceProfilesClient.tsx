'use client';
import { useCallback, useEffect, useState } from "react";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";

interface Profile {
  id: string;
  service_name: string;
  industry: string | null;
  positioning: string | null;
  usp: string | null;
  tone: string | null;
  forbidden_words: string[] | null;
  organization_id: string | null;
  created_at: string;
}

interface FormState {
  serviceName: string;
  industry: string;
  positioning: string;
  usp: string;
  tone: string;
  forbiddenWords: string;
}

const EMPTY_FORM: FormState = {
  serviceName: "",
  industry: "",
  positioning: "",
  usp: "",
  tone: "",
  forbiddenWords: "",
};

const API = "/api/outreach/service-profiles";

export default function ServiceProfilesClient() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(API);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "load failed");
      setProfiles(j.profiles as Profile[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.serviceName.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, organizationId: org }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "save failed");
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("刪除這個 Service Profile？")) return;
    setErr(null);
    try {
      const r = await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "delete failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      {err && (
        <div className="card-badge badge-red" role="alert">
          {err}
        </div>
      )}

      <form className="card" onSubmit={create} style={{ display: "grid", gap: 8 }}>
        <div className="card-header">
          <span className="card-label">新增 Service Profile</span>
        </div>
        <input placeholder="服務名稱（必填）* 例：藝術療癒工作坊" value={form.serviceName} onChange={set("serviceName")} required />
        <input placeholder="產業 例：瑜伽 / 身心靈" value={form.industry} onChange={set("industry")} />
        <input placeholder="定位 positioning" value={form.positioning} onChange={set("positioning")} />
        <input placeholder="USP 獨特賣點" value={form.usp} onChange={set("usp")} />
        <input placeholder="語氣 tone 例：溫和專業" value={form.tone} onChange={set("tone")} />
        <input placeholder="禁用詞（逗號分隔）例：療效保證, 治療焦慮" value={form.forbiddenWords} onChange={set("forbiddenWords")} />
        <button type="submit" className="btn-primary" disabled={saving || !form.serviceName.trim()}>
          {saving ? "儲存中…" : "新增"}
        </button>
      </form>

      <div className="card">
        <div className="card-header">
          <span className="card-label">已建立（{profiles.length}）</span>
        </div>
        {loading ? (
          <p className="card-sub">載入中…</p>
        ) : profiles.length === 0 ? (
          <p className="card-sub">尚無 Service Profile。新增一筆即可開始評分與生成文案。</p>
        ) : (
          <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}>
            {profiles.map((p) => (
              <li key={p.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span>
                  <strong>{p.service_name}</strong>
                  {p.industry ? <span className="card-sub"> · {p.industry}</span> : null}
                  {p.forbidden_words && p.forbidden_words.length > 0 ? (
                    <span className="card-sub"> · 禁用詞 {p.forbidden_words.length}</span>
                  ) : null}
                </span>
                <button type="button" className="btn-secondary" onClick={() => void remove(p.id)}>
                  刪除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
