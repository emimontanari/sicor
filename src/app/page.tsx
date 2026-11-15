import type { Metadata } from "next";
import { CategoryList } from "../components/CategoryList";
import { ProductGrid } from "../components/ProductCard";
import { SearchBox } from "../components/SearchBox";
import { buildPageMetadata, SITE_DESCRIPTION } from "../lib/seo/metadata";
import { listCategories, listProducts } from "../server/catalog";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    ...buildPageMetadata({
      title: "CATÁLOGO COMERCIAL | SICOR",
      description: SITE_DESCRIPTION,
      path: "/",
    }),
    title: { absolute: "CATÁLOGO COMERCIAL | SICOR" },
  };
}

const FEATURED_SLUG = "productos-destacados";
const FEATURED_LIMIT = 8;

export default async function Home() {
  const [categories, featured, all] = await Promise.all([
    listCategories(),
    listProducts({ categorySlug: FEATURED_SLUG }),
    listProducts(),
  ]);
  const showcase = (featured.length > 0 ? featured : all).slice(0, FEATURED_LIMIT);
  const visibleCategories = categories.filter((c) => c.count > 0 || c.id !== null);

  return (
    <>
      <section className="hero">
        <h1>
          CATÁLOGO COMERCIAL
          <span className="hero__brand">| SICOR</span>
        </h1>
        <div className="hero__rule" aria-hidden />
        <p className="hero__lead">Soluciones para la industria, el trabajo y la seguridad.</p>
        <SearchBox />
      </section>

      <section className="section" aria-labelledby="h-categorias">
        <h2 id="h-categorias" className="section__title">
          Categorías
        </h2>
        <CategoryList categories={visibleCategories} />
      </section>

      {showcase.length > 0 ? (
        <section className="section" aria-labelledby="h-destacados">
          <h2 id="h-destacados" className="section__title">
            {featured.length > 0 ? "Productos destacados" : "Productos"}
          </h2>
          <ProductGrid products={showcase} />
        </section>
      ) : null}
    </>
  );
}
