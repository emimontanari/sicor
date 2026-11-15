"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { cartCount } from "../lib/cart/cart";
import { useCart } from "../lib/cart/store";
import { closeAction } from "../lib/nav/close";
import { Icon } from "./Icon";

const SWIPE_CLOSE_PX = 90;

/**
 * Product sheet over the (still mounted) catalog. Native modal <dialog>: inert background, focus
 * trap and Escape. Closing goes back in history so the catalog URL (filters) and scroll are the
 * ones the user left.
 */
export function ProductSheet({
  code,
  labelId,
  children,
}: {
  code: string;
  labelId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const count = cartCount(useCart());

  const close = () => {
    if (closeAction(window.history.length) === "back") router.back();
    else router.replace("/");
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    root.classList.add("is-locked");
    if (!dialog.open) dialog.showModal();
    return () => {
      root.classList.remove("is-locked");
      // Back to the originating card (Safari doesn't focus tapped links, so fall back to a lookup).
      const target =
        opener && opener.isConnected && opener !== document.body
          ? opener
          : document.querySelector<HTMLElement>(
              `.card__name a[href="/producto/${CSS.escape(encodeURIComponent(code))}"]`,
            );
      target?.focus({ preventScroll: true });
    };
  }, [code]);

  // Swipe down from the top bar (touch only; inner content keeps its own scroll).
  const drag = useRef<{ y: number; id: number; dy: number } | null>(null);
  const setShift = (dy: number) => {
    panelRef.current?.style.setProperty("translate", dy > 0 ? `0 ${dy}px` : "");
  };

  return (
    <dialog
      ref={dialogRef}
      className="psheet"
      aria-labelledby={labelId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="psheet__panel" ref={panelRef}>
        <div
          className="psheet__bar"
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") return;
            drag.current = { y: e.clientY, id: e.pointerId, dy: 0 };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            d.dy = Math.max(0, e.clientY - d.y);
            setShift(d.dy);
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            drag.current = null;
            if (d.dy > SWIPE_CLOSE_PX) close();
            else setShift(0);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setShift(0);
          }}
        >
          <button
            type="button"
            className="psheet__close"
            aria-label="Cerrar y volver al catálogo"
            onClick={() => close()}
          >
            <Icon name="x" />
          </button>
          <span className="psheet__title">Producto</span>
          <Link
            href="/cotizacion"
            className="psheet__cart"
            aria-label={`Ver cotización, ${count} ${count === 1 ? "unidad" : "unidades"}`}
          >
            <Icon name="cart" />
            {count > 0 ? <span className="psheet__badge">{count > 99 ? "99+" : count}</span> : null}
          </Link>
        </div>
        <div className="psheet__scroll">{children}</div>
      </div>
    </dialog>
  );
}
