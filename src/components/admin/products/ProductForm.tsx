"use client";

import { useActionState } from "react";
import { updateProductAction } from "../../../app/admin/productos/actions";
import type { ActionState } from "../../../lib/admin/products/state";

type Props = {
  code: string;
  categories: { id: number; name: string }[];
  values: {
    customName: string;
    customDescription: string;
    customPrice: string;
    showPrice: boolean;
    visible: "default" | "true" | "false";
    categoryId: string;
  };
  supplierName: string;
};

const Err = ({ id, msg }: { id: string; msg?: string }) =>
  msg ? (
    <span id={id} role="alert" className="admin-error pr-field-error">
      {msg}
    </span>
  ) : null;

export function ProductForm({ code, categories, values, supplierName }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateProductAction.bind(null, code), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="admin-card pr-form" noValidate>
      <h2>Editar</h2>
      <label>
        Nombre personalizado
        <input name="customName" defaultValue={values.customName} placeholder={supplierName} maxLength={200} aria-invalid={!!e.customName} aria-describedby="e-customName" />
        <Err id="e-customName" msg={e.customName} />
      </label>
      <label>
        Descripción / nota
        <textarea name="customDescription" rows={4} defaultValue={values.customDescription} maxLength={2000} aria-invalid={!!e.customDescription} aria-describedby="e-customDescription" />
        <Err id="e-customDescription" msg={e.customDescription} />
      </label>
      <label>
        Precio personalizado
        <input name="customPrice" inputMode="decimal" defaultValue={values.customPrice} placeholder="Ej: 1500.50" aria-invalid={!!e.customPrice} aria-describedby="e-customPrice" />
        <Err id="e-customPrice" msg={e.customPrice} />
      </label>
      <label className="pr-check">
        <input type="checkbox" name="showPrice" defaultChecked={values.showPrice} />
        <span>Mostrar precio</span>
      </label>
      <label>
        Categoría
        <select name="categoryId" defaultValue={values.categoryId} aria-invalid={!!e.categoryId} aria-describedby="e-categoryId">
          <option value="">Regla por defecto (según Masefer)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Err id="e-categoryId" msg={e.categoryId} />
      </label>
      <label>
        Visibilidad
        <select name="visible" defaultValue={values.visible} aria-invalid={!!e.visible} aria-describedby="e-visible">
          <option value="default">Seguir regla por defecto</option>
          <option value="true">Visible</option>
          <option value="false">Oculto</option>
        </select>
        <Err id="e-visible" msg={e.visible} />
      </label>
      {state.message ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "pr-ok" : "admin-error"}>
          {state.message}
        </p>
      ) : null}
      {e.patch ? <p role="alert" className="admin-error">{e.patch}</p> : null}
      <button type="submit" className="admin-btn" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
