import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddToQuoteButton } from "../../src/components/AddToQuoteButton";
import { CategoryList, badgeNumber } from "../../src/components/CategoryList";
import { ProductCard } from "../../src/components/ProductCard";
import { ProductDocuments } from "../../src/components/ProductDocuments";
import { VariantChips } from "../../src/components/VariantChips";
import type { CatalogItem } from "../../src/lib/catalog/filters";

const product = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  code: "CAM 1",
  name: "Camisa Ombú",
  brand: null,
  category: "indumentaria-laboral",
  image: "/images/CAM1/a.jpg",
  variants: false,
  price: null,
  hasFicha: false,
  ...over,
});

describe("UI smoke renders", () => {
  it("numbers categories 01.. with alternating red/dark badges and counts", () => {
    expect(badgeNumber(0)).toBe("01");
    expect(badgeNumber(9)).toBe("10");
    const html = renderToStaticMarkup(
      createElement(CategoryList, {
        categories: [
          { id: 1, slug: "a", name: "Indumentaria laboral", sortOrder: 1, count: 3 },
          { id: 2, slug: "b", name: "Calzado de seguridad", sortOrder: 2, count: 1 },
        ],
      }),
    );
    expect(html).toContain('href="/categoria/a"');
    expect(html).toMatch(/badge--red[^>]*>01</);
    expect(html).toMatch(/badge--dark[^>]*>02</);
    expect(html).toContain("3 productos");
    expect(html).toContain("1 producto<");
  });

  it("product card shows Consultar cotización and no price unless provided", () => {
    const none = renderToStaticMarkup(createElement(ProductCard, { product: product() }));
    expect(none).toContain("Consultar cotización");
    expect(none).toContain('href="/producto/CAM%201"');
    expect(none).not.toContain("card__price");
    const priced = renderToStaticMarkup(createElement(ProductCard, { product: product({ price: "$ 100" }) }));
    expect(priced).toContain("$ 100");
  });

  it("product card shows brand and code, lazy-loads fixed-size photos", () => {
    const html = renderToStaticMarkup(createElement(ProductCard, { product: product({ brand: "OMBU" }) }));
    expect(html).toContain("OMBU");
    expect(html).toContain("Cód. CAM 1");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="600"');
    expect(html).toContain('height="600"');
  });

  it("product card without photo renders the 'Sin foto' placeholder with the code", () => {
    const html = renderToStaticMarkup(createElement(ProductCard, { product: product({ image: null }) }));
    expect(html).toContain("img-box--empty");
    expect(html).toContain("Sin foto");
    expect(html).toContain("CAM 1");
    expect(html).not.toContain("<img");
  });

  it("card shows an accessible ficha técnica PDF link that opens in a new tab, only when the product has one", () => {
    const withFicha = renderToStaticMarkup(
      createElement(ProductCard, {
        product: product({ hasFicha: true, fichaUrl: "/docs/CAM%201/0-ficha.pdf" }),
        onAdd: () => {},
      }),
    );
    expect(withFicha).toContain("Ficha técnica");
    expect(withFicha).toContain('aria-label="Ver ficha técnica (PDF)"');
    expect(withFicha).toContain('href="/docs/CAM%201/0-ficha.pdf"');
    expect(withFicha).toContain('target="_blank"');
    expect(withFicha).toContain('rel="noopener noreferrer"');
    expect(withFicha).toContain("#i-pdf");
    // link, not a button: it cannot trigger add-to-cart; the add button is a separate control
    expect(withFicha.match(/<button/g)).toHaveLength(1);
    const without = renderToStaticMarkup(createElement(ProductCard, { product: product(), onAdd: () => {} }));
    expect(without).not.toContain("Ficha técnica");
    expect(without).not.toContain("_blank");
    const flagOnly = renderToStaticMarkup(createElement(ProductCard, { product: product({ hasFicha: true }) }));
    expect(flagOnly).not.toContain("_blank");
  });

  it("card actions: ficha técnica + Ver detalle + Agregar; no ficha link without a ficha", () => {
    const withFicha = renderToStaticMarkup(
      createElement(ProductCard, {
        product: product({ hasFicha: true, fichaUrl: "/docs/x.pdf" }),
        onAdd: () => {},
      }),
    );
    expect(withFicha).toContain("Ficha técnica");
    expect(withFicha).toContain("Ver detalle");
    expect(withFicha).toContain("Agregar");
    expect(withFicha).not.toContain("Descargar");
    const without = renderToStaticMarkup(createElement(ProductCard, { product: product(), onAdd: () => {} }));
    expect(without).not.toContain("Ficha técnica");
    expect(without).toContain("Ver detalle");
    expect(without).toContain('href="/producto/CAM%201"');
  });

  it("in-cart product shows a − N + stepper instead of Agregar", () => {
    const html = renderToStaticMarkup(createElement(ProductCard, { product: product(), quantity: 3, onAdd: () => {} }));
    expect(html).toContain('aria-label="Quitar uno"');
    expect(html).toContain('aria-label="Agregar uno"');
    expect(html).toMatch(/<output[^>]*aria-live="polite"[^>]*>3</);
    expect(html).not.toContain("<span>Agregar</span>");
    expect(html).not.toContain("en tu cotización");
    expect(html).not.toContain("Agregado");
  });

  it("variant product keeps Elegir opciones and never gets a stepper", () => {
    const html = renderToStaticMarkup(
      createElement(ProductCard, { product: product({ variants: true }), quantity: 2, onAdd: () => {} }),
    );
    expect(html).toContain("Elegir opciones");
    expect(html).not.toContain("Quitar uno");
    expect(html).not.toContain("<output");
  });

  it("card with variants and ficha keeps both the options link and the ficha link", () => {
    const html = renderToStaticMarkup(
      createElement(ProductCard, { product: product({ variants: true, hasFicha: true, fichaUrl: "/docs/x.pdf" }) }),
    );
    expect(html).toContain("Elegir opciones");
    expect(html).toContain('href="/docs/x.pdf"');
  });

  it("product page documents: prominent ficha button plus a certifications list of the other PDFs", () => {
    const docs = [
      { kind: "ficha" as const, label: "Ficha técnica", url: "/docs/Z/0-ficha.pdf" },
      { kind: "certificacion" as const, label: "Licencia IRAM", url: "/docs/Z/1-iram.pdf" },
      { kind: "certificacion" as const, label: "NIOSH", url: "/docs/Z/2-niosh.pdf" },
    ];
    const html = renderToStaticMarkup(createElement(ProductDocuments, { documents: docs }));
    expect(html).toContain("Ver ficha técnica");
    expect(html).toContain('href="/docs/Z/0-ficha.pdf"');
    expect(html).toContain("Certificaciones y documentos");
    expect(html).toContain("Licencia IRAM");
    expect(html).toContain('href="/docs/Z/2-niosh.pdf"');
    expect(html.match(/target="_blank"/g)).toHaveLength(3);
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(3);
    // ficha is not repeated inside the list
    expect(html.match(/\/docs\/Z\/0-ficha\.pdf/g)).toHaveLength(1);
    const onlyCerts = renderToStaticMarkup(createElement(ProductDocuments, { documents: docs.slice(1) }));
    expect(onlyCerts).not.toContain("Ver ficha técnica");
    expect(onlyCerts).toContain("Certificaciones y documentos");
    const onlyFicha = renderToStaticMarkup(createElement(ProductDocuments, { documents: docs.slice(0, 1) }));
    expect(onlyFicha).toContain("Ver ficha técnica");
    expect(onlyFicha).not.toContain("Certificaciones");
    expect(renderToStaticMarkup(createElement(ProductDocuments, { documents: [] }))).toBe("");
  });

  it("quick add: plain product gets an Agregar button; variants route to the product page; added state shows quantity", () => {
    const onAdd = () => {};
    const plain = renderToStaticMarkup(createElement(ProductCard, { product: product(), onAdd }));
    expect(plain).toContain("data-quote-add");
    expect(plain).toContain("Agregar");
    const added = renderToStaticMarkup(createElement(ProductCard, { product: product(), onAdd, quantity: 3 }));
    expect(added).toContain("Quitar uno");
    const variant = renderToStaticMarkup(createElement(ProductCard, { product: product({ variants: true }), onAdd }));
    expect(variant).not.toContain("data-quote-add");
    expect(variant).not.toContain("<button");
    expect(variant).toContain("Elegir opciones");
    expect(variant).toMatch(/class="add"[^>]*href="\/producto\/CAM%201"|href="\/producto\/CAM%201"[^>]*class="add"/);
  });

  it("add-to-quote placeholder carries data attributes and is disabled", () => {
    const html = renderToStaticMarkup(createElement(AddToQuoteButton, { code: "X1", name: "Casco" }));
    expect(html).toContain('data-code="X1"');
    expect(html).toContain('data-name="Casco"');
    expect(html).toContain("data-quote-add");
    expect(html).toContain("disabled");
  });

  it("variant chips render only when options exist", () => {
    expect(renderToStaticMarkup(createElement(VariantChips, { name: "talle", label: "Talle", options: [] }))).toBe("");
    const html = renderToStaticMarkup(
      createElement(VariantChips, { name: "talle", label: "Talle", options: ["M", "L"] }),
    );
    expect(html).toContain('name="talle"');
    expect(html).toContain("<span>M</span>");
  });
});
