import type { Metadata } from "next";
import { MappingRow } from "../../../components/admin/categories/MappingRow";
import { filterMappings, parseMappingFilter } from "../../../lib/admin/forms/mappings";
import { withDb } from "../../../lib/admin/forms/with-db";
import { listAdminCategories, listMappings } from "../../../server/admin";
import { requireAdmin } from "../../../server/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Categorías", robots: { index: false, follow: false } };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const filter = parseMappingFilter(await searchParams);
  const { rows, cats } = await withDb(async (db) => ({
    rows: await listMappings(db),
    cats: await listAdminCategories(db),
  }));
  const shown = filterMappings(rows, filter);
  const otros = rows.filter((r) => r.effectiveCategory === null).length;
  return (
    <main className="cat-page">
      <h1>Categorías de Masefer</h1>
      <form method="get" className="admin-card cat-filter">
        <input type="search" name="q" defaultValue={filter.q} placeholder="Buscar familia…" aria-label="Buscar" />
        <label className="cat-filter__check">
          <input type="checkbox" name="sin" value="1" defaultChecked={filter.unmapped} />
          Sin asignar (Otros) · {otros}
        </label>
        <button type="submit" className="admin-btn">Filtrar</button>
      </form>
      <p>{shown.length} de {rows.length} familias</p>
      <ul className="cat-list">
        {shown.map((r) => (
          <MappingRow
            key={`${r.metaCategory}|${r.family}|${r.subfamily}`}
            metaCategory={r.metaCategory}
            family={r.family}
            subfamily={r.subfamily}
            productCount={r.productCount}
            mappedId={r.mappedCategory?.id ?? null}
            effectiveName={r.effectiveCategory?.name ?? null}
            categories={cats.map((c) => ({ id: c.id, name: c.name }))}
          />
        ))}
      </ul>
    </main>
  );
}
