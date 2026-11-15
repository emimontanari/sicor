import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddToQuoteButton } from "../../src/components/AddToQuoteButton";
import { CategoryList, badgeNumber } from "../../src/components/CategoryList";
import { ProductCard } from "../../src/components/ProductCard";
import { VariantChips } from "../../src/components/VariantChips";
import type { CatalogProduct } from "../../src/server/catalog/read";

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  code: "CAM 1",
  name: "Camisa Ombú",
  description: null,
  images: ["/images/CAM1/a.jpg"],
  category: null,
  brand: null,
  unit: null,
  variants: [],
  colors: [],
  sizes: [],
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
