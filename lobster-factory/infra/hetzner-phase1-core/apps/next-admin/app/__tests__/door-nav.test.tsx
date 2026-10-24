import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/lib/entitlements/use-paid-features", () => ({
  usePaidFeatures: () => ({ holds: (k: string) => k !== "video.tts", why: (k: string) => (k === "video.tts" ? "尚未開通此功能" : undefined) }),
}));

import { DoorNav } from "../DoorNav";
import { listedFeatureKeys } from "@/lib/entitlements/features";
import { PRODUCTS } from "@/lib/portal/products";

describe("door menu -- every feature bought separately or given by us", () => {
  it("lists the product's features and greys the ones the account does not hold", () => {
    const html = renderToStaticMarkup(<DoorNav page="/video" name="影片製作" features={[{ key: "video.script", name: "腳本生成" }, { key: "video.tts", name: "付費旁白" }]} />);
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
