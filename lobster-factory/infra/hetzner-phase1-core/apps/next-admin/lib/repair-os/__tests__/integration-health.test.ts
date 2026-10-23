import { afterEach, describe, expect, it, vi } from "vitest";
import { checkIntegrationHealth } from "../integration-health";

const input = { provider: "cloudflare", secretRef: "vault:CLOUDFLARE_API_TOKEN", externalHint: null, metadata: {} };

function mockFetch(ok: boolean) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: ok }), { status: ok ? 200 : 401 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("cloudflare integration health", () => {
  it("verifies an account-owned token on the account endpoint when CLOUDFLARE_ACCOUNT_ID is set", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "tok-account");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc123");
    const fetchMock = mockFetch(true);

    const result = await checkIntegrationHealth(input);

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acc123/tokens/verify");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-account");
  });

  it("falls back to the user endpoint without an account id", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "tok-user");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    const fetchMock = mockFetch(true);

    await checkIntegrationHealth(input);

    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.cloudflare.com/client/v4/user/tokens/verify");
  });

  it("does not try the retired CLOUDFLARE_AUTH_BEARER_TOKEN name", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
    vi.stubEnv("CLOUDFLARE_AUTH_BEARER_TOKEN", "tok-dead");
    const fetchMock = mockFetch(true);

    const result = await checkIntegrationHealth({ ...input, secretRef: null });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
