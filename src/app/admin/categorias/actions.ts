"use server";

import { revalidatePath } from "next/cache";
import { parseMappingForm } from "../../../lib/admin/forms/mappings";
import { withDb } from "../../../lib/admin/forms/with-db";
import { AdminNotFoundError, AdminValidationError, setMapping } from "../../../server/admin";
import { requireAdmin } from "../../../server/auth/session";

export type MappingState = { ok?: boolean; error?: string; at?: number };

export async function setMappingAction(_p: MappingState, f: FormData): Promise<MappingState> {
  await requireAdmin();
  const { triple, categoryId } = parseMappingForm(f);
  if (Number.isNaN(categoryId)) return { error: "Categoría inválida" };
  try {
    await withDb((db) => setMapping(db, triple, categoryId));
  } catch (e) {
    if (e instanceof AdminValidationError || e instanceof AdminNotFoundError) return { error: Object.values(e instanceof AdminValidationError ? e.fields : {})[0] ?? e.message };
    return { error: "No se pudo guardar" };
  }
  revalidatePath("/admin/categorias");
  revalidatePath("/admin/productos");
  revalidatePath("/", "layout");
  return { ok: true, at: Date.now() };
}
