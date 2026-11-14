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
    sneakproVariants: sneak?.variants.length ?? null,
    ms: Date.now() - t0,
  }),
);
