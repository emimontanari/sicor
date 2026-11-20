import { describe, expect, it } from "vitest";
import { parseSettingsForm } from "../../../src/lib/admin/forms/settings";
import { filterMappings, parseMappingFilter, parseMappingForm } from "../../../src/lib/admin/forms/mappings";
import { changeKindLabel, noticeText, parseRunId } from "../../../src/lib/admin/forms/updates";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("parseSettingsForm", () => {
  it("maps fields and the showPrices checkbox (S5: auto_publish_new is gone from the form)", () => {
    expect(parseSettingsForm(fd({ whatsappNumber: "+54 9 11 1234-5678", messageTemplate: " Hola ", showPrices: "on" }))).toEqual({
      whatsappNumber: "+54 9 11 1234-5678",
      messageTemplate: " Hola ",
      showPrices: true,
    });
  });
  it("missing text fields become empty strings (cleared)", () => {
    expect(parseSettingsForm(fd({}))).toEqual({
      whatsappNumber: "",
      messageTemplate: "",
      showPrices: false,
    });
  });
  it("a stale autoPublishNew checkbox in the payload is ignored", () => {
    expect(parseSettingsForm(fd({ autoPublishNew: "on" }))).toEqual({
      whatsappNumber: "",
      messageTemplate: "",
      showPrices: false,
    });
  });
});

describe("parseMappingForm", () => {
  it("parses triple and category", () => {
    expect(parseMappingForm(fd({ metaCategory: "A", family: "B", subfamily: "", categoryId: "7" }))).toEqual({
      triple: { metaCategory: "A", family: "B", subfamily: "" },
      categoryId: 7,
    });
  });
  it("empty category means unassign; garbage is invalid", () => {
    expect(parseMappingForm(fd({ metaCategory: "A", categoryId: "" })).categoryId).toBeNull();
    expect(parseMappingForm(fd({ metaCategory: "A", categoryId: "x" })).categoryId).toBe(Number.NaN);
  });
});

describe("mapping filters", () => {
  const rows = [
    { metaCategory: "Ropa", family: "Camisas", subfamily: "", mappedCategory: null, effectiveCategory: null },
    { metaCategory: "Ropa", family: "Botas", subfamily: "", mappedCategory: { id: 1, slug: "a", name: "A" }, effectiveCategory: { id: 1, slug: "a", name: "A" } },
    { metaCategory: "Epp", family: "Cascos", subfamily: "", mappedCategory: null, effectiveCategory: { id: 2, slug: "b", name: "B" } },
  ];
  it("parses query string", () => {
    expect(parseMappingFilter({ sin: "1", q: " cas " })).toEqual({ unmapped: true, q: "cas" });
    expect(parseMappingFilter({})).toEqual({ unmapped: false, q: "" });
    expect(parseMappingFilter({ sin: ["1"], q: ["x", "y"] })).toEqual({ unmapped: true, q: "x" });
  });
  it("unmapped = no effective category (Otros)", () => {
    expect(filterMappings(rows, { unmapped: true, q: "" }).map((r) => r.family)).toEqual(["Camisas"]);
  });
  it("search matches any part, case-insensitive", () => {
    expect(filterMappings(rows, { unmapped: false, q: "EPP" }).map((r) => r.family)).toEqual(["Cascos"]);
  });
});

describe("updates helpers", () => {
  it("noticeText", () => {
    expect(noticeText({ new: 3, changed: 2, removed: 1 })).toBe(
      "Masefer agregó 3 nuevos, 2 cambiaron, 1 se dieron de baja — ¿Actualizar?",
    );
  });
  it("kind labels", () => {
    expect(changeKindLabel("new")).toBe("Nuevo");
    expect(changeKindLabel("changed")).toBe("Cambió");
    expect(changeKindLabel("removed")).toBe("De baja");
  });
  it("parseRunId", () => {
    expect(parseRunId(fd({ runId: "12" }))).toBe(12);
    expect(parseRunId(fd({ runId: "0" }))).toBeNull();
    expect(parseRunId(fd({ runId: "abc" }))).toBeNull();
    expect(parseRunId(fd({}))).toBeNull();
  });
});
