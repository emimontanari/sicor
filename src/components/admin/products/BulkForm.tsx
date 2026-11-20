"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { bulkAction } from "../../../app/admin/productos/actions";
import {
  BULK_FORM_ID,
  BULK_ITEMS,
  CLEAR_SELECTION_LABEL,
  bulkButtonLabel,
  bulkDisabled,
  selectAllLabel,
  selectFilteredLabel,
  selectedCountText,
  sheetScopeText,
} from "../../../lib/admin/products/bulk";
import type { FilterSlug } from "../../../lib/admin/products/query";
import type { ActionState } from "../../../lib/admin/products/state";
import { Drawer } from "../shell/Drawer";

const CODE_SEL = `input[type=checkbox][name=code][form=${BULK_FORM_ID}]`;

type Props = {
  categories: { id: number; name: string }[];
  pageRows: number;
  /** Total of the current filter (list.total): the scope of "todos los filtrados". */
  total: number;
  /** Active filter state: sent as the scope=all sentinel instead of per-row codes. */
  filterState: { filtro: FilterSlug; categoria?: string; q?: string };
};

/**
 * Compact selection bar: "Seleccionar página (N)" + "Seleccionar todos los filtrados (N)"
 * + "Acciones (N)". The button is disabled until something is selected; it opens the bulk
 * action sheet (same Drawer/sheet pattern as the per-row "…" menu). Row checkboxes live
 * outside this form and attach to it with form=BULK_FORM_ID. With "todos los filtrados"
 * active the form sends only the filter state (scope=all sentinel); the server resolves
 * the codes, so no client code list can exceed bounds.
 */
export function BulkForm({ categories, pageRows, total, filterState }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(bulkAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const allRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const [selected, setSelected] = useState(0);
  const [category, setCategory] = useState("");
  const [allFiltered, setAllFiltered] = useState(false);
  const allFilteredRef = useRef(false);
  const setFilteredScope = (on: boolean) => {
    allFilteredRef.current = on;
    setAllFiltered(on);
  };

  // Row checkboxes live outside this component (server-rendered list rows), so the
  // count is read from the DOM: on every change event, and whenever the list is
  // re-rendered by the server (filter/pagination links, bulk revalidation), which
  // replaces the checkboxes without firing any event.
  useEffect(() => {
    const recount = () => {
      const boxes = document.querySelectorAll<HTMLInputElement>(CODE_SEL);
      const n = [...boxes].filter((b) => b.checked).length;
      setSelected(n);
      if (allRef.current && boxes.length > 0) allRef.current.checked = n === boxes.length;
      // checking a row box is an explicit per-row choice: it leaves the all-filtered scope
      if (n > 0 && allFilteredRef.current) setFilteredScope(false);
    };
    recount();
    document.addEventListener("change", recount);
    const mo = new MutationObserver(recount);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("change", recount);
      mo.disconnect();
    };
  }, []);

  const toggleAll = (checked: boolean) => {
    const boxes = document.querySelectorAll<HTMLInputElement>(CODE_SEL);
    boxes.forEach((c) => (c.checked = checked));
    setSelected(checked ? boxes.length : 0); // programmatic .checked fires no change event
  };

  const selectFiltered = () => {
    // per-row boxes are irrelevant in this scope: clear them so only the sentinel is sent
    const boxes = document.querySelectorAll<HTMLInputElement>(CODE_SEL);
    boxes.forEach((c) => (c.checked = false));
    if (allRef.current) allRef.current.checked = false;
    setSelected(0);
    setFilteredScope(true);
  };

  const submit = (intent: string) => {
    const form = ref.current;
    if (!form) return;
    const fd = new FormData(form); // includes the row checkboxes and the sheet's category select (form association)
    if (allFilteredRef.current) {
      fd.delete("code"); // never trust a client code list at this scale
      fd.set("scope", "all");
      fd.set("filtro", filterState.filtro);
      if (filterState.categoria) fd.set("categoria", filterState.categoria);
      if (filterState.q) fd.set("q", filterState.q);
    } else {
      fd.set("scope", "codes");
    }
    fd.set("intent", intent);
    formAction(fd);
    setMenu(false);
  };

  const effective = allFiltered ? total : selected;

  return (
    <>
      <form id={BULK_FORM_ID} ref={ref} action={formAction} className="admin-card pr-bulk">
        {allFiltered ? (
          <>
            <span className="pr-bulk__scope">{selectedCountText(total)}</span>
            <button type="button" className="pr-ctl" onClick={() => setFilteredScope(false)}>
              {CLEAR_SELECTION_LABEL}
            </button>
          </>
        ) : (
          <>
            <label className="pr-check">
              <input ref={allRef} type="checkbox" onChange={(e) => toggleAll(e.target.checked)} />
              <span>{selectAllLabel(pageRows)}</span>
            </label>
            <button type="button" className="pr-ctl" onClick={selectFiltered}>
              {selectFilteredLabel(total)}
            </button>
          </>
        )}
        <button
          type="button"
          className="pr-ctl"
          aria-haspopup="dialog"
          aria-expanded={menu}
          disabled={pending || bulkDisabled(effective)}
          onClick={() => setMenu(true)}
        >
          {bulkButtonLabel(effective)}
        </button>
        {state.message ? (
          <p role={state.ok ? "status" : "alert"} className={state.ok ? "pr-ok" : "admin-error"}>
            {state.message}
          </p>
        ) : null}
      </form>
      <Drawer open={menu} onClose={() => setMenu(false)} title="Acciones" side="right">
        <div className="sheet" />
        <p className="sheet__text">{sheetScopeText(allFiltered ? "all" : "codes", allFiltered ? total : selected)}</p>
        <ul className="sheet__list">
          {BULK_ITEMS.map((i) => (
            <li key={i.id}>
              <button type="button" className="sheet__item" disabled={pending} onClick={() => submit(i.id)}>
                {i.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="sheet__cat">
          <select
            name="bulkCategory"
            form={BULK_FORM_ID}
            className="sheet__select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Categoría para asignar"
          >
            <option value="">Categoría…</option>
            <option value="none">Sin categoría manual (regla por defecto)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pr-ctl pr-ctl--solid"
            disabled={pending || category === ""}
            onClick={() => submit("category")}
          >
            Asignar categoría
          </button>
        </div>
      </Drawer>
    </>
  );
}
