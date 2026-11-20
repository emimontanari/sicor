/**
 * Whether a product shows in the public catalog. Pure.
 *
 * publish-on-sync S1: a product with no explicit override decision (visible null,
 * no row at all) is VISIBLE; hiding is always a manual, explicit visible=false.
 * `reviewed` stays in the database but is no longer part of visibility.
 */
export function effectiveVisibility(
  product: { status: "active" | "discontinued" },
  override: { visible: boolean | null; archivedAt?: Date | null } | null | undefined,
): boolean {
  if (override?.archivedAt) return false;
  // Legacy: catalogs predating append-only sync can hold discontinued rows; they stay hidden.
  if (product.status === "discontinued") return false;
  if (override && override.visible !== null) return override.visible;
  return true;
}
