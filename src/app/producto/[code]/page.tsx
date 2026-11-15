import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToQuoteButton } from "../../../components/AddToQuoteButton";
import { ProductDocuments } from "../../../components/ProductDocuments";
import { ProductImage } from "../../../components/ProductImage";
import { VariantChips } from "../../../components/VariantChips";
import { categoryIcon } from "../../../lib/catalog/categories";
import { buildPageMetadata } from "../../../lib/seo/metadata";
import { getProduct } from "../../../server/catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const product = await getProduct(decodeURIComponent(code));
  if (!product) return { title: "Producto no encontrado" };
  return buildPageMetadata({
    title: product.name,
    description:
      product.description ??
      `${product.name}${product.brand ? ` — ${product.brand}` : ""}. Consultar cotización con SICOR.`,
    path: `/producto/${encodeURIComponent(product.code)}`,
    image: product.images[0],
  });
}

export default async function ProductPage({ params }: Params) {
  const { code } = await params;
  const product = await getProduct(decodeURIComponent(code));
  if (!product) notFound();
  const [main, ...rest] = product.images;

  return (
    <article className="section product">
      <nav aria-label="Migas de pan" className="crumbs">
        <Link href="/">Inicio</Link> <span aria-hidden>/</span>{" "}
        {product.category ? (
          <>
            <Link href={`/?categoria=${encodeURIComponent(product.category.slug)}`}>{product.category.name}</Link>{" "}
            <span aria-hidden>/</span>{" "}
          </>
        ) : null}
        <span>{product.code}</span>
      </nav>

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
        <h1 className="page-title">{product.name}</h1>
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
