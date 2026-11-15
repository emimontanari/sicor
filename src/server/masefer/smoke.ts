import { MaseferClient } from "./client";

const t0 = Date.now();
const catalog = await new MaseferClient().fetchCatalog();
const variants = catalog.products.reduce((n, p) => n + p.variants.length, 0);
const sneak = catalog.products.find((p) => p.code === "SNEAKPRO");
console.log(
  JSON.stringify({
    metaCategories: catalog.metaCategories.length,
    categories: catalog.categories.length,
    brands: catalog.brands.length,
    products: catalog.products.length,
    variants,
    productsWithImages: catalog.products.filter((p) => p.images.small.length + p.images.large.length > 0).length,
    productsWithDocuments: catalog.products.filter((p) => (p.documents ?? []).length > 0).length,
    documents: catalog.products.reduce((n, p) => n + (p.documents ?? []).length, 0),
    productsWithFicha: catalog.products.filter((p) => (p.documents ?? []).some((d) => d.kind === "ficha")).length,
    sneakproDocuments: sneak?.documents?.length ?? null,
    sneakproVariants: sneak?.variants.length ?? null,
    ms: Date.now() - t0,
  }),
);
