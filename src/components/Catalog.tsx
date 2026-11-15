"use client";
import { useSearchParams } from "next/navigation";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { dispatchCart } from "../lib/cart/store";
import { useCart } from "../lib/cart/store";
import { categoryIcon, categoryShortName } from "../lib/catalog/categories";
import {
  EMPTY_FILTER,
  activeFilterCount,
  computeFacets,
  filterItems,
  parseFilter,
  sanitizeFilter,
  serializeFilter,
  type CatalogFilter,
  type CatalogItem,
} from "../lib/catalog/filters";
import { Icon } from "./Icon";
import { ProductCard } from "./ProductCard";

export type CatalogCategory = { slug: string; name: string; count: number };

const MemoCard = memo(ProductCard);
const plural = (n: number) => (n === 1 ? "1 producto" : `${n} productos`);
const toggle = (xs: string[], v: string) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]);
const PRIORITY_COUNT = 4;

export function Catalog({
  items,
  categories,
}: {
  items: CatalogItem[];
  categories: CatalogCategory[];
}) {
  const params = useSearchParams();
  const known = useMemo(
    () => ({
      categories: categories.map((c) => c.slug),
      brands: [...new Set(items.flatMap((i) => (i.brand ? [i.brand] : [])))],
    }),
    [items, categories],
  );
  const paramString = params.toString();
  const filter = useMemo(
    () => sanitizeFilter(parseFilter(new URLSearchParams(paramString)), known),
    [paramString, known],
  );

  // Heavy list work runs on a deferred copy so typing and chip taps stay responsive.
  const deferred = useDeferredValue(filter);
  const results = useMemo(() => filterItems(items, deferred), [items, deferred]);
  const facets = useMemo(() => computeFacets(items, filter), [items, filter]);

  const catName = useMemo(() => new Map(categories.map((c) => [c.slug, c.name])), [categories]);

  const go = useCallback((next: CatalogFilter, mode: "push" | "replace" = "push") => {
    const qs = serializeFilter(next);
    const url = qs ? `?${qs}` : window.location.pathname;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  // Search box: local text for responsive typing, URL kept in sync (replace: no history spam).
  const [text, setText] = useState(filter.q);
  const [seenQ, setSeenQ] = useState(filter.q);
  if (filter.q !== seenQ) {
    setSeenQ(filter.q);
    if (filter.q !== text.trim()) setText(filter.q);
  }
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (window.location.hash === "#buscar") searchRef.current?.focus();
  }, []);

  // Quote cart quick add.
  const cart = useCart();
  const quantities = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of cart.items) m.set(i.code, (m.get(i.code) ?? 0) + i.quantity);
    return m;
  }, [cart.items]);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const onAdd = useCallback((p: CatalogItem) => {
    dispatchCart({ type: "add", item: { code: p.code, name: p.name, quantity: 1 } });
    setToast(`Agregado a la cotización: ${p.name}`);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2400);
  }, []);

  // Filters sheet (native <dialog>: focus trap, Escape and inert background for free).
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = sheetRef.current;
    if (!d) return;
    if (sheetOpen && !d.open) d.showModal();
    if (!sheetOpen && d.open) d.close();
  }, [sheetOpen]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => mq.matches && setSheetOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Keep the selected category chip visible in the horizontally scrolling bar (mobile).
  const selectedCats = filter.categories.join("|");
  useEffect(() => {
    if (!selectedCats) return;
    document
      .querySelector(".catbar .chip-btn.is-on:not(:first-child)")
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [selectedCats]);
  const [allBrands, setAllBrands] = useState(false);

  const active = activeFilterCount(filter);
  const sheetCount = filter.categories.length + filter.brands.length;
  const clear = () => {
    setText("");
    go(EMPTY_FILTER);
  };
  const qLabel = filter.q ? `Búsqueda: “${filter.q}”` : "";

  return (
    <div className="catalog">
      <div className="catalog__intro">
        <h1 className="title">Catálogo</h1>
        <p className="muted catalog__lead">
          Todos los productos en una sola lista. Filtrá por rubro y marca, y pedí tu cotización.
        </p>
      </div>

      <form className="catalog__search" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="searchfield">
          <span className="sr-only">Buscar productos</span>
          <Icon name="search" />
          <input
            ref={searchRef}
            id="buscar"
            type="search"
            name="q"
            value={text}
            placeholder="Buscar producto"
            aria-label="Buscar por nombre, marca o código"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={100}
            onChange={(e) => {
              setText(e.target.value);
              go({ ...filter, q: e.target.value.trim() }, "replace");
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn--ghost catalog__filterbtn"
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
        >
          <Icon name="filter" />
          Filtros
          {sheetCount > 0 ? <span className="badge-count">{sheetCount}</span> : null}
        </button>
      </form>

      <nav className="catbar" aria-label="Categorías">
        <div className="catbar__row">
          <button
            type="button"
            className={filter.categories.length === 0 ? "chip-btn is-on" : "chip-btn"}
            aria-pressed={filter.categories.length === 0}
            onClick={() => go({ ...filter, categories: [] })}
          >
            <span>Todos</span> <span className="cnt">{facets.categoryTotal}</span>
          </button>
          {categories.map((c) => {
            const on = filter.categories.includes(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                className={on ? "chip-btn is-on" : "chip-btn"}
                aria-pressed={on}
                title={c.name}
                onClick={() => go({ ...filter, categories: toggle(filter.categories, c.slug) })}
              >
                <Icon name={categoryIcon(c.slug)} className="chip-btn__ico" />
                <span>{categoryShortName(c.slug, c.name)}</span>{" "}
                <span className="cnt">{facets.categoryCounts[c.slug] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="brandbar" role="group" aria-label="Marca">
        <span className="brandbar__lbl">Marca</span>
        <div className={allBrands ? "brandbar__row" : "brandbar__row is-collapsed"} id="brandbar-row">
          {facets.brands.map((b) => {
            const on = filter.brands.includes(b.name);
            return (
              <button
                key={b.name}
                type="button"
                className={on ? "chip-btn chip-btn--sm is-on" : "chip-btn chip-btn--sm"}
                aria-pressed={on}
                onClick={() => go({ ...filter, brands: toggle(filter.brands, b.name) })}
              >
                <span>{b.name}</span> <span className="cnt">{b.count}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="link-btn brandbar__more"
          aria-expanded={allBrands}
          aria-controls="brandbar-row"
          onClick={() => setAllBrands((v) => !v)}
        >
          {allBrands ? "Ver menos" : `Ver todas (${facets.brands.length})`}
        </button>
      </div>

      <div className="status">
        <p className="status__n" role="status">
          {plural(results.length)}
        </p>
        {active > 0 ? (
          <div className="active">
            {qLabel ? (
              <button
                type="button"
                className="fchip"
                aria-label={`Quitar filtro ${qLabel}`}
                onClick={() => {
                  setText("");
                  go({ ...filter, q: "" });
                }}
              >
                <span>{qLabel}</span>
                <Icon name="x" />
              </button>
            ) : null}
            {filter.categories.map((c) => (
              <button
                key={c}
                type="button"
                className="fchip"
                aria-label={`Quitar filtro ${catName.get(c) ?? c}`}
                onClick={() => go({ ...filter, categories: filter.categories.filter((x) => x !== c) })}
              >
                <span>{catName.get(c) ?? c}</span>
                <Icon name="x" />
              </button>
            ))}
            {filter.brands.map((b) => (
              <button
                key={b}
                type="button"
                className="fchip"
                aria-label={`Quitar filtro Marca: ${b}`}
                onClick={() => go({ ...filter, brands: filter.brands.filter((x) => x !== b) })}
              >
                <span>Marca: {b}</span>
                <Icon name="x" />
              </button>
            ))}
            <button type="button" className="link-btn" onClick={clear}>
              Limpiar filtros
            </button>
          </div>
        ) : null}
      </div>

      {results.length > 0 ? (
        <ul className="grid">
          {results.map((p, i) => (
            <MemoCard
              key={p.code}
              product={p}
              priority={i < PRIORITY_COUNT}
              quantity={quantities.get(p.code) ?? 0}
              onAdd={onAdd}
            />
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <h2>No encontramos productos</h2>
          <p>Probá con otra búsqueda o quitá algún filtro.</p>
          <button type="button" className="btn btn--primary" onClick={clear}>
            Limpiar filtros
          </button>
        </div>
      )}

      <dialog
        ref={sheetRef}
        className="sheet"
        aria-labelledby="sheet-title"
        onClose={() => setSheetOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSheetOpen(false);
        }}
      >
        <span className="sheet__grab" aria-hidden />
        <div className="sheet__head">
          <h2 id="sheet-title">Filtros</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar filtros" onClick={() => setSheetOpen(false)}>
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet__body">
          <fieldset className="fs">
            <legend>Categoría {filter.categories.length > 0 ? `(${filter.categories.length})` : ""}</legend>
            {categories.map((c) => (
              <label key={c.slug} className="chk">
                <input
                  type="checkbox"
                  checked={filter.categories.includes(c.slug)}
                  onChange={() => go({ ...filter, categories: toggle(filter.categories, c.slug) }, "replace")}
                />
                <span className="chk__box" aria-hidden>
                  <Icon name="check" />
                </span>
                <span className="chk__txt">{c.name}</span>
                <span className="cnt">{facets.categoryCounts[c.slug] ?? 0}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="fs">
            <legend>Marca {filter.brands.length > 0 ? `(${filter.brands.length})` : ""}</legend>
            <div className="fs__cols">
              {facets.brands.map((b) => (
                <label key={b.name} className="chk">
                  <input
                    type="checkbox"
                    checked={filter.brands.includes(b.name)}
                    onChange={() => go({ ...filter, brands: toggle(filter.brands, b.name) }, "replace")}
                  />
                  <span className="chk__box" aria-hidden>
                    <Icon name="check" />
                  </span>
                  <span className="chk__txt">{b.name}</span>
                  <span className="cnt">{b.count}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="sheet__foot">
          <button type="button" className="btn btn--ghost" onClick={clear}>
            Limpiar
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setSheetOpen(false)}>
            {results.length > 0 ? `Ver ${plural(results.length)}` : "Sin resultados"}
          </button>
        </div>
      </dialog>

      <div className={toast ? "toast show" : "toast"} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
