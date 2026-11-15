import Link from "next/link";
import { categoryIcon } from "../lib/catalog/categories";
import { catalogReturnHref } from "../lib/nav/close";
import type { CatalogProduct } from "../server/catalog";
import { AddToQuoteButton } from "./AddToQuoteButton";
import { ProductDocuments } from "./ProductDocuments";
import { ProductImage } from "./ProductImage";
import { VariantChips } from "./VariantChips";

export const PRODUCT_TITLE_ID = "product-title";

/**
 * Product content shared by the full page (`/producto/<code>`) and the sheet over the catalog.
 * `page` adds the "← Volver al catálogo" link and breadcrumbs; the sheet has its own close bar.
 */
export function ProductDetail({
  product,
  variant = "page",
}: {
  product: CatalogProduct;
  variant?: "page" | "sheet";
}) {
  const [main, ...rest] = product.images;
  return (
    <article className={variant === "sheet" ? "section product product--sheet" : "section product"}>
      {variant === "page" ? (
        <>
          <Link href={catalogReturnHref(product.category?.slug)} className="backlink">
            <span aria-hidden>←</span> Volver al catálogo
          </Link>
          <nav aria-label="Migas de pan" className="crumbs">
            <Link href="/">Inicio</Link> <span aria-hidden>/</span>{" "}
            {product.category ? (
              <>
                <Link href={catalogReturnHref(product.category.slug)}>{product.category.name}</Link>{" "}
                <span aria-hidden>/</span>{" "}
              </>
            ) : null}
            <span>{product.code}</span>
          </nav>
        </>
      ) : null}

      <div className="product__gallery">
        <ProductImage
          src={main}
          alt={product.name}
          code={product.code}
          icon={categoryIcon(product.category?.slug ?? "otros")}
          priority
        />
        {rest.length > 0 ? (
          <ul className="thumbs">
            {rest.map((src) => (
              <li key={src}>
                <ProductImage src={src} alt={`${product.name} — vista adicional`} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="product__info">
        <h1 className="page-title" id={PRODUCT_TITLE_ID}>
          {product.name}
        </h1>
        <dl className="facts">
          <div>
            <dt>Código</dt>
            <dd>{product.code}</dd>
          </div>
          {product.brand ? (
            <div>
              <dt>Marca</dt>
              <dd>{product.brand}</dd>
            </div>
          ) : null}
          {product.unit ? (
            <div>
              <dt>Unidad</dt>
              <dd>{product.unit}</dd>
            </div>
          ) : null}
        </dl>

        {product.description ? <p className="note">{product.description}</p> : null}

        <VariantChips name="talle" label="Talle" options={product.sizes} />
        <VariantChips name="color" label="Color" options={product.colors} />

        {product.price ? <p className="price">{product.price}</p> : null}
        <p className="quote-label">Consultar cotización</p>
        <AddToQuoteButton
          code={product.code}
          name={product.name}
          sizes={product.sizes}
          colors={product.colors}
        />
        <ProductDocuments documents={product.documents} />
      </div>
    </article>
  );
}
