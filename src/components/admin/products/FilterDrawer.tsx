"use client";

import Link from "next/link";
import { useState } from "react";
import { ESTADO_OPTIONS, clearFiltersHref, optionHref } from "../../../lib/admin/products/filters";
import type { ListState } from "../../../lib/admin/products/query";
import { Drawer } from "../shell/Drawer";

type Props = {
  state: ListState;
  categories: { slug: string; name: string }[];
  counts: Record<string, number>;
  total: number;
  activeCount: number;
};

/** "Filtros" button (with active-count badge) + side drawer. Options are links: the URL stays the source of truth. */
export function FilterDrawer({ state, categories, counts, total, activeCount }: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" className="pr-ctl" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        Filtros
        {activeCount > 0 ? (
          <span className="pr-ctl__badge" aria-label={`${activeCount} activos`}>
            {activeCount}
          </span>
        ) : null}
      </button>
      <Drawer
        open={open}
        onClose={close}
        title="Filtros"
        side="right"
        footer={
          <>
            {activeCount > 0 ? (
              <Link href={clearFiltersHref(state)} scroll={false} className="pr-ctl">
                Limpiar
              </Link>
            ) : (
              <span />
            )}
            <button type="button" className="pr-ctl pr-ctl--solid" onClick={close}>
              Ver {total} producto{total === 1 ? "" : "s"}
            </button>
          </>
        }
      >
        <section className="pr-fgroup" aria-labelledby="fg-estado">
          <h2 id="fg-estado">Estado</h2>
          <ul>
            {ESTADO_OPTIONS.map((o) => (
              <li key={o.slug}>
                <Link
                  href={optionHref(state, { filtro: o.slug })}
                  scroll={false}
                  className="pr-opt"
                  aria-current={o.slug === state.filtro ? "true" : undefined}
                >
                  <span>{o.label}</span>
                  <span className="pr-opt__n">{counts[o.countKey]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="pr-fgroup" aria-labelledby="fg-cat">
          <h2 id="fg-cat">Categoría</h2>
          <ul>
            <li>
              <Link href={optionHref(state, { categoria: undefined })} scroll={false} className="pr-opt" aria-current={!state.categoria ? "true" : undefined}>
                <span>Todas</span>
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={optionHref(state, { categoria: c.slug })}
                  scroll={false}
                  className="pr-opt"
                  aria-current={c.slug === state.categoria ? "true" : undefined}
                >
                  <span>{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Drawer>
    </>
  );
}
