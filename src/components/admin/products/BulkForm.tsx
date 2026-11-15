"use client";

import { useActionState, useRef } from "react";
import { bulkAction } from "../../../app/admin/productos/actions";
import type { ActionState } from "../../../lib/admin/products/state";

export const BULK_FORM_ID = "bulk-form";

type Props = { categories: { id: number; name: string }[] };

/** Bulk bar. Row checkboxes live outside this form and attach to it with form="bulk-form". */
export function BulkForm({ categories }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(bulkAction, {});
  const ref = useRef<HTMLFormElement>(null);

  const toggleAll = (checked: boolean) => {
    document
      .querySelectorAll<HTMLInputElement>(`input[type=checkbox][name=code][form=${BULK_FORM_ID}]`)
      .forEach((c) => (c.checked = checked));
  };

  return (
    <form id={BULK_FORM_ID} ref={ref} action={action} className="admin-card pr-bulk">
      <label className="pr-check">
        <input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} aria-label="Seleccionar todos los de la página" />
        <span>Seleccionar página</span>
      </label>
      <div className="pr-bulk__actions">
        <button type="submit" name="intent" value="show" className="admin-btn admin-btn--sm" disabled={pending}>
          Mostrar
        </button>
        <button type="submit" name="intent" value="hide" className="admin-btn admin-btn--sm admin-btn--ghost" disabled={pending}>
          Ocultar
        </button>
        <button type="submit" name="intent" value="reviewed" className="admin-btn admin-btn--sm admin-btn--ghost" disabled={pending}>
          Marcar revisado
        </button>
      </div>
      <div className="pr-bulk__category">
        <select name="bulkCategory" defaultValue="" aria-label="Categoría para asignar">
          <option value="">Categoría…</option>
          <option value="none">Sin categoría manual (regla por defecto)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" name="intent" value="category" className="admin-btn admin-btn--sm admin-btn--ghost" disabled={pending}>
          Asignar categoría
        </button>
      </div>
      {state.message ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "pr-ok" : "admin-error"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
