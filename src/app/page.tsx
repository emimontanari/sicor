import type { Metadata } from "next";
import { Catalog } from "../components/Catalog";
import { toCatalogItem } from "../lib/catalog/items";
import { buildPageMetadata, SITE_DESCRIPTION } from "../lib/seo/metadata";
import { listCategories, listProducts } from "../server/catalog";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    ...buildPageMetadata({
      title: "CATÁLOGO COMERCIAL | SICOR",
      description: SITE_DESCRIPTION,
      path: "/",
    }),
    title: { absolute: "CATÁLOGO COMERCIAL | SICOR" },
  };
}

/**
 * Single-page catalog. All visible products ship once as a slim list (~100 B each, ~550 items =
 * tens of KB gzipped) and are filtered on the client: chips/sheet/search react instantly, no
 * server round trip per tap, and the URL (?categoria=&marca=&q=) stays the source of truth so
 * links are shareable and back/forward works. The filter is read from the URL during SSR too,
 * so a shared link renders already filtered.
 */
export default async function Home() {
  const [categories, products] = await Promise.all([listCategories(), listProducts()]);
  return (
    <Catalog
      items={products.map(toCatalogItem)}
      categories={categories
        .filter((c) => c.count > 0)
        .map((c) => ({ slug: c.slug, name: c.name, count: c.count }))}
    />
  );
}
