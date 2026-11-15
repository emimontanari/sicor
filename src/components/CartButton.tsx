"use client";
import Link from "next/link";
import { cartCount } from "../lib/cart/cart";
import { useCart } from "../lib/cart/store";
import { Icon } from "./Icon";

/** Floating, thumb-reachable cart button with item-count badge. */
export function CartButton() {
  const count = cartCount(useCart());
  return (
    <Link href="/cotizacion" className="cart-fab" aria-label={`Ver cotización, ${count} ${count === 1 ? "unidad" : "unidades"}`}>
      <Icon name="cart" />
      <span className="cart-fab__label">Cotización</span>
      {count > 0 ? <span className="cart-fab__badge">{count > 99 ? "99+" : count}</span> : null}
    </Link>
  );
}
