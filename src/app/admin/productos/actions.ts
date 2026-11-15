"use server";

import { revalidatePath } from "next/cache";
import {
  AdminNotFoundError,
  AdminValidationError,
  bulkUpdate,
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

export async function bulkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseBulkForm(formData);
  if (!parsed.ok) return { ok: false, message: parsed.error };
  try {
    const { updated } = await bulkUpdate(getAdminDb(), parsed.codes, parsed.patch);
    revalidateProducts(parsed.codes);
    return { ok: true, message: `${updated} producto${updated === 1 ? "" : "s"} actualizado${updated === 1 ? "" : "s"}` };
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
