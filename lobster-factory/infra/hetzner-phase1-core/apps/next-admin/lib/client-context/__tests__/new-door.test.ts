// @vitest-environment jsdom
// K14 (ADR 020, plan CLIENT-CONTEXT-PLAN-20261121 §4b): a new product door needs no hand edit in the frame, the client rail or
// the links. Every loop walks PRODUCTS; no product key or domain is written here. A red test = a hand-edit point: report it,
// do not exempt it.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/tools/content",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/lib/client-context/track-picked", () => ({ trackClientPicked: vi.fn() }));
vi.mock("@/lib/entitlements/use-paid-features", () => ({ usePaidFeatures: () => ({ holds: () => true, why: () => undefined }) }));

import { ClientContextProvider } from "../../../app/ClientContextProvider";
import { ClientRail } from "../../../app/ClientRail";
import { NavRail } from "../../../app/NavRail";
import { DoorProvider } from "../../../app/DoorContext";
import { frameHosts } from "../../../app/PlatformFrame";
import { useClientContext, STAFF_HOST_KEY } from "../use-client-context";
import { withContext } from "../contract";
import { doorForHost, nextAdminProducts, servedNextAdminProducts } from "@/lib/portal/doors";
import { baseDomain, productHost, staffHosts } from "@/lib/portal/hosts";
import { ROOT, posix, sources, typeOnly } from "@/lib/portal/__tests__/code-scan";
import { scanDirs } from "./no-private-context.test";

type Env = Record<string, string | undefined>;
const brandEnv = (): Env => ({
  ...Object.fromEntries(servedNextAdminProducts().map((p) => [`PRODUCT_HOST_${p.key.toUpperCase()}`, `${p.key}-brand.example`])),
  STAFF_HOSTS: "console.brand.example",
});

const A = "11111111-1111-4111-8111-111111111111";
const S = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("T1 doorForHost: a door answers on its default subdomain and on any independent host", () => {
  it("every served next-admin product", () => {
    expect(servedNextAdminProducts().length).toBeGreaterThan(0);
    for (const p of servedNextAdminProducts()) {
      const def = doorForHost(`${p.subdomain}.${baseDomain({})}`, {});
      expect(def, `${p.key} default host`).toEqual({ kind: "product", product: p });
      const env = brandEnv();
      const own = doorForHost(`${p.key}-brand.example`, env);
      expect(own, `${p.key} brand host`).toEqual({ kind: "product", product: p });
      expect(doorForHost(`${p.subdomain}.${baseDomain(env)}`, env), `${p.key}: the replaced host stops answering`).not.toEqual({ kind: "product", product: p });
    }
  });
});

describe("T2 frame hosts: the server-side table covers every door, from config", () => {
  it("default and brand env", () => {
    for (const env of [{} as Env, brandEnv()]) {
      const hosts = frameHosts(env);
      for (const p of nextAdminProducts().filter((x) => x.door.enabled !== false)) expect(hosts[p.key], p.key).toBe(`https://${productHost(p, env)}`);
      expect(hosts[STAFF_HOST_KEY]).toBe(`https://${staffHosts(env)[0]}`);
    }
    for (const p of nextAdminProducts().filter((x) => x.door.enabled === false)) expect(frameHosts({})[p.key], `${p.key} reserved door`).toBeUndefined();
  });
});

