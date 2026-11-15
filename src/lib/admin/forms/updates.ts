type FormLike = { get(name: string): FormDataEntryValue | null };

export function noticeText(s: { new: number; changed: number; removed: number }): string {
  return `Masefer agregó ${s.new} nuevos, ${s.changed} cambiaron, ${s.removed} se dieron de baja — ¿Actualizar?`;
}

export function changeKindLabel(t: "new" | "changed" | "removed"): string {
  return t === "new" ? "Nuevo" : t === "changed" ? "Cambió" : "De baja";
}

export function parseRunId(f: FormLike): number | null {
  const v = f.get("runId");
  if (typeof v !== "string" || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  applied: "Aplicada",
  discarded: "Descartada",
  failed: "Fallida",
  checking: "Verificando",
};

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
}
