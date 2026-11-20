"use server";

import { revalidatePath } from "next/cache";
import {
  AdminNotFoundError,
  AdminValidationError,
  archiveProducts,
  bulkUpdate,
  bulkUpdateFiltered,
  restoreProducts,
  resetCustomImage,
  updateOverride,
  type OverridePatch,
} from "../../../server/admin";
import { requireAdmin } from "../../../server/auth/session";
import { getAdminDb } from "../../../lib/admin/products/db";
import { parseBulkForm, parseProductForm } from "../../../lib/admin/products/query";
import type { ActionState } from "../../../lib/admin/products/state";

function revalidateProducts(codes: string[]) {
  revalidatePath("/admin/productos");
  for (const c of codes) revalidatePath(`/admin/productos/${encodeURIComponent(c)}`);
  revalidatePath("/");
  revalidatePath("/buscar");
  revalidatePath("/categoria/[slug]", "page");
  revalidatePath("/producto/[code]", "page");
}

function toState(e: unknown): ActionState {
  if (e instanceof AdminValidationError) {
    const first = Object.values(e.fields)[0];
    return { ok: false, message: first ? "Revisá los campos marcados" : "Datos inválidos", errors: e.fields };
  }
  if (e instanceof AdminNotFoundError) return { ok: false, message: e.message };
  throw e;
}

/** Row visibility toggle (plain form action). */
export async function toggleVisibilityAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const code = String(formData.get("code") ?? "");
  const visible = formData.get("visible") === "true";
  try {
    await updateOverride(getAdminDb(), code, { visible });
  } catch (e) {
    toState(e);
  }
  revalidateProducts([code]);
}

/** Nuevos tab: Publicar (visible) / Descartar (reviewed + hidden). */
export async function reviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const code = String(formData.get("code") ?? "");
  const patch: OverridePatch =
    formData.get("intent") === "publish" ? { visible: true, reviewed: true } : { visible: false, reviewed: true };
  try {
    await updateOverride(getAdminDb(), code, patch);
  } catch (e) {
    toState(e);
  }
  revalidateProducts([code]);
}

/** S6: "Volver a Nuevos" — undoes a review. reviewed=false and no visibility decision
 *  (visible=null), so the product re-enters the "Nuevos para revisar" queue. */
export async function unreviewAction(code: string): Promise<ActionState> {
  await requireAdmin();
  if (!code) return { ok: false, message: "Producto inválido" };
  try {
    await updateOverride(getAdminDb(), code, { reviewed: false, visible: null });
  } catch (e) {
    return toState(e);
  }
  revalidateProducts([code]);
  return { ok: true, message: "Vuelto a Nuevos para revisar" };
}

const updatedMessage = (updated: number) => `${updated} producto${updated === 1 ? "" : "s"} actualizado${updated === 1 ? "" : "s"}`;

export async function bulkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseBulkForm(formData);
  if (!parsed.ok) return { ok: false, message: parsed.error };
  try {
    if (parsed.scope === "all") {
      // S5: the server resolves the codes from the same filter; no client code list at this scale.
      const { updated } = await bulkUpdateFiltered(getAdminDb(), parsed.filter, parsed.patch);
      revalidateProducts([]);
      return { ok: true, message: updatedMessage(updated) };
    }
    const { updated } = await bulkUpdate(getAdminDb(), parsed.codes, parsed.patch);
    revalidateProducts(parsed.codes);
    return { ok: true, message: updatedMessage(updated) };
  } catch (e) {
    const s = toState(e);
    return { ...s, message: s.errors ? Object.values(s.errors).join(". ") : s.message };
  }
}

export async function updateProductAction(code: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    await updateOverride(getAdminDb(), code, parseProductForm(formData));
    revalidateProducts([code]);
    return { ok: true, message: "Cambios guardados" };
  } catch (e) {
    return toState(e);
  }
}

export async function resetImageAction(code: string): Promise<void> {
  await requireAdmin();
  try {
    await resetCustomImage(getAdminDb(), code);
  } catch (e) {
    toState(e);
  }
  revalidateProducts([code]);
}

/** Eliminar: archives (soft delete) so the public catalog and supplier sync never see it again. */
export async function archiveAction(code: string): Promise<ActionState> {
  await requireAdmin();
  if (!code) return { ok: false, message: "Producto inválido" };
  try {
    await archiveProducts(getAdminDb(), [code]);
  } catch (e) {
    return toState(e);
  }
  revalidateProducts([code]);
  return { ok: true, message: "Producto eliminado" };
}

/** Restaurar / Deshacer: clears the archive flag. */
export async function restoreAction(code: string): Promise<ActionState> {
  await requireAdmin();
  if (!code) return { ok: false, message: "Producto inválido" };
  try {
    await restoreProducts(getAdminDb(), [code]);
  } catch (e) {
    return toState(e);
  }
  revalidateProducts([code]);
  return { ok: true, message: "Producto restaurado" };
}
