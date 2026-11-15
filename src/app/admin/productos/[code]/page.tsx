import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageEditor } from "../../../../components/admin/products/ImageEditor";
import { ProductForm } from "../../../../components/admin/products/ProductForm";
import { getAdminDb } from "../../../../lib/admin/products/db";
import { getAdminProduct, listAdminCategories } from "../../../../server/admin";
import { requireAdmin } from "../../../../server/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar producto", robots: { index: false, follow: false } };

type Props = { params: Promise<{ code: string }> };

export default async function ProductEditPage({ params }: Props) {
  await requireAdmin();
  const code = decodeURIComponent((await params).code);
  const db = getAdminDb();
  const [product, categories] = await Promise.all([getAdminProduct(db, code), listAdminCategories(db)]);
  if (!product) notFound();
  const o = product.override;
  const s = product.supplier;
  const dash = (v: string | null) => v || "—";

  return (
    <main className="pr-page">
      <p>
        <Link href="/admin/productos" className="pr-link">
          ← Volver a productos
        </Link>
      </p>
      <h1>{product.effective.name}</h1>
      <p className="pr-muted">
        {product.code} · {product.effective.visible ? "Visible" : "Oculto"}
        {s.status === "discontinued" ? " · Discontinuado" : ""} ·{" "}
        <Link href={`/producto/${encodeURIComponent(product.code)}`} className="pr-link" target="_blank">
          Ver en el sitio público
        </Link>
      </p>

      <div className="pr-edit">
        <div className="pr-edit__main">
          <ProductForm
            code={product.code}
            supplierName={s.name}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            values={{
              customName: o?.customName ?? "",
              customDescription: o?.customDescription ?? "",
              customPrice: o?.customPrice ?? "",
              showPrice: o?.showPrice ?? false,
              visible: o?.visible === true ? "true" : o?.visible === false ? "false" : "default",
              categoryId: o?.categoryId ? String(o.categoryId) : "",
            }}
          />
          <ImageEditor code={product.code} customUrl={product.images.custom} supplierUrl={product.images.supplier[0] ?? null} />
        </div>

        <section className="admin-card pr-supplier" aria-label="Datos del proveedor">
          <h2>Datos del proveedor (solo lectura)</h2>
          <dl>
            <dt>Nombre</dt>
            <dd>{s.name}</dd>
            <dt>Marca</dt>
            <dd>{dash(s.brand)}</dd>
            <dt>Familia</dt>
            <dd>{[s.metaCategory, s.family, s.subfamily].filter(Boolean).join(" › ") || "—"}</dd>
            <dt>Categoría actual</dt>
            <dd>{product.effective.category?.name ?? "Otros"}</dd>
            <dt>Unidad</dt>
            <dd>{dash(s.unit)}</dd>
            <dt>Precio proveedor</dt>
            <dd>{s.supplierPrice ? `${s.supplierPrice} ${s.currency ?? ""}` : "—"}</dd>
          </dl>
          <h3>Variantes ({product.variants.length})</h3>
          {product.variants.length === 0 ? (
            <p className="pr-muted">Sin variantes.</p>
          ) : (
            <ul className="pr-variants">
              {product.variants.map((v) => (
                <li key={v.sku}>
                  <strong>{v.sku}</strong> {[v.color, v.size, v.text].filter(Boolean).join(" · ")}
                  <span className="pr-muted">
                    {" "}
                    · stock {v.stockTotal ?? "—"}
                    {v.published ? "" : " · no publicada"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3>Imágenes del proveedor ({product.images.supplier.length})</h3>
          <div className="pr-gallery">
            {product.images.supplier.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="" loading="lazy" width={96} height={96} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
