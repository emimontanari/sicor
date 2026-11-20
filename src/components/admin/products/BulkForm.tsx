"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { bulkAction } from "../../../app/admin/productos/actions";
import { BULK_FORM_ID, BULK_ITEMS, bulkButtonLabel, bulkDisabled, selectAllLabel } from "../../../lib/admin/products/bulk";
import type { ActionState } from "../../../lib/admin/products/state";
import { Drawer } from "../shell/Drawer";

const CODE_SEL = `input[type=checkbox][name=code][form=${BULK_FORM_ID}]`;

type Props = { categories: { id: number; name: string }[]; pageRows: number };

/**
 * Compact selection bar: "Seleccionar página (N)" + "Acciones (N)".
 * The button is disabled until a row is selected; it opens the bulk action sheet
 * (same Drawer/sheet pattern as the per-row "…" menu). Row checkboxes live
 * outside this form and attach to it with form=BULK_FORM_ID; one submission
 * calls the unchanged bulkAction server action.
 */
export function BulkForm({ categories, pageRows }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(bulkAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const allRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const [selected, setSelected] = useState(0);
  const [category, setCategory] = useState("");

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

  const submit = (intent: string) => {
    const form = ref.current;
    if (!form) return;
    const fd = new FormData(form); // includes the row checkboxes and the sheet's category select (form association)
    fd.set("intent", intent);
    formAction(fd);
    setMenu(false);
  };

  return (
    <>
      <form id={BULK_FORM_ID} ref={ref} action={formAction} className="admin-card pr-bulk">
        <label className="pr-check">
          <input ref={allRef} type="checkbox" onChange={(e) => toggleAll(e.target.checked)} />
          <span>{selectAllLabel(pageRows)}</span>
        </label>
        <button
          type="button"
          className="pr-ctl"
          aria-haspopup="dialog"
          aria-expanded={menu}
          disabled={pending || bulkDisabled(selected)}
          onClick={() => setMenu(true)}
        >
          {bulkButtonLabel(selected)}
        </button>
        {state.message ? (
          <p role={state.ok ? "status" : "alert"} className={state.ok ? "pr-ok" : "admin-error"}>
            {state.message}
          </p>
        ) : null}
      </form>
      <Drawer open={menu} onClose={() => setMenu(false)} title="Acciones" side="right">
        <div className="sheet" />
        <p className="sheet__text">
          {selected} seleccionado{selected === 1 ? "" : "s"} en esta página
        </p>
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
