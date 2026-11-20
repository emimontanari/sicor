"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { isNavCurrent } from "../../../lib/admin/products/filters";
import { Drawer } from "./Drawer";

type Props = { links: { href: string; label: string }[]; children?: ReactNode };

/** Hamburger button + side drawer with the admin sections. `children` is the (server-rendered) logout form. */
export function NavDrawer({ links, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <>
      <button
        type="button"
        className="admin-burger"
        aria-label="Abrir menú"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Menú" side="left">
        <nav aria-label="Administración" className="admin-nav" onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isNavCurrent(l, pathname) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          {children}
        </nav>
      </Drawer>
    </>
  );
}
