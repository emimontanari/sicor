"use client";

import { useActionState } from "react";
import { setMappingAction, type MappingState } from "../../../app/admin/categorias/actions";

type Cat = { id: number; name: string };
type Props = {
  metaCategory: string;
  family: string;
  subfamily: string;
  productCount: number;
  mappedId: number | null;
  effectiveName: string | null;
  categories: Cat[];
};

export function MappingRow(p: Props) {
  const [state, action, pending] = useActionState<MappingState, FormData>(setMappingAction, {});
  const label = [p.metaCategory, p.family, p.subfamily].filter(Boolean).join(" › ");
  return (
    <li className="cat-row">
      <div className="cat-row__info">
        <strong>{label}</strong>
        <span className="cat-row__meta">{p.productCount} productos</span>
      </div>
      <form action={action} className="cat-row__form">
        <input type="hidden" name="metaCategory" value={p.metaCategory} />
        <input type="hidden" name="family" value={p.family} />
        <input type="hidden" name="subfamily" value={p.subfamily} />
        <select
          name="categoryId"
          defaultValue={p.mappedId ?? ""}
          aria-label={`Categoría para ${label}`}
          disabled={pending}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="">Sin asignar (Otros)</option>
          {p.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </form>
      {state.error ? <p role="alert" className="admin-error">{state.error}</p> : null}
      {state.ok && state.error === undefined ? <p role="status" className="cat-row__ok">✓ Guardado</p> : null}
    </li>
  );
}
