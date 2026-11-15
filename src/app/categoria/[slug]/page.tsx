import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGrid } from "../../../components/ProductCard";
import { buildPageMetadata } from "../../../lib/seo/metadata";
import { listCategories, listProducts } from "../../../server/catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const [categories, products] = await Promise.all([
    listCategories(),
    listProducts({ categorySlug: slug }),
  ]);
  const category = categories.find((c) => c.slug === slug);
  return category ? { category, products } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Categoría no encontrada" };
  const { category, products } = data;
  return buildPageMetadata({
    title: category.name,
    description: `${category.name} — ${products.length} ${products.length === 1 ? "producto" : "productos"}. Consultá cotización con SICOR.`,
    path: `/categoria/${category.slug}`,
    image: products[0]?.images[0],
  });
}

export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { category, products } = data;
  return (
    <section className="section">
      <nav aria-label="Migas de pan" className="crumbs">
        <Link href="/">Inicio</Link> <span aria-hidden>/</span> <span>{category.name}</span>
      </nav>
      <h1 className="page-title">{category.name}</h1>
      <p className="muted">
        {products.length} {products.length === 1 ? "producto" : "productos"}
      </p>
      {products.length > 0 ? (
        <ProductGrid products={products} />
      ) : (
        <p className="empty">Todavía no hay productos en esta categoría.</p>
      )}
    </section>
  );
}
