"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { strings } from "../../lib/strings";

export default function LoginPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); try { await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ tenant_id: tenantId, email, password }) }); router.push("/"); } catch (reason) { setError(String(reason)); } }
  return <div className="card"><h1>{strings.appName}</h1><h2>{strings.login}</h2><form onSubmit={submit}><label className="field">Tenant ID<input value={tenantId} onChange={(event) => setTenantId(event.target.value)} required /></label><label className="field">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="field">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button type="submit">登入</button></form>{error && <p className="error">{error}</p>}</div>;
}
