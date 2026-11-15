import { describe, expect, it } from "vitest";
import { buildQuoteMessage, buildWhatsAppUrl } from "../../src/lib/cart/whatsapp";

const TEMPLATE = "Hola, quisiera consultar cotización de los siguientes productos:";
const item = {
  code: "PANT01",
  name: "PANTALON CARGO ELASTIZADO PAMPERO",
  talle: "42",
  color: "Azul",
  quantity: 2,
  note: "ELASTIZA",
};

describe("buildQuoteMessage", () => {
  it("lists template, one line per item, and the customer note", () => {
    const msg = buildQuoteMessage({
      template: TEMPLATE,
      items: [item, { code: "X1", name: "GUANTE", quantity: 1 }],
      customerNote: "Juan - Córdoba",
    });
    expect(msg).toBe(
      [
        TEMPLATE,
        "• 2 x PANTALON CARGO ELASTIZADO PAMPERO (Talle 42, Color Azul) [PANT01] — ELASTIZA",
        "• 1 x GUANTE [X1]",
        "",
        "Juan - Córdoba",
      ].join("\n"),
    );
  });
  it("omits variants and note parts that are absent; blank customer note is ignored", () => {
    const msg = buildQuoteMessage({
      template: TEMPLATE,
      items: [{ code: "X1", name: "GUANTE", color: "Rojo", quantity: 3 }],
      customerNote: "   ",
    });
    expect(msg).toBe(`${TEMPLATE}\n• 3 x GUANTE (Color Rojo) [X1]`);
  });
});

describe("buildWhatsAppUrl", () => {
  it("keeps only digits of the number and encodes the message", () => {
    const url = buildWhatsAppUrl({
      number: "+54 9 351-000 0000",
      template: TEMPLATE,
      items: [item],
    });
    expect(url).not.toBeNull();
    const [base, query] = url!.split("?text=");
    expect(base).toBe("https://wa.me/5493510000000");
    expect(decodeURIComponent(query!)).toBe(
      buildQuoteMessage({ template: TEMPLATE, items: [item] }),
    );
  });
  it("encodes accents, ñ, &, # and newlines", () => {
    const url = buildWhatsAppUrl({
      number: "5493510000000",
      template: "Cotización & más #1",
      items: [{ code: "A", name: "NIÑO", quantity: 1 }],
    })!;
    const query = url.split("?text=")[1]!;
    expect(query).toContain("Cotizaci%C3%B3n%20%26%20m%C3%A1s%20%231");
    expect(query).toContain("%0A");
    expect(query).toContain("NI%C3%91O");
    expect(query).not.toMatch(/[&# \n]/);
  });
  it("returns null without a usable number (never builds a link)", () => {
    for (const number of [null, undefined, "", "   ", "abc"]) {
      expect(buildWhatsAppUrl({ number, template: TEMPLATE, items: [item] })).toBeNull();
    }
  });
});
