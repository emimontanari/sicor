import Link from "next/link";
import { logoutAction } from "../../../server/auth/actions";

const LINKS = [
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/productos?filtro=nuevos", label: "Nuevos" },
  { href: "/admin/actualizaciones", label: "Actualizaciones" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/ajustes", label: "Ajustes" },
];

export function AdminNav() {
  return (
    <header className="admin-header">
      <div className="admin-header__inner">
        <strong className="admin-header__brand">SICOR · Admin</strong>
        <nav aria-label="Administración" className="admin-nav">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
          <form action={logoutAction}>
            <button type="submit" className="admin-nav__logout">
              Salir
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
