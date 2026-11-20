"use server";

import { revalidatePath } from "next/cache";
import { parseSettingsForm } from "../../../lib/admin/forms/settings";
import { withDb } from "../../../lib/admin/forms/with-db";
import { AdminValidationError, updateSettings } from "../../../server/admin";
import { requireAdmin } from "../../../server/auth/session";

export type SettingsState = { ok?: boolean; error?: string; fields?: Record<string, string>; at?: number };

export async function saveSettingsAction(_p: SettingsState, f: FormData): Promise<SettingsState> {
  await requireAdmin();
  const v = parseSettingsForm(f);
  try {
    await withDb((db) =>
      updateSettings(db, {
        whatsappNumber: v.whatsappNumber,
        messageTemplate: v.messageTemplate,
        showPrices: v.showPrices,
      }),
    );
  } catch (e) {
    if (e instanceof AdminValidationError) return { fields: e.fields };
    return { error: "No se pudieron guardar los ajustes" };
  }
  revalidatePath("/admin/ajustes");
  revalidatePath("/", "layout");
  return { ok: true, at: Date.now() };
}
