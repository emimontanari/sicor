import type { Metadata } from "next";
import { CheckButton } from "../../../components/admin/updates/CheckButton";
import { PendingRun } from "../../../components/admin/updates/PendingRun";
import { UpdatesBanner } from "../../../components/admin/updates/UpdatesBanner";
import { formatDate, STATUS_LABEL } from "../../../lib/admin/forms/updates";
import { getLastRuns, getPendingRun, type AdminRun } from "../../../server/admin";
import { requireAdmin } from "../../../server/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Actualizaciones", robots: { index: false, follow: false } };

function Counts({ run }: { run: AdminRun }) {
  const s = run.summary;
  if (!s) return <>—</>;
  if (run.status === "applied" && (s.changed || s.removed)) {
    return <>{s.new} nuevos · {s.changed} cambiaron · {s.removed} de baja</>; // Historical, before append-only sync.
  }
  return run.status === "applied" ? <>{s.new} agregados</> : <>{s.new} nuevos propuestos</>;
}

export default async function UpdatesPage() {
  await requireAdmin();
  const [pending, runs] = await Promise.all([getPendingRun(), getLastRuns(10)]);
  const latest = runs[0] ?? null;
  const lastApplied = runs.find((r) => r.status === "applied" && (r.summary?.imageWarnings ?? 0) > 0);
  const warnings = lastApplied?.summary?.imageWarningList ?? [];
  return (
    <main className="upd-page">
      <h1>Actualizaciones de Masefer</h1>
      <UpdatesBanner pending={pending} latest={latest} linkToPage={false} />
      {latest?.status === "failed" ? (
        <p className="admin-card upd-failed" role="alert">
          <strong>Falló la última búsqueda</strong> ({formatDate(latest.startedAt)}): {latest.error ?? "error desconocido"}
        </p>
      ) : null}
      {pending ? (
        <>
          <p>Las búsquedas pendientes se revisan de a una. Confirmar o descartar esta muestra la siguiente, si la hay.</p>
          <PendingRun key={pending.id} run={pending} />
        </>
      ) : (
        <p className="admin-card">No hay actualizaciones pendientes.</p>
      )}
      <CheckButton />
      {lastApplied ? (
        <section className="admin-card upd-warnings">
          <h2>Imágenes con problemas ({lastApplied.summary?.imageWarnings})</h2>
          <p>Última actualización aplicada: {formatDate(lastApplied.appliedAt)}.</p>
          {warnings.length ? (
            <details>
              <summary>Ver lista</summary>
              <ul>
                {warnings.map((w, i) => (
                  <li key={`${w.code}-${i}`}>
                    <code>{w.code}</code> — {w.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}
      <section className="admin-card">
        <h2>Últimas búsquedas</h2>
        {runs.length === 0 ? (
          <p>Todavía no hay búsquedas.</p>
        ) : (
          <div className="upd-table-wrap">
            <table className="upd-table">
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Origen</th>
                  <th>Estado</th>
                  <th>Cambios</th>
                  <th>Aplicada</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.startedAt)}</td>
                    <td>{r.trigger === "manual" ? "Manual" : "Programada"}</td>
                    <td>{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td>
                      <Counts run={r} />
                    </td>
                    <td>{formatDate(r.appliedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
