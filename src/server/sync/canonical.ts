import { createHash } from "node:crypto";
import type { SupplierProduct } from "../masefer";

/** Supplier fields tracked for change detection, in report order. */
export const FIELDS = [
  "name",
  "brand",
  "metaCategory",
  "family",
  "subfamily",
  "unit",
  "supplierPrice",
  "currency",
  "images",
  "variants",
] as const;
export type Field = (typeof FIELDS)[number];

export type Canonical = Record<Field, unknown>;

/** Images that get stored/copied: large when available, else small. */
export const imageUrls = (p: Pick<SupplierProduct, "images">): string[] =>
  p.images.large.length > 0 ? p.images.large : p.images.small;

type CanonVariant = {
  sku: string;
  color: string | null;
  size: string | null;
  text: string | null;
  stockTotal: number | null;
  published: boolean;
};

export const sortVariants = (v: CanonVariant[]) =>
  [...v]
    .map((x) => ({
      sku: x.sku,
      color: x.color,
      size: x.size,
      text: x.text,
      stockTotal: x.stockTotal,
      published: x.published,
    }))
    .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));

export function canonicalFromSupplier(p: SupplierProduct): Canonical {
  return {
    name: p.name,
    brand: p.brand,
    metaCategory: p.metaCategory,
    family: p.family,
    subfamily: p.subfamily,
    unit: p.unit,
    supplierPrice: p.supplierPrice === null ? null : Number(p.supplierPrice),
    currency: p.currency,
    images: imageUrls(p),
    variants: sortVariants(p.variants),
  };
}

export function canonicalFromRow(
  row: {
    name: string;
    brand: string | null;
    metaCategory: string | null;
    family: string | null;
    subfamily: string | null;
    unit: string | null;
    supplierPrice: string | null;
    currency: string | null;
    supplierImages: string[];
  },
  variants: CanonVariant[],
): Canonical {
  return {
    name: row.name,
    brand: row.brand,
    metaCategory: row.metaCategory,
    family: row.family,
    subfamily: row.subfamily,
    unit: row.unit,
    supplierPrice: row.supplierPrice === null ? null : Number(row.supplierPrice),
    currency: row.currency,
    images: row.supplierImages,
    variants: sortVariants(variants),
  };
}

/** Stable content hash over the canonical supplier fields (fixed key order). */
export function contentHash(c: Canonical): string {
  return createHash("sha256")
    .update(JSON.stringify(FIELDS.map((f) => c[f])))
    .digest("hex");
}

export function changedFields(a: Canonical, b: Canonical): Field[] {
  return FIELDS.filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
}
