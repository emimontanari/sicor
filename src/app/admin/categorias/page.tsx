import type { Metadata } from "next";
import { MappingRow } from "../../../components/admin/categories/MappingRow";
import { withDb } from "../../../lib/admin/forms/with-db";
import { listAdminCategories, listMappings } from "../../../server/admin";
import { requireAdmin } from "../../../server/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Categorías", robots: { index: false, follow: false } };

export default async function CategoriesPage() {
  await requireAdmin();
  const { rows, cats } = await withDb(async (db) => ({
    rows: await listMappings(db),
    cats: await listAdminCategories(db),
  }));
  const catsProps = cats.map((c) => ({ id: c.id, name: c.name }));
  const unassigned = rows.filter((r) => r.effectiveCategory === null);
  const assigned = rows.filter((r) => r.effectiveCategory !== null);
  return (
    <main className="cat-page">
      <h1>Categorías</h1>
      <p className="cat-page__hint">
        Elegí la categoría de SICOR de cada familia de Masefer. Las que quedan sin asignar aparecen en «Otros» en el catálogo.
      </p>
      <section aria-labelledby="cat-unassigned">
        <h2 id="cat-unassigned">Sin asignar ({unassigned.length})</h2>
        {unassigned.length === 0 ? (
          <p className="cat-page__empty">Todas las familias tienen categoría.</p>
        ) : (
          <ul className="cat-list">
            {unassigned.map((r) => (
              <MappingRow
                key={`${r.metaCategory}|${r.family}|${r.subfamily}`}
                metaCategory={r.metaCategory}
                family={r.family}
                subfamily={r.subfamily}
                productCount={r.productCount}
                mappedId={r.mappedCategory?.id ?? null}
                effectiveName={r.effectiveCategory?.name ?? null}
                categories={catsProps}
              />
            ))}
          </ul>
        )}
      </section>
      <details className="cat-assigned">
        <summary>Asignadas ({assigned.length})</summary>
        <ul className="cat-list">
          {assigned.map((r) => (
            <MappingRow
              key={`${r.metaCategory}|${r.family}|${r.subfamily}`}
              metaCategory={r.metaCategory}
              family={r.family}
              subfamily={r.subfamily}
              productCount={r.productCount}
              mappedId={r.mappedCategory?.id ?? null}
              effectiveName={r.effectiveCategory?.name ?? null}
              categories={catsProps}
            />
          ))}
        </ul>
      </details>
    </main>
  );
}
