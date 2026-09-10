import { afterEach, describe, expect, it } from "vitest";
import { allowedMediaProviders, assertMediaProviderAllowed } from "../provider-policy";

const previous = process.env.MEDIA_PROVIDER_ALLOWLIST;
afterEach(() => { if (previous === undefined) delete process.env.MEDIA_PROVIDER_ALLOWLIST; else process.env.MEDIA_PROVIDER_ALLOWLIST = previous; });

describe("media provider policy", () => {
  it("fails closed when no allowlist is configured", () => {
    delete process.env.MEDIA_PROVIDER_ALLOWLIST;
    expect(allowedMediaProviders()).toEqual([]);
    expect(() => assertMediaProviderAllowed("openai")).toThrow(/not allowlisted/);
  });
  it("filters unknown providers and accepts only configured ids", () => {
    process.env.MEDIA_PROVIDER_ALLOWLIST = "openai, unknown, PEXELS";
    expect(allowedMediaProviders()).toEqual(["openai", "pexels"]);
    expect(() => assertMediaProviderAllowed("openai")).not.toThrow();
    expect(() => assertMediaProviderAllowed("replicate")).toThrow();
  });
});
