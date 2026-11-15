import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddToQuoteButton } from "../../src/components/AddToQuoteButton";
import { CategoryList, badgeNumber } from "../../src/components/CategoryList";
import { ProductCard } from "../../src/components/ProductCard";
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

  it("quick add: plain product gets an Agregar button; variants route to the product page; added state shows quantity", () => {
    const onAdd = () => {};
    const plain = renderToStaticMarkup(createElement(ProductCard, { product: product(), onAdd }));
    expect(plain).toContain("data-quote-add");
    expect(plain).toContain("Agregar");
    const added = renderToStaticMarkup(createElement(ProductCard, { product: product(), onAdd, quantity: 3 }));
    expect(added).toContain("Agregado (3)");
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
