import { eq } from "drizzle-orm";
import type { TestDb } from "../db";
import { settings } from "../db/schema";
import { AdminValidationError, type Db } from "./errors";

export const MAX_TEMPLATE = 500;

export type AdminSettings = {
  whatsappNumber: string | null;
  messageTemplate: string | null;
  autoPublishNew: boolean;
  showPrices: boolean;
};
export type SettingsPatch = Partial<AdminSettings>;

export async function getSettings(db: Db): Promise<AdminSettings> {
  const [row] = await (db as TestDb).select().from(settings).where(eq(settings.id, 1));
  return {
    whatsappNumber: row?.whatsappNumber ?? null,
    messageTemplate: row?.messageTemplate ?? null,
    autoPublishNew: row?.autoPublishNew ?? false,
    showPrices: row?.showPrices ?? false,
  };
}

/** S6: validated partial update of the single settings row (upsert id=1). */
export async function updateSettings(db: Db, patch: SettingsPatch): Promise<AdminSettings> {
  const errors: Record<string, string> = {};
  const set: SettingsPatch = {};
  const p = (patch ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(p))
    if (!["whatsappNumber", "messageTemplate", "autoPublishNew", "showPrices"].includes(k)) errors[k] = "Campo desconocido";
  if ("whatsappNumber" in p) {
    const v = p.whatsappNumber;
    if (v === null) set.whatsappNumber = null;
    else if (typeof v === "string") {
      // Tolerate common formatting (spaces, dashes, parentheses, leading +), then require digits only.
      const digits = v.trim().replace(/^\+/, "").replace(/[\s\-().]/g, "");
      if (digits === "") set.whatsappNumber = null;
      else if (/^\d{8,15}$/.test(digits)) set.whatsappNumber = digits;
      else errors.whatsappNumber = "Debe tener entre 8 y 15 dígitos";
    } else errors.whatsappNumber = "Debe tener entre 8 y 15 dígitos";
  }
  if ("messageTemplate" in p) {
    const v = p.messageTemplate;
    if (v === null) set.messageTemplate = null;
    else if (typeof v === "string") {
      const t = v.trim();
      if (t.length > MAX_TEMPLATE) errors.messageTemplate = `Máximo ${MAX_TEMPLATE} caracteres`;
      else set.messageTemplate = t === "" ? null : t;
    } else errors.messageTemplate = "Debe ser texto";
  }
  for (const k of ["autoPublishNew", "showPrices"] as const) {
    if (k in p) {
      if (typeof p[k] === "boolean") set[k] = p[k] as boolean;
      else errors[k] = "Debe ser verdadero o falso";
    }
  }
  if (Object.keys(errors).length) throw new AdminValidationError(errors);
  const d = db as TestDb;
  if (Object.keys(set).length === 0) {
    return getSettings(db);
  }
  await d.insert(settings).values({ id: 1, ...set }).onConflictDoUpdate({ target: settings.id, set });
  return getSettings(db);
}
