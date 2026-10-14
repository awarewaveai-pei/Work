import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

// Live bug 2026-10-14: in the standalone container req.url is the bind address, so a redirect built
// from it sent the browser to https://0.0.0.0:3000/... (ERR_ADDRESS_INVALID) after a successful connect.
describe("GET gmail oauth callback — redirect target", () => {
  it("redirects to the public app host even when the request arrives on the container bind address", async () => {
    const res = await GET(new NextRequest("http://0.0.0.0:3000/api/outreach/connectors/gmail/oauth/callback?error=access_denied"));
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith("https://app.aware-wave.com/outreach/connectors?")).toBe(true);
    expect(location).not.toContain("0.0.0.0");
  });
});
