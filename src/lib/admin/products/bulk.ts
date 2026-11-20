/** Pure helpers for the bulk action menu ("Acciones (N)" button + action sheet). */

export const BULK_FORM_ID = "bulk-form";

export type BulkItemId = "show" | "hide";
export type BulkItem = { id: BulkItemId; label: string };

/** Simple sheet actions; "Asignar categoría" needs its own select and is rendered separately.
 *  publish-on-sync S2: only Mostrar/Ocultar; the review intents are gone. */
export const BULK_ITEMS: BulkItem[] = [
  { id: "show", label: "Mostrar" },
  { id: "hide", label: "Ocultar" },
];

/** "Acciones (N)": the count only appears once something is selected. */
export function bulkButtonLabel(selected: number): string {
  return selected > 0 ? `Acciones (${selected})` : "Acciones";
}

/** The menu stays closed (button disabled) until at least one row is selected. */
export function bulkDisabled(selected: number): boolean {
  return selected <= 0;
}

/** Select-all label with the row count of the current page in parentheses. */
export function selectAllLabel(pageRows: number): string {
  return `Seleccionar página (${pageRows})`;
}

export const CLEAR_SELECTION_LABEL = "Quitar selección";

/** S5: second option next to the page: the whole filtered list (total of the current filter). */
export function selectFilteredLabel(total: number): string {
  return `Seleccionar todos los filtrados (${total})`;
}

/** Selection-bar text while the whole filtered list is selected. */
export function selectedCountText(total: number): string {
  return `${total} producto${total === 1 ? "" : "s"} seleccionado${total === 1 ? "" : "s"}`;
}

/** Real scope inside the bulk sheet, so the admin confirms scale before acting. */
export function sheetScopeText(scope: "codes" | "all", count: number): string {
  if (scope === "all") return `Se aplicará a ${count} producto${count === 1 ? "" : "s"}`;
  return `${count} seleccionado${count === 1 ? "" : "s"} en esta página`;
}
