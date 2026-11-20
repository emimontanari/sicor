"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { archiveAction, restoreAction, toggleVisibilityAction } from "../../../app/admin/productos/actions";
import { rowMenuItems, type MenuRow } from "../../../lib/admin/products/menu";
import { Drawer } from "../shell/Drawer";

type Toast = { message: string; undoCode?: string };
const Notify = createContext<(t: Toast) => void>(() => {});

/** Wraps the list: owns the feedback toast so it survives the row disappearing after Eliminar. */
export function RowFeedback({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((t: Toast) => {
    clearTimeout(timer.current);
    setToast(t);
    timer.current = setTimeout(() => setToast(null), 10000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const undo = (code: string) =>
    start(async () => {
      const r = await restoreAction(code);
      notify({ message: r.ok ? "Producto restaurado" : (r.message ?? "No se pudo restaurar") });
    });

  return (
    <Notify.Provider value={notify}>
      {children}
      {toast ? (
        <div className="pr-toast" role="status">
          <span>{toast.message}</span>
          {toast.undoCode ? (
            <button type="button" className="pr-ctl pr-ctl--solid" disabled={pending} onClick={() => undo(toast.undoCode!)}>
              Deshacer
            </button>
          ) : null}
          <button type="button" className="pr-ctl" aria-label="Cerrar aviso" onClick={() => setToast(null)}>
            <span aria-hidden>✕</span>
          </button>
        </div>
      ) : null}
    </Notify.Provider>
  );
}

type Props = MenuRow & { code: string; name: string; editHref: string };

/** One "…" button per row → action sheet (bottom sheet on phones, compact panel on desktop) + delete confirm. */
export function RowMenu({ code, name, editHref, ...row }: Props) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const notify = useContext(Notify);
  const run = (fn: () => Promise<void>) => {
    setMenu(false);
    setConfirm(false);
    start(fn);
  };

  const onItem = (id: string) => {
    if (id === "delete") {
      setMenu(false);
      setConfirm(true);
    } else if (id === "hide" || id === "show") {
      run(async () => {
        const fd = new FormData();
        fd.set("code", code);
        fd.set("visible", String(id === "show"));
        await toggleVisibilityAction(fd);
        notify({ message: id === "show" ? "Producto visible" : "Producto oculto" });
      });
    } else if (id === "restore") {
      run(async () => {
        const r = await restoreAction(code);
        notify({ message: r.ok ? "Producto restaurado" : (r.message ?? "No se pudo restaurar") });
      });
    }
  };

  return (
    <>
      <button type="button" className="pr-ctl pr-ctl--icon" aria-label={`Más acciones: ${name}`} aria-haspopup="dialog" aria-expanded={menu} disabled={pending} onClick={() => setMenu(true)}>
        <span aria-hidden>…</span>
      </button>
      <Drawer open={menu} onClose={() => setMenu(false)} title="Acciones" side="right">
        <div className="sheet" />
        <p className="sheet__name">{name}</p>
        <ul className="sheet__list">
          {rowMenuItems(row).map((i) => (
            <li key={i.id}>
              {i.id === "edit" ? (
                <Link href={editHref} className="sheet__item" onClick={() => setMenu(false)}>
                  {i.label}
                </Link>
              ) : (
                <button type="button" className={i.destructive ? "sheet__item sheet__item--danger" : "sheet__item"} onClick={() => onItem(i.id)}>
                  {i.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </Drawer>
      <Drawer
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`¿Eliminar ${name}?`}
        side="right"
        footer={
          <>
            <button type="button" className="pr-ctl" onClick={() => setConfirm(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="pr-ctl pr-ctl--danger"
              onClick={() =>
                run(async () => {
                  const r = await archiveAction(code);
                  notify(r.ok ? { message: `Eliminado: ${name}`, undoCode: code } : { message: r.message ?? "No se pudo eliminar" });
                })
              }
            >
              Eliminar
            </button>
          </>
        }
      >
        <div className="sheet" />
        <p className="sheet__text">Sale del catálogo y Masefer no lo vuelve a proponer. Podés restaurarlo desde Eliminados.</p>
      </Drawer>
    </>
  );
}

/** Restaurar button for the edit page's "Producto eliminado" notice. */
export function RestoreButton({ code }: { code: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="pr-ctl pr-ctl--solid" disabled={pending} onClick={() => start(async () => void (await restoreAction(code)))}>
      Restaurar
    </button>
  );
}
