import { describe, expect, it } from "vitest";
import { normalizeSentry } from "../normalize/sentry";

// Client attribution (2026-07-03 chain audit): Sentry project slugs created by
// integration-steps use the org slug, so a valid-shaped project_slug doubles
// as client_slug. Invalid shapes must NOT leak into client_slug (the
// upsertIncidentAtomic slug→org resolve trusts its format).
describe("normalizeSentry — client_slug attribution from project_slug", () => {
  const payload = (projectSlug?: unknown) => ({
    data: {
      issue: { id: "123", title: "TypeError: boom", level: "error" },
      ...(projectSlug !== undefined ? { project_slug: projectSlug } : {}),
    },
  });

  it("valid slug shape → client_slug set (lowercased)", () => {
    const draft = normalizeSentry(payload("Soulful-Expression"));
    expect(draft.client_slug).toBe("soulful-expression");
  });

  it("no project_slug → client_slug null", () => {
    const draft = normalizeSentry(payload());
    expect(draft.client_slug).toBeNull();
  });

  it("invalid characters (path traversal / spaces) → client_slug null", () => {
    expect(normalizeSentry(payload("../etc/passwd")).client_slug).toBeNull();
    expect(normalizeSentry(payload("two words")).client_slug).toBeNull();
    expect(normalizeSentry(payload("slug_with_underscore")).client_slug).toBeNull();
  });

  it("over-long slug is truncated to 64 before validation", () => {
    const long = "a".repeat(80);
    expect(normalizeSentry(payload(long)).client_slug).toBe("a".repeat(64));
  });

  it("project_slug still recorded in tags regardless of validity", () => {
    const draft = normalizeSentry(payload("two words"));
    expect(draft.tags.project_slug).toBe("two words");
  });
});