describe("T3 the browser uses the hosts it is handed, never env", () => {
  let hosts: Record<string, string>;
  const saved = { ...process.env };
  beforeEach(() => {
    for (const k of Object.keys(process.env)) if (/^(?:PRODUCT_HOST_|PUBLIC_BASE_DOMAIN$|STAFF_HOSTS$|PORTAL_HOST$)/.test(k)) delete process.env[k];
    hosts = frameHosts(brandEnv());
    nav.search = `org=${A}&site=${S}`;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.startsWith("/api/ops/org-search")
        ? { ok: true, orgs: [{ id: A, slug: "acme", name: "Acme", color: "var(--accent)", brandColors: [] }], total: 1, categories: [] }
        : { ok: true, sites: [{ id: S, name: "主站", organization_id: A }] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); process.env = { ...saved }; });

  function Page() { useClientContext("org"); return null; }

  it("a cross-host link keeps the prop's host and carries org and site", () => {
    for (const p of nextAdminProducts().filter((x) => x.door.enabled !== false)) {
      const href = withContext(`${hosts[p.key]}/handoff?open=x`, { org: A, site: S });
      expect(new URL(href).host, `${p.key}: ${href}`).toBe(`${p.key}-brand.example`);
      expect(new URL(href).searchParams.get("org")).toBe(A);
      expect(new URL(href).searchParams.get("site")).toBe(S);
    }
  });

  it("ClientRail on a door sends staff to the staff host from the prop", async () => {
    render(h(ClientContextProvider, { sitesPath: "/api/content/sites", sessionOrg: null, hostOrg: null, internalOrgId: null, hosts, onDoor: true, children: null }, h(ClientRail), h(Page)));
    const link = await waitFor(() => screen.getByRole("link", { name: /客戶頁/ }));
    expect(new URL(link.getAttribute("href")!).origin).toBe("https://console.brand.example");
  });

  it("NavRail door links stay on the current host (relative) and carry org and site", () => {
    const html = renderToStaticMarkup(
      h(DoorProvider, { nav: [{ path: "", name: "首頁" }, { path: "topics", name: "題目" }] as never, children: null }, h(NavRail, { kind: "door", page: "/content", name: "內容行銷" })),
    );
    expect(html).toContain(`href="/topics?org=${A}&amp;site=${S}"`);
    expect(html).not.toMatch(/href="https?:\/\//);
  });
});

const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const layerFiles = () => sources(path.join(ROOT, "lib/client-context")).map(posix);
const parse = (f: string) => ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, /\.tsx$/.test(f) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

describe("T4 no browser-side host or env", () => {
  it("no 'use client' file and nothing in lib/client-context imports lib/portal/hosts or reads PRODUCT_HOST", () => {
    const files = [...new Set(["app", "components", "lib"].flatMap((d) => sources(path.join(ROOT, d)).map(posix)))];
    expect(files.length).toBeGreaterThan(100);
    const bad: string[] = [];
    for (const f of files) {
      const sf = parse(f);
      const client = sf.statements.some((s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === "use client");
      if (!client && !f.startsWith("lib/client-context/")) continue;
      const visit = (n: ts.Node) => {
        if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteralLike(n.moduleSpecifier)
          && /(?:^|\/)portal\/hosts(?:\.[cm]?[jt]s)?$/.test(n.moduleSpecifier.text) && !typeOnly(n)) bad.push(`${f}: imports ${n.moduleSpecifier.text}`);
        if (ts.isStringLiteralLike(n) && /^PRODUCT_HOST/.test(n.text)) bad.push(`${f}: names ${n.text}`);
        if (ts.isIdentifier(n) && /^PRODUCT_HOST/.test(n.text)) bad.push(`${f}: names ${n.text}`);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(bad).toEqual([]);
  });
});

describe("T5 no domain literal in the frame or the context layer", () => {
  // String literals and template text only: JSX text (a visible label) cannot become a link.
  const DOMAIN = /aware-wave|\b[a-z0-9-]+\.(?:com|net|org|io|dev|app|tw|example|test)\b/i;
  it("no host name string, no cookie domain", () => {
    const files = [...new Set([...layerFiles(), "app/ClientContextProvider.tsx", "app/ClientRail.tsx", "app/PlatformFrame.tsx", "app/NavRail.tsx"])];
    const bad: string[] = [];
    for (const f of files) {
      const sf = parse(f);
      const visit = (n: ts.Node) => {
        const text = ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) ? n.text : null;
        if (text !== null && (DOMAIN.test(text) || /(?:^|;\s*)domain\s*=/i.test(text))) bad.push(`${f}: ${JSON.stringify(text)}`);
        if (ts.isPropertyAssignment(n) && n.name.getText(sf) === "domain") bad.push(`${f}: cookie domain option`);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(bad).toEqual([]);
  });
});

describe("T6 the K13 checker covers every door page directory", () => {
  it("scan set contains app<door.page> for every next-admin door whose directory exists", () => {
    const scanned = new Set(scanDirs());
    const withDir = nextAdminProducts().filter((p) => existsSync(path.join(ROOT, `app${p.door.page}`)));
    expect(withDir.length).toBeGreaterThan(0);
    for (const p of withDir) expect(scanned.has(`app${p.door.page}`), `${p.key}: app${p.door.page} is not scanned by no-private-context`).toBe(true);
  });
});
