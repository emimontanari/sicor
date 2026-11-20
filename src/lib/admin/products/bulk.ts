/** Pure helpers for the bulk action menu ("Acciones (N)" button + action sheet). */

export const BULK_FORM_ID = "bulk-form";

export type BulkItemId = "show" | "hide" | "reviewed";
export type BulkItem = { id: BulkItemId; label: string };

/** Simple sheet actions; "Asignar categoría" needs its own select and is rendered separately. */
export const BULK_ITEMS: BulkItem[] = [
  { id: "show", label: "Mostrar" },
  { id: "hide", label: "Ocultar" },
  { id: "reviewed", label: "Marcar como revisados" },
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
