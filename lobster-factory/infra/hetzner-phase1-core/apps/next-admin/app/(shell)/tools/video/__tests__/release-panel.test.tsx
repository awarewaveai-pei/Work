// V5.1: the release step has no hand-typed fields -- no SHA, UUID or JSON box; the video is picked by buttons, checkbox lists and buttons.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReleaseDeliveryPanel from "../ReleaseDeliveryPanel";

describe("ReleaseDeliveryPanel", () => {
  it("renders no free-text field, dropdown or raw evidence box", () => {
    const html = renderToStaticMarkup(<ReleaseDeliveryPanel organizationLocked initialOrganizationId="123e4567-e89b-42d3-a456-426614174001" />);
    expect(html).not.toMatch(/<(input|textarea|select|pre)\b/);
    expect(html).not.toMatch(/SHA|UUID|JSON/);
  });
});
