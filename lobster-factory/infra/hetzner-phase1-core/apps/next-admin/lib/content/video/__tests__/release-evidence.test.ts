import { describe, expect, it } from "vitest";
import { automaticQaIssuance } from "../qa-issuance";
import { selectTrustedReleaseQa, type StoredQaRow } from "../release-evidence";

const row = (kind: StoredQaRow["qa_kind"], capability: string, createdAt: string, reportJson: unknown, status = "passed"): StoredQaRow => ({
  id: `${kind}-${createdAt}`,
  qa_kind: kind,
  status,
  candidate_asset_id: "asset-1",
  candidate_checksum: "0123456789abcdef",
  profile_id: "default",
  profile_version: "1",
  capability_id: capability,
  report_json: reportJson,
  created_at: createdAt,
});

describe("trusted Release evidence", () => {
  it("ignores passed browser reports and keeps the newest server-issued record per kind", () => {
    const trusted = row("technical", "video.qa.render", "2026-09-09T00:00:00Z", { issuance: automaticQaIssuance("video.qa.render") });
    const forgedNewer = row("technical", "video.qa.render", "2026-09-10T00:00:00Z", { status: "passed" });
    const caption = row("caption", "video.qa.caption", "2026-09-09T00:00:00Z", { issuance: automaticQaIssuance("video.qa.caption") });
    expect(selectTrustedReleaseQa([forgedNewer, trusted, caption]).map((record) => record.id)).toEqual([trusted.id, caption.id]);
  });

  it("keeps warning evidence visible so the gate can fail closed", () => {
    const rights = row("rights", "media.qa.rights", "2026-09-09T00:00:00Z", { issuance: automaticQaIssuance("media.qa.rights") }, "warned");
    expect(selectTrustedReleaseQa([rights])[0]?.status).toBe("warned");
  });
});
