// One real claim search on the platform's search account, through the block's own driver and provider door
// (Cognitive OS wire v2). collect-wire-v2.test.ts proves the wire against fakes; only a live call proves the vendor
// still answers this request shape. No page is fetched.
//
// OFF by default (one billed call). Prints counts and hosts only, never a key or a page:
//   COLLECT_CLAIM_LIVE=1 npx vitest run lib/collect/__tests__/collect-claim-live.test.ts
// COLLECT_CLAIM_TEXT overrides the claim.

import { describe, expect, it } from "vitest";
import { entityDossierCollector } from "@/lib/collect/collectors/entity-dossier";
import { createProviderCall } from "@/lib/collect/net/providers";
import { createBudget } from "@/lib/collect/budget";
import { canonicalize } from "@/lib/collect/canonical";
import { collectGrant } from "./grant-fixture";

const GRANT = await collectGrant();

const LIVE = process.env.COLLECT_CLAIM_LIVE === "1";

describe.skipIf(!LIVE)("claim search, live", () => {
  it(
    "runs one Chinese fact-check query on serper and reports brave as no_key",
    async () => {
      expect(process.env.SERPER_API_KEY, "SERPER_API_KEY is not set").toBeTruthy();
      const budget = createBudget({ fetches: 2 });
      const target = {
        uri: "entity://claim/live1",
        canonicalUri: "entity://claim/live1",
        scope: { hosts: [] },
        tier: 0,
        depth: 0,
        meta: {
          kind: "claim",
          entityName: process.env.COLLECT_CLAIM_TEXT ?? "台北市垃圾費加倍",
          angles: ["factcheck"],
          languages: ["zh"],
          providers: ["serper", "brave"],
        },
      };
      const out = await entityDossierCollector.run(target, {
        fetch: async () => {
          throw new Error("this test fetches no page");
        },
        callProvider: createProviderCall({ grant: GRANT, budget }),
        canonicalize,
        budget,
        tenantRef: "live",
        log: () => {},
      });
      const hostsOf = (urls: string[]) => [...new Set(urls.map((u) => new URL(u).hostname))];
      console.log(
        JSON.stringify({
          billedCalls: budget.snapshot().spent.fetches,
          results: out.discovered.length,
          setAside: out.aside.length,
          hosts: hostsOf(out.discovered.map((d) => d.uri)),
          asideHosts: hostsOf(out.aside.map((a) => a.url)),
          channels: out.channels.map((c) => `${c.provider}/${c.lang}:${c.state}${c.why ? `(${c.why})` : ""}`),
        }),
      );
      expect(budget.snapshot().spent.fetches).toBe(1);
      expect(out.channels.find((c) => c.provider === "serper")?.state).toBe("ok");
      expect(out.channels.find((c) => c.provider === "brave")?.state).toBe("no_key");
      expect(out.discovered.length + out.aside.length).toBeGreaterThan(0);
    },
    60_000,
  );
});
