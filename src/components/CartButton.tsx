"use client";
import Link from "next/link";
import { cartCount } from "../lib/cart/cart";
import { useCart } from "../lib/cart/store";

/** Floating, thumb-reachable cart button with item-count badge. */
export function CartButton() {
  const count = cartCount(useCart());
  return (
    <Link href="/cotizacion" className="cart-fab" aria-label={`Ver cotización, ${count} ${count === 1 ? "unidad" : "unidades"}`}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <path d="M3 4h2l2.4 11h10.2L20 7H6.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="19.5" r="1.4" />
        <circle cx="17" cy="19.5" r="1.4" />
      </svg>
      <span className="cart-fab__label">Cotización</span>
      {count > 0 ? <span className="cart-fab__badge">{count > 99 ? "99+" : count}</span> : null}
    </Link>
  );
}
