import { describe, expect, it } from "vitest";
import { effectiveVisibility } from "../../src/server/db/effective";

const ov = (visible: boolean | null) => ({ visible });

describe("effectiveVisibility (publish-on-sync S1)", () => {
  it("an active product with no explicit decision is VISIBLE", () => {
    expect(effectiveVisibility({ status: "active" }, null)).toBe(true);
    expect(effectiveVisibility({ status: "active" }, ov(null))).toBe(true);
    expect(effectiveVisibility({ status: "active" }, { visible: null, archivedAt: null })).toBe(true);
  });
  it("only an explicit visible=false hides an active product", () => {
    expect(effectiveVisibility({ status: "active" }, ov(false))).toBe(false);
    expect(effectiveVisibility({ status: "active" }, ov(true))).toBe(true);
  });
  it("archived is never visible regardless of other flags", () => {
    const archivedAt = new Date();
    expect(effectiveVisibility({ status: "active" }, { visible: true, archivedAt })).toBe(false);
    expect(effectiveVisibility({ status: "active" }, { visible: null, archivedAt })).toBe(false);
    expect(effectiveVisibility({ status: "active" }, { visible: false, archivedAt })).toBe(false);
  });
  it("legacy discontinued stays hidden even when the override says visible", () => {
    expect(effectiveVisibility({ status: "discontinued" }, ov(true))).toBe(false);
    expect(effectiveVisibility({ status: "discontinued" }, null)).toBe(false);
  });
  it("reviewed is no longer part of visibility (column kept in the DB, unread)", () => {
    // Full override rows still carry `reviewed`; it must not influence the result.
    const legacy: { visible: boolean | null; reviewed: boolean; archivedAt: Date | null } = {
      visible: null,
      reviewed: true,
      archivedAt: null,
    };
    expect(effectiveVisibility({ status: "active" }, legacy)).toBe(true);
    legacy.visible = false;
    expect(effectiveVisibility({ status: "active" }, legacy)).toBe(false);
  });
});
