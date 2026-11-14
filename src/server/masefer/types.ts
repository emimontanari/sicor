export interface MaseferCategory {
  metaCategory: string;
  subfamily: string;
}

export interface SupplierVariant {
  sku: string;
  color: string;
  size: string;
  text: string;
  stockTotal: number;
  published: boolean;
}

export interface SupplierProduct {
  /** GENERICO code, the supplier's stable product identifier. */
  code: string;
  name: string;
  /** Masefer does not publish a description. */
  description: null;
  brand: string;
  brandId: number;
  metaCategory: string;
  family: string;
  subfamily: string;
  unit: string;
  /** Price list 5. Quote-only catalog: never public by default. `null` if list 5 is absent. */
  supplierPrice: number | null;
  currency: string;
  images: { small: string[]; large: string[] };
  variants: SupplierVariant[];
}

export interface SupplierCatalog {
  metaCategories: string[];
  categories: MaseferCategory[];
  brands: string[];
  products: SupplierProduct[];
}

export interface MaseferSource {
  fetchCatalog(): Promise<SupplierCatalog>;
}
