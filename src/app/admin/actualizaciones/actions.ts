"use server";

import { revalidatePath } from "next/cache";
import { applyRun, discardRun, runManualCheck } from "../../../server/admin";
import { requireAdmin } from "../../../server/auth/session";
import { parseRunId } from "../../../lib/admin/forms/updates";

export type UpdatesActionState = { ok?: boolean; message?: string; error?: string; at?: number };

function refresh(publicToo: boolean) {
  revalidatePath("/admin/actualizaciones");
  revalidatePath("/admin/productos");
  if (publicToo) revalidatePath("/", "layout");
}

export async function checkAction(): Promise<UpdatesActionState> {
  await requireAdmin();
  const r = await runManualCheck();
  refresh(false);
  if (!r.ok) return { error: r.error ?? "La búsqueda falló", at: Date.now() };
  const msg =
    r.status === "pending"
      ? "Hay novedades para confirmar."
      : "No hay cambios: el catálogo está al día.";
  return { ok: true, message: msg, at: Date.now() };
}

export async function applyAction(_p: UpdatesActionState, f: FormData): Promise<UpdatesActionState> {
  await requireAdmin();
  const id = parseRunId(f);
  if (id === null) return { error: "Actualización inválida" };
  const r = await applyRun(id);
  refresh(true);
  return r.ok ? { ok: true, message: "Catálogo actualizado.", at: Date.now() } : { error: r.error ?? "No se pudo aplicar" };
}

export async function discardAction(_p: UpdatesActionState, f: FormData): Promise<UpdatesActionState> {
  await requireAdmin();
  const id = parseRunId(f);
  if (id === null) return { error: "Actualización inválida" };
  const r = await discardRun(id);
  refresh(false);
  return r.ok ? { ok: true, message: "Actualización descartada.", at: Date.now() } : { error: r.error ?? "No se pudo cancelar" };
}
