import Link from "next/link";
import { categoryIcon } from "../lib/catalog/categories";
import type { CatalogItem } from "../lib/catalog/filters";
import { Icon } from "./Icon";
import { ProductImage } from "./ProductImage";

type Props = {
  product: CatalogItem;
  priority?: boolean;
  /** Units of this product already in the quote (any variant). */
  quantity?: number;
  /** Quick add for products without variants. Without it the card has no add button. */
  onAdd?: (product: CatalogItem) => void;
};

export function ProductCard({ product, priority = false, quantity = 0, onAdd }: Props) {
  const href = `/producto/${encodeURIComponent(product.code)}`;
  const add = addControl(product, href, quantity, onAdd);
  const ficha = product.hasFicha && product.fichaUrl ? product.fichaUrl : null;
  const actions = add || ficha;
  return (
    <li className="card">
      <Link href={href} scroll={false} className="card__media" tabIndex={-1} aria-hidden>
        <ProductImage
          src={product.image}
          alt={product.name}
          code={product.code}
          icon={categoryIcon(product.category)}
          priority={priority}
        />
      </Link>
      <div className="card__body">
        <p className="card__meta">
          {product.brand ? <span className="card__brand">{product.brand}</span> : null}
          <span className="card__code">Cód. {product.code}</span>
        </p>
        <h3 className="card__name">
          <Link href={href} scroll={false}>{product.name}</Link>
        </h3>
        {product.price ? <p className="card__price">{product.price}</p> : null}
        <p className="card__cta">Consultar cotización</p>
      </div>
      {actions ? (
        <div className="card__actions">
          {add}
          {ficha ? (
            <a
              className="ficha"
              href={ficha}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ver ficha técnica (PDF)"
            >
              <Icon name="pdf" className="ficha__ico" />
              <span>Ficha técnica</span>
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function addControl(
  product: CatalogItem,
  href: string,
  quantity: number,
  onAdd: Props["onAdd"],
) {
  if (product.variants) {
    return (
      <Link href={href} scroll={false} className="add" aria-label={`Elegir talle o color de ${product.name}`}>
        <span>Elegir opciones</span>
        <Icon name="options" />
      </Link>
    );
  }
  if (!onAdd) return null;
  return (
    <button
      type="button"
      className={quantity > 0 ? "add is-added" : "add"}
      data-quote-add
      data-code={product.code}
      aria-label={`Agregar ${product.name} a la cotización`}
      onClick={() => onAdd(product)}
    >
      <Icon name={quantity > 0 ? "check" : "plus"} />
      <span>{quantity > 0 ? `Agregado (${quantity})` : "Agregar"}</span>
    </button>
  );
}
