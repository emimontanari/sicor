import type { Metadata } from "next";
import { CategoryList } from "../../../components/admin/categories/CategoryList";
import { getAdminDb } from "../../../lib/admin/products/db";
import { listCategoriesWithCounts } from "../../../server/admin";
import { requireAdmin } from "../../../server/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Categorías", robots: { index: false, follow: false } };

export default async function CategoriesPage() {
  await requireAdmin();
  const items = await listCategoriesWithCounts(getAdminDb());
  return (
    <main className="cat-page">
      <h1>Categorías</h1>
      <CategoryList items={items.map(({ id, name, productCount }) => ({ id, name, productCount }))} />
    </main>
  );
}
