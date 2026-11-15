import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductDetail } from "../../src/components/ProductDetail";
import type { CatalogProduct } from "../../src/server/catalog";

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct =>
  ({
    code: "CAM 1",
    name: "Camisa Ombú",
    brand: "Ombú",
    unit: null,
    description: "Camisa de trabajo",
    price: null,
    category: { id: 1, slug: "indumentaria-laboral", name: "Indumentaria laboral" },
    images: ["/images/CAM1/a.jpg"],
    sizes: ["M", "L"],
    colors: [],
    documents: [{ kind: "ficha", label: "Ficha técnica", url: "/docs/CAM1/ficha.pdf" }],
    ...over,
  }) as CatalogProduct;

describe("ProductDetail", () => {
  it("page variant: prominent back link to the product category, plus content", () => {
    const html = renderToStaticMarkup(createElement(ProductDetail, { product: product(), variant: "page" }));
    expect(html).toContain('class="backlink"');
    expect(html).toContain('href="/?categoria=indumentaria-laboral"');
    expect(html).toContain("Volver al catálogo");
    expect(html).toContain("Camisa Ombú");
    expect(html).toContain("Talle");
    expect(html).toContain("Agregar a la cotización");
    expect(html).toContain("/docs/CAM1/ficha.pdf");
  });
  it("page variant without category links back to /", () => {
    const html = renderToStaticMarkup(createElement(ProductDetail, { product: product({ category: null }) }));
    expect(html).toContain('class="backlink" href="/"');
  });
  it("sheet variant: same content, no back link or breadcrumbs (the sheet has its own close bar)", () => {
    const html = renderToStaticMarkup(createElement(ProductDetail, { product: product(), variant: "sheet" }));
    expect(html).not.toContain("backlink");
    expect(html).not.toContain("Migas de pan");
    expect(html).toContain('id="product-title"');
    expect(html).toContain("Agregar a la cotización");
    expect(html).toContain("Talle");
  });
});
