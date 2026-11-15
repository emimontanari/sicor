import Link from "next/link";
import type { CatalogProduct } from "../server/catalog";
import { ProductImage } from "./ProductImage";

export function ProductCard({ product, priority = false }: { product: CatalogProduct; priority?: boolean }) {
  return (
    <li className="card">
      <Link href={`/producto/${encodeURIComponent(product.code)}`} className="card__link">
        <ProductImage src={product.images[0]} alt={product.name} priority={priority} />
        <h3 className="card__name">{product.name}</h3>
        {product.price ? (
          <p className="card__price">{product.price}</p>
        ) : null}
        <p className="card__cta">Consultar cotización</p>
      </Link>
    </li>
  );
}

export function ProductGrid({ products, priorityCount = 2 }: { products: CatalogProduct[]; priorityCount?: number }) {
  return (
    <ul className="grid">
      {products.map((p, i) => (
        <ProductCard key={p.code} product={p} priority={i < priorityCount} />
      ))}
    </ul>
  );
}
