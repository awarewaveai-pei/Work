import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams(nav.search) }));
vi.mock("@/lib/entitlements/use-paid-features", () => ({
  usePaidFeatures: () => ({ holds: (k: string) => k !== "video.tts", why: (k: string) => (k === "video.tts" ? "尚未開通此功能" : undefined) }),
}));

import { NavRail } from "../NavRail";
import { DoorProvider } from "../DoorContext";
import { listedFeatureKeys } from "@/lib/entitlements/features";
import { PRODUCTS } from "@/lib/portal/products";

describe("door menu -- every feature bought separately or given by us", () => {
  it("lists the product's features and greys the ones the account does not hold", () => {
    const html = renderToStaticMarkup(<NavRail kind="door" page="/video" name="影片製作" features={[{ key: "video.script", name: "腳本生成" }, { key: "video.tts", name: "付費旁白" }]} />);
    expect(html).toContain("影片製作");
    expect(html).toMatch(/class="door-feature"[^>]*>腳本生成</);
    expect(html).toMatch(/class="door-feature off" title="尚未開通此功能">付費旁白</);
  });

  it("the signed list covers every feature a door lists, including ones asked outside a route", () => {
    const listed = new Set(listedFeatureKeys());
    for (const p of PRODUCTS.filter((x) => x.door.app === "next-admin")) {
      for (const f of p.features) expect(listed.has(f.feature_key), `${p.key} ${f.feature_key}`).toBe(true);
    }
  });
});

describe("usePaidFeatures().holds -- the menu never claims a feature it has not seen", () => {
  it("before the list loads (or when it fails) a feature is not held, while a button still stays usable", async () => {
    const real = await vi.importActual<typeof import("@/lib/entitlements/use-paid-features")>("@/lib/entitlements/use-paid-features");
    function Probe() {
      const { holds, canUse } = real.usePaidFeatures();
      return <i>{`${holds("video.tts")}|${canUse("video.tts")}`}</i>;
    }
    expect(renderToStaticMarkup(<Probe />)).toBe("<i>false|true</i>");
  });
});

describe("NavRail links keep the URL's current client (ADR 020)", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const S = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  afterEach(() => { nav.search = ""; });

  it("door pages carry org and site; nothing in the URL leaves them alone", () => {
    const door = () => renderToStaticMarkup(
      <DoorProvider nav={[{ path: "", name: "首頁" }, { path: "topics", name: "題目" }] as never}>
        <NavRail kind="door" page="/content" name="內容行銷" features={[]} />
      </DoorProvider>,
    );
    expect(door()).toContain('href="/topics"');
    nav.search = `org=${A}&site=${S}&x=1`;
    expect(door()).toContain(`href="/topics?org=${A}&amp;site=${S}"`);
  });

  it("staff links carry org; external links carry nothing; a non-uuid org is not carried", () => {
    nav.search = `org=${A}`;
    const html = renderToStaticMarkup(<NavRail kind="staff" />);
    expect(html).toContain(`?org=${A}"`);
    for (const m of html.matchAll(/<a [^>]*target="_blank" rel="noreferrer"[^>]*>/g)) expect(m[0]).not.toContain("org=");
    nav.search = "org=acme";
    expect(renderToStaticMarkup(<NavRail kind="staff" />)).not.toContain("org=");
  });
});
