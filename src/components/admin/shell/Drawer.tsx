"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "left" | "right";
  footer?: ReactNode;
  children: ReactNode;
};

/** Side drawer on native <dialog>: focus trap, Escape, inert background and focus return come from showModal(). */
export function Drawer({ open, onClose, title, side = "left", footer, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`drawer drawer--${side}`}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // backdrop click (dialog has no padding)
      }}
    >
      <div className="drawer__panel">
        <div className="drawer__head">
          <strong>{title}</strong>
          <button type="button" className="drawer__close" onClick={onClose} aria-label={`Cerrar ${title.toLowerCase()}`}>
            <span aria-hidden>✕</span>
          </button>
        </div>
        <div className="drawer__body">{children}</div>
        {footer ? <div className="drawer__foot">{footer}</div> : null}
      </div>
    </dialog>
  );
}
