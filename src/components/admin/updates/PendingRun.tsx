"use client";

import { useActionState, useState } from "react";
import {
  applyAction,
  discardAction,
  type UpdatesActionState,
} from "../../../app/admin/actualizaciones/actions";
import type { AdminRun } from "../../../server/admin/sync";
import { changeKindLabel, noticeText } from "../../../lib/admin/forms/updates";

const GROUPS = ["new", "changed", "removed"] as const;

export function PendingRun({ run }: { run: AdminRun }) {
  const [applyState, apply, applying] = useActionState<UpdatesActionState, FormData>(applyAction, {});
  const [discardState, discard, discarding] = useActionState<UpdatesActionState, FormData>(discardAction, {});
  const [confirming, setConfirming] = useState<"apply" | "discard" | null>(null);
  const busy = applying || discarding;
  const error = applyState.error ?? discardState.error;
  const s = run.summary ?? { new: 0, changed: 0, removed: 0 };

  return (
    <section className="admin-card upd-pending" aria-labelledby="upd-pending-title">
      <h2 id="upd-pending-title">{noticeText(s)}</h2>
      {GROUPS.map((g) => {
        const items = run.changes.filter((c) => c.type === g);
        if (items.length === 0) return null;
        return (
          <details key={g} className="upd-group">
            <summary>
              {changeKindLabel(g)} ({items.length})
            </summary>
            <ul>
              {items.map((c) => (
                <li key={`${g}-${c.code}`}>
                  <code>{c.code}</code> {c.name ?? ""}{" "}
                  <span className="upd-kind">{changeKindLabel(c.type)}</span>
                  {c.fields?.length ? <span className="upd-fields"> · {c.fields.join(", ")}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      {error ? (
        <p role="alert" className="admin-error">
          {error}
        </p>
      ) : null}
      {confirming === null ? (
        <div className="upd-actions">
          <button type="button" className="admin-btn" onClick={() => setConfirming("apply")}>
            Confirmar
          </button>
          <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setConfirming("discard")}>
            Cancelar
          </button>
        </div>
      ) : (
        <form action={confirming === "apply" ? apply : discard} className="upd-confirm">
          <input type="hidden" name="runId" value={run.id} />
          <p>
            {confirming === "apply"
              ? "¿Aplicar estos cambios al catálogo? Los productos nuevos quedarán para revisar (o publicados, según Ajustes)."
              : "¿Descartar esta actualización? No se aplicará ningún cambio."}
          </p>
          <div className="upd-actions">
            <button type="submit" className="admin-btn" disabled={busy} aria-busy={busy}>
              {busy ? "Procesando…" : confirming === "apply" ? "Sí, actualizar" : "Sí, descartar"}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={busy}
              onClick={() => setConfirming(null)}
            >
              Volver
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
