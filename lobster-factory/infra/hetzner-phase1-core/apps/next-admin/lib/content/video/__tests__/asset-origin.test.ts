import { beforeEach, describe, expect, it } from "vitest";
import { rightsSourcesFor, signOrigin } from "../asset-origin";
import { rightsAssetsFromSources, runRightsQa } from "../editorial-rights-qa";

const AI = "https://cdn.example/designs/2026-10/a.png";
const UP = "https://cdn.example/designs/2026-10/u.png";
const PX = "https://images.pexels.com/photos/1/x.jpg";
const rights = (urls: string[], signed: Record<string, unknown>) => runRightsQa({ assets: rightsAssetsFromSources(rightsSourcesFor(urls, signed)) });

beforeEach(() => { process.env.OPS_PROXY_SHARED_SECRET = "test-secret"; });

describe("D7 rights from sources recorded at acquisition", () => {
  it("AI image, Pexels and a confirmed upload each pass", () => {
    const signed = {
      [AI]: signOrigin(AI, { kind: "ai_generated", model: "flux-schnell", provider: "flux" }),
      [UP]: signOrigin(UP, { kind: "upload", rightsConfirmed: true }),
    };
    expect(rights([AI, UP, PX], signed).status).toBe("passed");
  });

  it("an upload without the rights tick fails", () => {
    const signed = { [UP]: signOrigin(UP, { kind: "upload", rightsConfirmed: false }) };
    expect(rights([UP], signed).status).toBe("failed");
  });

  it("an origin moved to another url (forged) is not accepted", () => {
    const signed = { [UP]: signOrigin(AI, { kind: "ai_generated", model: "flux-schnell", provider: "flux" }) };
    expect(rights([UP], signed).status).toBe("failed");
  });

  it("nothing recorded fails", () => {
    expect(rights([AI], {}).status).toBe("failed");
  });
});
