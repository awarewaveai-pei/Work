// A customer who opens a product door without a session saw the staff "Lobster Factory / Admin Console" form and a
// password field it has no password for (screenshot 2026-10-30). A door's /login names the product and the way in.
import { describe, expect, it } from "vitest";
import { loginDoor } from "@/lib/portal/login-door";

describe("loginDoor", () => {
  it("a product door names its product and sends members to aware-wave.com", () => {
    expect(loginDoor("social.aware-wave.com", {})).toEqual({ product: "社群發文", memberHref: "https://aware-wave.com/my-account/" });
  });
  it("the staff host keeps the admin console login", () => {
    expect(loginDoor("app.aware-wave.com", {})).toBeNull();
  });
});
