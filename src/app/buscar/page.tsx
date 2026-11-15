import type { Metadata } from "next";
import { ProductGrid } from "../../components/ProductCard";
import { SearchBox } from "../../components/SearchBox";
import { buildPageMetadata } from "../../lib/seo/metadata";
import { listProducts } from "../../server/catalog";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string | string[] }> };

const clean = (q: string | string[] | undefined) =>
  (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 100) ?? "";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = clean((await searchParams).q);
  return {
    ...buildPageMetadata({
      title: q ? `Búsqueda: ${q}` : "Buscar productos",
      description: "Buscá productos del catálogo comercial SICOR por nombre, marca o código.",
      path: q ? `/buscar?q=${encodeURIComponent(q)}` : "/buscar",
    }),
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const q = clean((await searchParams).q);
  const results = q ? await listProducts({ search: q }) : [];
  return (
    <section className="section">
      <h1 className="page-title">Buscar</h1>
      <SearchBox defaultValue={q} />
      {q ? (
        <>
          <p className="muted" role="status">
            {results.length} {results.length === 1 ? "resultado" : "resultados"} para “{q}”
          </p>
          {results.length > 0 ? (
            <ProductGrid products={results} />
          ) : (
            <p className="empty">No encontramos productos. Probá con otra palabra o revisá las categorías.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
