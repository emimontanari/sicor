"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { itemKey, type CartItem } from "../lib/cart/cart";
import { resolveQuoteMedia, type QuoteMediaMap } from "../lib/cart/quote";
import { dispatchCart, useCart } from "../lib/cart/store";
import { Icon } from "./Icon";
import { QuoteLine } from "./quote/QuoteLine";
import { QuoteSummary } from "./quote/QuoteSummary";

type Removal = { item: CartItem; index: number };

export function QuoteCart({ whatsappNumber, messageTemplate, media = {} }: {
  whatsappNumber: string | null; messageTemplate: string; media?: QuoteMediaMap;
}) {
  const cart = useCart();
  const [removed, setRemoved] = useState<Removal | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef({ ms: 8000 });
  const undoButton = useRef<HTMLButtonElement>(null);
  const emptyTitle = useRef<HTMLHeadingElement>(null);

  useEffect(() => { if (removed) undoButton.current?.focus(); }, [removed]);
  useEffect(() => {
    if (!removed || hovered || focused) return;
    // Capture this removal's budget: cleanup of an older toast must not shorten a new one.
    const budget = remaining.current;
    const start = performance.now();
    const timer = window.setTimeout(() => setRemoved(null), budget.ms);
    return () => { window.clearTimeout(timer); budget.ms = Math.max(0, budget.ms - (performance.now() - start)); };
  }, [removed, hovered, focused]);

  function remove(item: CartItem) {
    remaining.current = { ms: 8000 };
    setRemoved({ item, index: cart.items.findIndex((i) => itemKey(i) === itemKey(item)) });
    dispatchCart({ type: "remove", key: itemKey(item) });
  }
  function clear() {
    setRemoved(null);
    // The summary unmounts after clear; send focus to the new empty-state heading.
    requestAnimationFrame(() => emptyTitle.current?.focus());
  }

  return <div className="qc">
    {cart.items.length === 0 ? <div className="qc-empty">
      <span className="qc-empty-icon"><Icon name="cart" /></span>
      <h2 ref={emptyTitle} tabIndex={-1}>Tu cotización está vacía</h2>
      <p>Sumá productos desde el catálogo y envialos por WhatsApp.</p>
      <Link href="/" className="btn btn--primary">Ver catálogo</Link>
    </div> : <div className="qc-layout">
      <ul className="qc-list" aria-label="Productos de la cotización">
        {cart.items.map((item) => <QuoteLine key={itemKey(item)} item={item} media={resolveQuoteMedia(item, media)} onRemove={remove} />)}
      </ul>
      <QuoteSummary cart={cart} whatsappNumber={whatsappNumber} messageTemplate={messageTemplate} onClear={clear} />
    </div>}
    <div className="qc-toast-region" aria-live="polite" role="status">
      {removed && <div className="qc-toast" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
        <span>Quitado ·</span>
        <button ref={undoButton} type="button" onClick={() => {
          dispatchCart({ type: "restore", ...removed });
          setRemoved(null);
          setFocused(false);
          setHovered(false);
        }}>Deshacer</button>
      </div>}
    </div>
  </div>;
}
