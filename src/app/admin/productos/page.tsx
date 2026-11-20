import type { Metadata } from "next";
import Link from "next/link";
import { BulkForm } from "../../../components/admin/products/BulkForm";
import { FilterChips } from "../../../components/admin/products/FilterChips";
import { FilterDrawer } from "../../../components/admin/products/FilterDrawer";
import { activeFilterCount, filterChips } from "../../../lib/admin/products/filters";
import { BULK_FORM_ID } from "../../../lib/admin/products/bulk";
import { PAGE_SIZE_LABELS, PAGE_SIZE_OPTIONS, listHref, parseListQuery } from "../../../lib/admin/products/query";
import { getAdminDb } from "../../../lib/admin/products/db";
import { listAdminCategories, listAdminProducts } from "../../../server/admin";
import { OTHERS_SLUG } from "../../../server/catalog";
import { requireAdmin } from "../../../server/auth/session";
import { RowFeedback, RowMenu } from "../../../components/admin/products/RowActions";
import { editHref } from "../../../lib/admin/products/menu";
import { reviewAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Productos", robots: { index: false, follow: false } };

/** Drawer category counts (global, like the Estado counts): one light call per category, totals only. */
async function countByCategory(db: ReturnType<typeof getAdminDb>, slugs: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    slugs.map(async (slug) => [slug, (await listAdminProducts(db, { categorySlug: slug, pageSize: 1 })).total] as const),
  );
  return Object.fromEntries(entries);
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProductsPage({ searchParams }: Props) {
  await requireAdmin();
  const state = parseListQuery(await searchParams);
  const db = getAdminDb();
  const categories = await listAdminCategories(db);
  const catOptions = categories.some((c) => c.slug === OTHERS_SLUG) ? categories : [...categories, { id: -1, slug: OTHERS_SLUG, name: "Otros" }];
  const [list, categoryCounts] = await Promise.all([
    listAdminProducts(db, {
      filter: state.filter,
      categorySlug: state.categoria,
      search: state.q,
      page: state.page,
      pageSize: state.pageSize === "todos" ? "all" : Number(state.pageSize),
    }),
    countByCategory(db, catOptions.map((c) => c.slug)),
  ]);
  const lastPage = Math.max(Math.ceil(list.total / list.pageSize), 1);
  const current = { ...state, page: list.page };
  const isNuevos = state.filtro === "nuevos";
  const isEliminados = state.filtro === "eliminados";
  const listUrl = listHref(current, {});

  return (
    <main className="pr-page">
      <h1>Productos</h1>
      <form method="get" action="/admin/productos" className="pr-toolbar" role="search">
        {state.filtro !== "todos" ? <input type="hidden" name="filtro" value={state.filtro} /> : null}
        {state.categoria ? <input type="hidden" name="categoria" value={state.categoria} /> : null}
        <input type="search" name="q" defaultValue={state.q} placeholder="Buscar nombre, marca o código" aria-label="Buscar" />
        <FilterDrawer state={current} categories={catOptions} counts={list.counts} categoryCounts={categoryCounts} total={list.total} activeCount={activeFilterCount(current)} />
      </form>
      <FilterChips chips={filterChips(current, catOptions)} />

      {isEliminados ? null : (
        <BulkForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          pageRows={list.items.length}
          total={list.total}
          filterState={current}
        />
      )}

      <p className="pr-muted" aria-live="polite">
        {list.total} producto{list.total === 1 ? "" : "s"} · página {list.page} de {lastPage}
        {list.total > 25 ? (
          <>
            {" · por página: "}
            <span className="pr-pagesize" aria-label="Productos por página">
              {PAGE_SIZE_OPTIONS.map((o) => (
                <Link
                  key={o}
                  href={listHref(current, { pageSize: o })}
                  scroll={false}
                  aria-current={state.pageSize === o ? "true" : undefined}
                >
                  {PAGE_SIZE_LABELS[o]}
                </Link>
              ))}
            </span>
          </>
        ) : null}
      </p>

      <RowFeedback>
      {list.items.length === 0 ? (
        <p className="admin-card">No hay productos para este filtro.</p>
      ) : (
        <ul className="pr-list">
          {list.items.map((p) => (
            <li key={p.code} className="admin-card pr-row">
              {isEliminados ? <span /> : <input type="checkbox" name="code" value={p.code} form={BULK_FORM_ID} aria-label={`Seleccionar ${p.name}`} className="pr-row__check" />}
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
                  {p.archived ? (
                    <span className="pr-badge pr-badge--off">Eliminado</span>
                  ) : (
                    <span className={p.visible ? "pr-badge pr-badge--on" : "pr-badge"}>{p.visible ? "Visible" : "Oculto"}</span>
                  )}
                  {p.isNew ? <span className="pr-badge pr-badge--new">Nuevo</span> : null}
                  {p.status === "discontinued" ? <span className="pr-badge pr-badge--off">Discontinuado</span> : null}
                </span>
              </div>
              <div className="pr-row__actions">
                {isNuevos && p.isNew && !p.archived ? (
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
                ) : null}
                <RowMenu code={p.code} name={p.name} visible={p.visible} archived={p.archived} status={p.status} reviewed={p.reviewed} editHref={editHref(p.code, listUrl)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      </RowFeedback>

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
