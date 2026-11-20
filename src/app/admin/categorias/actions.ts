"use server";

import { revalidatePath } from "next/cache";
import { getAdminDb } from "../../../lib/admin/products/db";
import type { ActionState } from "../../../lib/admin/products/state";
import {
  AdminNotFoundError,
  AdminValidationError,
  createCategory,
  deleteCategory,
  renameCategory,
} from "../../../server/admin";
import { requireAdmin } from "../../../server/auth/session";

function revalidateAll() {
  revalidatePath("/admin/categorias");
  revalidatePath("/admin/productos");
  revalidatePath("/", "layout");
}

function toState(e: unknown): ActionState {
  if (e instanceof AdminValidationError) {
    const first = Object.values(e.fields)[0];
    return { ok: false, message: first ?? "Datos inválidos", errors: e.fields };
  }
  if (e instanceof AdminNotFoundError) return { ok: false, message: "La categoría ya no existe" };
  return { ok: false, message: "No se pudo guardar" };
}

/** Adds a category (id = null) or renames an existing one. */
export async function saveCategoryAction(id: number | null, name: string): Promise<ActionState> {
  await requireAdmin();
  try {
    if (id === null) await createCategory(getAdminDb(), name);
    else await renameCategory(getAdminDb(), id, name);
  } catch (e) {
    return toState(e);
  }
  revalidateAll();
  return { ok: true, message: id === null ? "Categoría agregada" : "Categoría actualizada" };
}

export async function deleteCategoryAction(id: number): Promise<ActionState> {
  await requireAdmin();
  try {
    await deleteCategory(getAdminDb(), id);
  } catch (e) {
    return toState(e);
  }
  revalidateAll();
  return { ok: true, message: "Categoría eliminada" };
}
