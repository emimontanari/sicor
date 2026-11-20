import { describe, expect, it } from "vitest";
import { parseSettingsForm } from "../../../src/lib/admin/forms/settings";
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
