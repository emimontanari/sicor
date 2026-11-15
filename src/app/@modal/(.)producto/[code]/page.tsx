import { PRODUCT_TITLE_ID, ProductDetail } from "../../../../components/ProductDetail";
import { ProductSheet } from "../../../../components/ProductSheet";
import { getProduct } from "../../../../server/catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/** Soft navigation to /producto/<code>: same content as the page, in a sheet over the catalog. */
export default async function ProductSheetPage({ params }: Params) {
  const { code } = await params;
  const decoded = decodeURIComponent(code);
  const product = await getProduct(decoded);
  return (
    <ProductSheet key={decoded} code={decoded} labelId={PRODUCT_TITLE_ID}>
      {product ? (
        <ProductDetail product={product} variant="sheet" />
      ) : (
        <div className="section">
          <h1 className="page-title" id={PRODUCT_TITLE_ID}>
            Producto no encontrado
          </h1>
          <p className="note">Este producto ya no está disponible en el catálogo.</p>
        </div>
      )}
    </ProductSheet>
  );
}
