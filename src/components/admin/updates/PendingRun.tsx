"use client";

import { useActionState, useState } from "react";
import {
  applyAction,
  discardAction,
  type UpdatesActionState,
} from "../../../app/admin/actualizaciones/actions";
import type { AdminRun } from "../../../server/admin/sync";


export function PendingRun({ run }: { run: AdminRun }) {
  const [applyState, apply, applying] = useActionState<UpdatesActionState, FormData>(applyAction, {});
  const [discardState, discard, discarding] = useActionState<UpdatesActionState, FormData>(discardAction, {});
  const [confirming, setConfirming] = useState<"apply" | "discard" | null>(null);
  const busy = applying || discarding;
  const error = applyState.error ?? discardState.error;
  const additions = run.changes.filter((c) => c.type === "new");

  return (
    <section className="admin-card upd-pending" aria-labelledby="upd-pending-title">
      <h2 id="upd-pending-title">Productos nuevos propuestos: {additions.length}</h2>
      {additions.length > 0 ? (
        <details className="upd-group">
          <summary>Ver códigos</summary>
          <ul>
            {additions.map((c) => (
              <li key={c.code}><code>{c.code}</code> {c.name ?? ""}</li>
            ))}
          </ul>
        </details>
      ) : <p>Esta búsqueda no contiene altas. No se modificarán los productos existentes.</p>}
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
              ? "¿Agregar solo los códigos que todavía no están en el catálogo? Los productos nuevos quedarán para revisar (o publicados, según Ajustes)."
              : "¿Descartar esta actualización? No se aplicará ningún cambio."}
          </p>
          <div className="upd-actions">
            <button type="submit" className="admin-btn" disabled={busy} aria-busy={busy}>
              {busy ? "Procesando…" : confirming === "apply" ? "Sí, confirmar" : "Sí, descartar"}
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
