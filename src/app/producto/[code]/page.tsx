import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "../../../components/ProductDetail";
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
  return <ProductDetail product={product} variant="page" />;
}
