import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuoteLine } from "../../src/components/quote/QuoteLine";
import { QuoteSummary } from "../../src/components/quote/QuoteSummary";
import { buildQuoteMessage, buildWhatsAppUrl } from "../../src/lib/cart/whatsapp";

const item = { code: "A", name: "Bota", quantity: 2, talle: "42", color: "Negro" };
const state = { items: [item], customerNote: "Ana" };
describe("quote render", () => {
  it("renders photo, brand, variants, compact stepper, remove label and collapsed note", () => {
    const html = renderToStaticMarkup(createElement(QuoteLine, { item, media: { image: "/a.jpg", brand: "Marca" }, onRemove: () => {} }));
    expect(html).toContain('src="/a.jpg"');
    expect(html).toContain("Marca");
    expect(html).toContain("Talle 42 · Color Negro");
    expect(html).toContain('aria-label="Cantidad de Bota"');
    expect(html).toMatch(/<output[^>]*>2<\/output>/);
    expect(html).toContain('aria-label="Menos"');
    expect(html).toContain('aria-label="Más"');
    expect(html).toContain('aria-label="Quitar Bota"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/hidden=""/);
  });
  it("renders placeholder and opens an existing note; no variants for a plain line", () => {
    const html = renderToStaticMarkup(createElement(QuoteLine, { item: { code: "B", name: "Guante", quantity: 1, note: "Urgente" }, media: { image: null, brand: null }, onRemove: () => {} }));
    expect(html).toContain("Sin foto");
    expect(html).toContain("B");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Talle");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('value="Urgente"');
    expect(html).not.toContain('hidden=""');
  });
  it("renders exact WhatsApp href, SVG and safe link attributes; preserves formatter", () => {
    const props = { cart: state, whatsappNumber: "549351123", messageTemplate: "Hola" };
    const html = renderToStaticMarkup(createElement(QuoteSummary, props));
    expect(html).toContain(`href="${buildWhatsAppUrl({ number: props.whatsappNumber, template: "Hola", ...state })}"`);
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('viewBox="0 0 360 362"');
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('<span class="qc-send-logo"><svg');
    const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
    const wrapper = css.match(/\.qc-send-logo\s*\{([^}]+)\}/)![1];
    expect(wrapper).toMatch(/background:\s*transparent\s*;/);
    expect(wrapper).not.toMatch(/(?:white|#fff|var\(--white\))/i);
    const spec = readFileSync(new URL("../../odd/tasks/quote-cart-redesign.md", import.meta.url), "utf8");
    const suppliedPath = spec.match(/<path fill="#25D366" fill-rule="evenodd" d="([^"]+)"/)![1];
    expect(html).toContain(`d="${suppliedPath}"`);
    expect(html).toContain("1 producto · 2 unidades");
    expect(html).toContain("Ver mensaje");
    expect(html).toContain(buildQuoteMessage({ template: "Hola", ...state }));
    expect(html).toContain("Vaciar cotización");
  });
  it("renders a disabled send button with SVG and explicit unavailable message", () => {
    const html = renderToStaticMarkup(createElement(QuoteSummary, { cart: state, whatsappNumber: null, messageTemplate: "Hola" }));
    expect(html).not.toContain("https://wa.me/");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/);
    expect(html).toContain("WhatsApp no configurado");
    expect(html).toContain('fill="currentColor"');
  });
});
