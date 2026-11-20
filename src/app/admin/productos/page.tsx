import type { Metadata } from "next";
import Link from "next/link";
import { BulkForm } from "../../../components/admin/products/BulkForm";
import { FilterChips } from "../../../components/admin/products/FilterChips";
import { FilterDrawer } from "../../../components/admin/products/FilterDrawer";
import { activeFilterCount, filterChips } from "../../../lib/admin/products/filters";
import { PAGE_SIZE, listHref, parseListQuery } from "../../../lib/admin/products/query";
import { getAdminDb } from "../../../lib/admin/products/db";
import { listAdminCategories, listAdminProducts } from "../../../server/admin";
import { OTHERS_SLUG } from "../../../server/catalog";
import { requireAdmin } from "../../../server/auth/session";
import { BULK_FORM_ID } from "../../../components/admin/products/BulkForm";
import { reviewAction, toggleVisibilityAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Productos", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProductsPage({ searchParams }: Props) {
  await requireAdmin();
  const state = parseListQuery(await searchParams);
  const db = getAdminDb();
  const [list, categories] = await Promise.all([
    listAdminProducts(db, { filter: state.filter, categorySlug: state.categoria, search: state.q, page: state.page, pageSize: PAGE_SIZE }),
    listAdminCategories(db),
  ]);
  const lastPage = Math.max(Math.ceil(list.total / list.pageSize), 1);
  const current = { ...state, page: list.page };
  const isNuevos = state.filtro === "nuevos";
  const catOptions = categories.some((c) => c.slug === OTHERS_SLUG) ? categories : [...categories, { id: -1, slug: OTHERS_SLUG, name: "Otros" }];

  return (
    <main className="pr-page">
      <h1>Productos</h1>
      <form method="get" action="/admin/productos" className="pr-toolbar" role="search">
        {state.filtro !== "todos" ? <input type="hidden" name="filtro" value={state.filtro} /> : null}
        {state.categoria ? <input type="hidden" name="categoria" value={state.categoria} /> : null}
        <input type="search" name="q" defaultValue={state.q} placeholder="Buscar nombre, marca o código" aria-label="Buscar" />
        <FilterDrawer state={current} categories={catOptions} counts={list.counts} total={list.total} activeCount={activeFilterCount(current)} />
      </form>
      <FilterChips chips={filterChips(current, catOptions)} />

      <BulkForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />

      <p className="pr-muted" aria-live="polite">
        {list.total} producto{list.total === 1 ? "" : "s"} · página {list.page} de {lastPage}
      </p>

      {list.items.length === 0 ? (
        <p className="admin-card">No hay productos para este filtro.</p>
      ) : (
        <ul className="pr-list">
          {list.items.map((p) => (
            <li key={p.code} className="admin-card pr-row">
              <input type="checkbox" name="code" value={p.code} form={BULK_FORM_ID} aria-label={`Seleccionar ${p.name}`} className="pr-row__check" />
              <div className="pr-thumb">
                {p.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnailUrl} alt="" loading="lazy" width={64} height={64} />
                ) : (
                  <span aria-hidden>—</span>
                )}
              </div>
              <div className="pr-row__info">
                <Link href={`/admin/productos/${encodeURIComponent(p.code)}`} className="pr-row__name">
                  {p.name}
                </Link>
                <span className="pr-muted">
                  {p.code}
                  {p.brand ? ` · ${p.brand}` : ""} · {p.category?.name ?? "Otros"}
                </span>
                <span className="pr-badges">
                  <span className={p.visible ? "pr-badge pr-badge--on" : "pr-badge"}>{p.visible ? "Visible" : "Oculto"}</span>
                  {p.isNew ? <span className="pr-badge pr-badge--new">Nuevo</span> : null}
                  {p.status === "discontinued" ? <span className="pr-badge pr-badge--off">Discontinuado</span> : null}
                </span>
              </div>
              <div className="pr-row__actions">
                {isNuevos && p.isNew ? (
                  <>
                    <form action={reviewAction}>
                      <input type="hidden" name="code" value={p.code} />
                      <button type="submit" name="intent" value="publish" className="admin-btn admin-btn--sm">
                        Publicar
                      </button>
                    </form>
                    <form action={reviewAction}>
                      <input type="hidden" name="code" value={p.code} />
                      <button type="submit" name="intent" value="dismiss" className="admin-btn admin-btn--sm admin-btn--ghost">
                        Descartar
                      </button>
                    </form>
                  </>
                ) : p.status === "active" ? (
                  <form action={toggleVisibilityAction}>
                    <input type="hidden" name="code" value={p.code} />
                    <input type="hidden" name="visible" value={String(!p.visible)} />
                    <button type="submit" className="admin-btn admin-btn--sm admin-btn--ghost">
                      {p.visible ? "Ocultar" : "Mostrar"}
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 ? (
        <nav aria-label="Paginación" className="pr-pager">
          {list.page > 1 ? <Link href={listHref(current, { page: list.page - 1 })}>← Anterior</Link> : <span />}
          <span className="pr-muted">
            {list.page} / {lastPage}
          </span>
          {list.page < lastPage ? <Link href={listHref(current, { page: list.page + 1 })}>Siguiente →</Link> : <span />}
        </nav>
      ) : null}
    </main>
  );
}
