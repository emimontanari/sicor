/**
 * Default Masefer taxonomy -> SICOR category mappings (S5, S8).
 * Derived from the live Masefer taxonomy (inspect.ts). "Productos destacados"
 * is only ever assigned manually, so it is never a mapping target. Families
 * not listed here stay unmapped and show under "Otros productos"
 * (BOTIQUINES, SOGAS, CONFECCION COLEGIAL/BUZOS|REMERAS are left out on purpose).
 */
export type CategorySlug =
  | "indumentaria-laboral"
  | "calzado-de-seguridad"
  | "elementos-de-proteccion-personal"
  | "proteccion-ocular-y-auditiva"
  | "guantes-de-proteccion"
  | "seguridad-vial";

export interface DefaultMapping {
  metaCategory: string;
  family: string;
  subfamily: string;
  categorySlug: CategorySlug;
}

const m = (
  categorySlug: CategorySlug,
  metaCategory: string,
  family: string,
  subfamilies: string[],
): DefaultMapping[] => subfamilies.map((subfamily) => ({ metaCategory, family, subfamily, categorySlug }));

const SI = "Seguridad Industrial";

export const DEFAULT_CATEGORY_MAPPINGS: DefaultMapping[] = [
  // Calzado
  ...m("calzado-de-seguridad", "Calzado", "CALZADO DE SEGURIDAD", [
    "BORCEGUIES",
    "BOTAS PVC",
    "BOTIN CON PUNTERA",
    "BOTIN SIN PUNTERA",
    "DIELECTRICOS",
    "ULTRALIVIANOS",
    "ZAPATILLA",
    "ZAPATO CON PUNTERA",
    "ZAPATO SIN PUNTERA",
  ]),
  // Indumentaria
  ...m("indumentaria-laboral", "Indumentaria", "CONFECCION STOCK", [
    "BUZOS",
    "CAMPERAS",
    "CHOMBAS",
    "PANTALONES CARGO",
    "PANTALONES",
    "POLAR",
    "REMERAS",
  ]),
  ...m("indumentaria-laboral", "Indumentaria", "INDUMENTARIA TIEMPO LIBRE", [
    "BERMUDAS",
    "BOMBACHAS DE CAMPO",
    "PANTALONES CARGO",
  ]),
  ...m("indumentaria-laboral", "Indumentaria", "INDUMENTARIA", ["CAMPERAS", "GORRAS", "PANTALONES"]),
  ...m("indumentaria-laboral", "Indumentaria", "ROPA DE TRABAJO", [
    "CAMISAS DE TRABAJO",
    "JEANS",
    "PANTALONES DE TRABAJO",
  ]),
  ...m("indumentaria-laboral", SI, "ROPA DE TRABAJO", ["CAMISAS DE TRABAJO"]),
  ...m("indumentaria-laboral", SI, "SEGURIDAD INDUSTRIAL", ["MAMELUCOS"]),
  // Elementos de protección personal
  ...m("elementos-de-proteccion-personal", SI, "SEGURIDAD INDUSTRIAL", [
    "ALTURA",
    "MANGAS Y DELANTALES",
    "PROTECCION CRANEANA",
    "PROTECCION LUMBAR",
    "PROTECCION PARA LLUVIA",
    "PROTECCION RESPIRATORIA",
    "PROTECCION SOLDADOR",
  ]),
  // Ocular y auditiva
  ...m("proteccion-ocular-y-auditiva", SI, "SEGURIDAD INDUSTRIAL", [
    "PROTECCION AUDITIVA",
    "PROTECCION FACIAL",
    "PROTECCION VISUAL",
  ]),
  // Guantes
  ...m("guantes-de-proteccion", SI, "SEGURIDAD INDUSTRIAL", ["GUANTES"]),
  // Seguridad vial
  ...m("seguridad-vial", SI, "SEGURIDAD VIAL", ["CHALECOS Y BANDOLERAS", "CONOS"]),
  ...m("seguridad-vial", "Seguridad Vial", "SEGURIDAD VIAL", [
    "BALIZAS",
    "CANALIZADORES",
    "CHALECOS Y BANDOLERAS",
    "CONOS",
    "ESPEJOS PARABOLICOS",
    "REDUCTORES VELOCIDAD",
    "SUJECION DE CARGAS",
  ]),
];
