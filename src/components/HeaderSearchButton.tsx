"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

/** Mobile header shortcut: focuses the catalog search on the home page, otherwise goes there. */
export function HeaderSearchButton() {
  const pathname = usePathname();
  return (
    <Link
      href="/#buscar"
      className="icon-btn site-header__search"
      aria-label="Buscar productos"
      onClick={(e) => {
        if (pathname !== "/") return;
        e.preventDefault();
        window.scrollTo({ top: 0 });
        document.getElementById("buscar")?.focus();
      }}
    >
      <Icon name="search" />
    </Link>
  );
}
