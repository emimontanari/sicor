import Link from "next/link";
import type { AdminRun } from "../../../server/admin/sync";

/** Compact pending/failed notice. Pass the pending run and/or the latest run (server-fetched). */
export function UpdatesBanner({
  pending,
  latest,
  linkToPage = true,
}: {
  pending: AdminRun | null;
  latest?: AdminRun | null;
  linkToPage?: boolean;
}) {
  if (pending) {
    return (
      <div className="upd-banner upd-banner--pending" role="status">
        <span>Hay una búsqueda de productos pendiente de revisión.</span>
        {linkToPage ? <Link href="/admin/actualizaciones">Revisar</Link> : null}
      </div>
    );
  }
  if (latest?.status === "failed") {
    return (
      <div className="upd-banner upd-banner--failed" role="alert">
        <span>La última búsqueda de actualizaciones falló{latest.error ? `: ${latest.error}` : "."}</span>
        {linkToPage ? <Link href="/admin/actualizaciones">Ver</Link> : null}
      </div>
    );
  }
  return null;
}
