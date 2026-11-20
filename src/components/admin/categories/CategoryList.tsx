"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deleteCategoryAction, saveCategoryAction } from "../../../app/admin/categorias/actions";
import { deleteConfirmText, productsLabel } from "../../../lib/admin/forms/categories";
import { Drawer } from "../shell/Drawer";

export type CategoryItem = { id: number; name: string; productCount: number };
type Editing = { id: number | null; name: string } | null;
const FORM_ID = "category-form";

/** Simple CRUD list: Agregar / Editar (rename) / Eliminar with confirmation. */
export function CategoryList({ items }: { items: CategoryItem[] }) {
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<CategoryItem | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const notify = (m: string) => {
    clearTimeout(timer.current);
    setToast(m);
    timer.current = setTimeout(() => setToast(null), 6000);
  };
  const openEditor = (e: NonNullable<Editing>) => {
    setValue(e.name);
    setError(null);
    setEditing(e);
  };
  const save = () => {
    if (!editing) return;
    const { id } = editing;
    start(async () => {
      const r = await saveCategoryAction(id, value);
      if (r.ok) {
        setEditing(null);
        notify(r.message ?? "Guardado");
      } else setError(r.errors?.name ?? r.message ?? "No se pudo guardar");
    });
  };
  const remove = () => {
    if (!deleting) return;
    const { id, name } = deleting;
    start(async () => {
      const r = await deleteCategoryAction(id);
      setDeleting(null);
      notify(r.ok ? `Eliminada: ${name}` : (r.message ?? "No se pudo eliminar"));
    });
  };

  return (
    <>
      <div className="cat-bar">
        <button type="button" className="pr-ctl pr-ctl--solid" onClick={() => openEditor({ id: null, name: "" })}>
          Agregar categoría
        </button>
      </div>
      <ul className="cat-list-admin">
        {items.map((c) => (
          <li key={c.id} className="cat-item">
            <div className="cat-item__info">
              <strong>{c.name}</strong>
              <span className="cat-item__meta">{productsLabel(c.productCount)}</span>
            </div>
            <div className="cat-item__actions">
              <button type="button" className="pr-ctl" aria-label={`Editar ${c.name}`} onClick={() => openEditor({ id: c.id, name: c.name })}>
                Editar
              </button>
              <button type="button" className="pr-ctl pr-ctl--danger" aria-label={`Eliminar ${c.name}`} onClick={() => setDeleting(c)}>
                Eliminar
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id === null ? "Agregar categoría" : "Editar categoría"}
        side="right"
        footer={
          <>
            <button type="button" className="pr-ctl" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button type="submit" form={FORM_ID} className="pr-ctl pr-ctl--solid" disabled={pending}>
              Guardar
            </button>
          </>
        }
      >
        <div className="sheet" />
        <form
          id={FORM_ID}
          className="cat-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor="category-name">Nombre</label>
          <input
            id="category-name"
            name="name"
            value={value}
            maxLength={60}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "category-name-error" : undefined}
            onChange={(e) => setValue(e.target.value)}
          />
          {error ? (
            <p id="category-name-error" role="alert" className="admin-error">
              {error}
            </p>
          ) : null}
        </form>
      </Drawer>

      <Drawer
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`¿Eliminar «${deleting?.name ?? ""}»?`}
        side="right"
        footer={
          <>
            <button type="button" className="pr-ctl" onClick={() => setDeleting(null)}>
              Cancelar
            </button>
            <button type="button" className="pr-ctl pr-ctl--danger" disabled={pending} onClick={remove}>
              Eliminar
            </button>
          </>
        }
      >
        <div className="sheet" />
        <p className="sheet__text">{deleting ? deleteConfirmText(deleting.productCount) : null}</p>
      </Drawer>

      {toast ? (
        <div className="pr-toast" role="status">
          <span>{toast}</span>
          <button type="button" className="pr-ctl" aria-label="Cerrar aviso" onClick={() => setToast(null)}>
            <span aria-hidden>✕</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
