import { describe, expect, it } from "vitest";
import { effectiveVisibility } from "../../src/server/db/effective";

const settings = (autoPublishNew: boolean) => ({ autoPublishNew });
const ov = (visible: boolean | null, reviewed = false) => ({ visible, reviewed });

describe("effectiveVisibility (S5)", () => {
  it("hides discontinued even when override says visible", () => {
    expect(
      effectiveVisibility({ status: "discontinued" }, ov(true), settings(true)),
    ).toBe(false);
  });
  it("override.visible wins over defaults", () => {
    expect(effectiveVisibility({ status: "active" }, ov(true), settings(false))).toBe(true);
    expect(effectiveVisibility({ status: "active" }, ov(false, true), settings(true))).toBe(false);
  });
  it("new unreviewed product is hidden unless auto_publish_new", () => {
    expect(effectiveVisibility({ status: "active" }, ov(null), settings(false))).toBe(false);
    expect(effectiveVisibility({ status: "active" }, null, settings(false))).toBe(false);
    expect(effectiveVisibility({ status: "active" }, ov(null), settings(true))).toBe(true);
    expect(effectiveVisibility({ status: "active" }, null, settings(true))).toBe(true);
  });
  it("reviewed product with no explicit visibility follows default (visible)", () => {
    expect(effectiveVisibility({ status: "active" }, ov(null, true), settings(false))).toBe(true);
  });
});

describe("effectiveVisibility archived", () => {
  it("archived is never visible regardless of other flags", () => {
    const archivedAt = new Date();
    const o = { visible: true, reviewed: true, archivedAt };
    expect(effectiveVisibility({ status: "active" }, o, settings(true))).toBe(false);
    expect(effectiveVisibility({ status: "active" }, { visible: null, reviewed: false, archivedAt }, settings(true))).toBe(false);
  });
  it("null archivedAt keeps existing rules", () => {
    const o = { visible: true, reviewed: false, archivedAt: null };
    expect(effectiveVisibility({ status: "active" }, o, settings(false))).toBe(true);
  });
});
