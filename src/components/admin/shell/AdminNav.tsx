import { logoutAction } from "../../../server/auth/actions";
import { NavDrawer } from "./NavDrawer";

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
        <NavDrawer links={LINKS}>
          <form action={logoutAction}>
            <button type="submit" className="admin-nav__logout">
              Salir
            </button>
          </form>
        </NavDrawer>
      </div>
    </header>
  );
}
