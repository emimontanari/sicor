/** S5: whether a product shows in the public catalog. Pure. */
export function effectiveVisibility(
  product: { status: "active" | "discontinued" },
  override: { visible: boolean | null; reviewed: boolean; archivedAt?: Date | null } | null | undefined,
  settings: { autoPublishNew: boolean },
): boolean {
  if (override?.archivedAt) return false;
  if (product.status === "discontinued") return false;
  if (override && override.visible !== null) return override.visible;
  if (override?.reviewed) return true;
  return settings.autoPublishNew;
}
