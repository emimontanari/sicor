/** Confirmation copy for deleting a category (S2). */
export function deleteConfirmText(productCount: number): string {
  if (productCount === 0) return "No tiene productos.";
  if (productCount === 1) return "Su producto pasa a «Otros» en el catálogo.";
  return `Sus ${productCount} productos pasan a «Otros» en el catálogo.`;
}

export const productsLabel = (n: number) => `${n} producto${n === 1 ? "" : "s"}`;
