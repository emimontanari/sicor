import type { CategorySlug } from "./category-mappings";

/**
 * Products listed in the SICOR PDF catalog (pdftotext of
 * SICOR_catalogo_interior_editable_Canva.pptx.pdf, pages 2-6). Only the
 * "INDUMENTARIA LABORAL" section has real products; the other sections are
 * template placeholders ("Nombre del producto"). Names match Masefer
 * DENOMINACION exactly unless `match` says otherwise.
 *
 * `match`: "exact" = identical normalized name; "prefix" = Masefer name is the
 * PDF name plus a brand suffix; "series" = the PDF name covers a series of
 * size-range products in Masefer, so every code of that series is listed
 * (heuristic, review in the dashboard).
 */
export interface PdfProduct {
  code: string;
  pdfName: string;
  categorySlug: CategorySlug | "productos-destacados";
  note: string | null;
  match: "exact" | "prefix" | "series";
}

const IND = "indumentaria-laboral" as const;
const pack = (n: number) => `Compre este producto por PACK de ${n} y agilice la entrega`;
const delay = "Este producto tiene demora en algunas variantes de talle/color.";

const p = (
  code: string,
  pdfName: string,
  note: string | null,
  match: PdfProduct["match"] = "exact",
): PdfProduct => ({ code, pdfName, categorySlug: IND, note, match });

export const PDF_PRODUCTS: PdfProduct[] = [
  p("ELASTIZA", "PANTALON CARGO ELASTIZADO PAMPERO 38/54", delay),
  p("PAC12", "PANTALON CARGO MSF TALLE 38-60", pack(10)),
  p("PAC17", "PANTALON CARGO OMBU C/REFUERZO 36 / 60", delay),
  p("PAC03", "PANTALON CARGO FUELLE PAMPERO T. 38 / 54", delay),
  p("REM01", "REMERA ALGODON PEINADO 24/1 M/CORTA", pack(20), "prefix"),
  p("CHO01", "CHOMBA DE PIQUE M/C", pack(20)),
  p("CHO10", "CHOMBA DE JERSEY M/C MSF", delay),
  p("ROMP12", "ROMPEVIENTO IMPORTADO", delay),
  p("MAMGRAF", "MAMELUCO GABARDINA AZUL MARINO OMBU 44-60", null, "prefix"),
  ...["CAM20", "CAM22", "CAM23", "CAM33"].map((c) => p(c, "CAMISA DE TRABAJO OMBU T. VARIOS", null, "series")),
  p("BUZ01", "BUZO DE FRISA INVISIBLE", pack(10), "prefix"),
  p("CHA05", "CHALECO DE POLAR", pack(5), "prefix"),
  ...["PAN18", "PAN19"].map((c) => p(c, "PANTALON DE TRABAJO OMBU", null, "series")),
  p("PAN37", "PANTALON DE TRAB G.70 T.36 / 60 NARANJA", null),
  p("CAMP23", "CAMPERA PARKA C/CAPUCHA TRUCKER / GUATA", null),
  p("BUZ02", "BUZO DE POLAR MEDIO CIERRE", null, "prefix"),
  p("GOR01", "GORRA DE GABARDINA", null),
  ...["CAM24", "CAM25", "CAM26", "CAM31"].map((c) => p(c, "CAMISA DE TRABAJO OMBU NARANJA", null, "series")),
  ...["CAM01", "CAM02"].map((c) => p(c, "CAMISA DE TRABAJO PAMPERO", null, "series")),
  p("CAMP01", "CAMPERA DE POLAR", pack(5), "prefix"),
];
