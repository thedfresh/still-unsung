import { describe, expect, it } from "vitest";
import { formatPreview } from "@/lib/changes/preview-format";
import { pendingPreviewUrl } from "@/lib/changes/preview-link";

describe("pendingPreviewUrl", () => {
  it("builds the full address from the base, with or without a trailing slash", () => {
    expect(pendingPreviewUrl(27, "https://staging.stillunsung.com")).toBe("https://staging.stillunsung.com/admin/changes/pending/27");
    expect(pendingPreviewUrl(27, "https://staging.stillunsung.com/")).toBe("https://staging.stillunsung.com/admin/changes/pending/27");
  });

  it("gives no link without a base or a changeset", () => {
    expect(pendingPreviewUrl(27, undefined)).toBeNull();
    expect(pendingPreviewUrl(null, "https://x.test")).toBeNull();
  });

  it("is the last line of the preview text", () => {
    const text = formatPreview(
      { items: [], evidence: "", isPublic: false, warnings: [], expiresAt: new Date(0), token: "suprev_x" },
      "https://x.test/admin/changes/pending/1",
    );
    expect(text.split("\n").pop()).toContain("https://x.test/admin/changes/pending/1");
  });
});
