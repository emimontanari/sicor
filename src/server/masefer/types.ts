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

export interface SupplierDocument {
  /** "ficha" = the product's technical sheet; "certificacion" = any other PDF (certificates, manuals...). */
  kind: "ficha" | "certificacion";
  /** Human readable label, e.g. "Ficha técnica", "Licencia IRAM". */
  label: string;
  /** Supplier (Dropbox) URL. Never shown to shoppers: PDFs are copied to our storage. */
  url: string;
  /** Original file name. */
  name: string;
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
  /** PDFs from `/web/catalogos/`: ficha técnica first, then certifications by label. The mapper always sets it; optional so payloads stored before this field existed still type-check. */
  documents?: SupplierDocument[];
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
