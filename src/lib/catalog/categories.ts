/** Presentation metadata for categories (short chip labels and placeholder icons). */
export type CategoryIconId = "shoe" | "shirt" | "helmet" | "goggles" | "glove" | "cone" | "box";

const SHORT: Record<string, string> = {
  "indumentaria-laboral": "Indumentaria",
  "calzado-de-seguridad": "Calzado",
  "elementos-de-proteccion-personal": "EPP",
  "proteccion-ocular-y-auditiva": "Ocular y auditiva",
  "guantes-de-proteccion": "Guantes",
  "seguridad-vial": "Seguridad vial",
  "productos-destacados": "Destacados",
  otros: "Otros",
};

const ICON: Record<string, CategoryIconId> = {
  "indumentaria-laboral": "shirt",
  "calzado-de-seguridad": "shoe",
  "elementos-de-proteccion-personal": "helmet",
  "proteccion-ocular-y-auditiva": "goggles",
  "guantes-de-proteccion": "glove",
  "seguridad-vial": "cone",
};

export const categoryShortName = (slug: string, name: string): string => SHORT[slug] ?? name;
export const categoryIcon = (slug: string): CategoryIconId => ICON[slug] ?? "box";
