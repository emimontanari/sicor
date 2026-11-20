import { LIST_PATH } from "./query";

/** Pure helpers for the per-row "…" menu and the edit page's back link. */

export type MenuItemId = "edit" | "hide" | "show" | "unreview" | "delete" | "restore";
export type MenuItem = { id: MenuItemId; label: string; destructive?: true };
export type MenuRow = { visible: boolean; archived: boolean; status: "active" | "discontinued"; reviewed: boolean };

export function rowMenuItems(row: MenuRow): MenuItem[] {
  if (row.archived) return [{ id: "restore", label: "Restaurar" }, { id: "edit", label: "Editar" }];
  const items: MenuItem[] = [{ id: "edit", label: "Editar" }];
  if (row.status === "active") items.push(row.visible ? { id: "hide", label: "Ocultar" } : { id: "show", label: "Mostrar" });
  // S6: a reviewed product can go back to the "Nuevos para revisar" queue; archived rows keep Restaurar/Editar only.
  if (row.reviewed && row.status !== "discontinued") items.push({ id: "unreview", label: "Volver a Nuevos" });
  items.push({ id: "delete", label: "Eliminar", destructive: true });
  return items;
}

/** Edit page URL; remembers the list URL (filters, page) in ?from= when it is not the plain list. */
export function editHref(code: string, listUrl: string): string {
  const base = `${LIST_PATH}/${encodeURIComponent(code)}`;
  return listUrl === LIST_PATH ? base : `${base}?from=${encodeURIComponent(listUrl)}`;
}

/** Only same-site product-list URLs are honored (no open redirect, no other admin pages). */
export function backHref(from: string | undefined): string {
  if (!from || !from.startsWith(LIST_PATH) || from.startsWith("//")) return LIST_PATH;
  const rest = from.slice(LIST_PATH.length);
  return rest === "" || rest.startsWith("?") ? from : LIST_PATH;
}
