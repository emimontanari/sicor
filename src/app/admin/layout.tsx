import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminNav } from "../../components/admin/shell/AdminNav";
import { UpdatesBanner } from "../../components/admin/updates/UpdatesBanner";
import { getLastRuns, getPendingRun, type AdminRun } from "../../server/admin";
import { getAdminSession } from "../../server/auth/session";
import "./admin.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin SICOR" },
  robots: { index: false, follow: false },
};

async function loadRuns(): Promise<{ pending: AdminRun | null; latest: AdminRun | null } | null> {
  try {
    // The sync wrappers open and close their own short-lived pool per call.
    const [pending, [latest]] = await Promise.all([getPendingRun(), getLastRuns(1)]);
    return { pending, latest: latest ?? null };
  } catch {
    return null; // DB down: the shell must still render
  }
}

// The layout only decides whether to show the nav; each page/action still calls requireAdmin().
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  const runs = session ? await loadRuns() : null;
  return (
    <div className="admin-shell">
      {session ? <AdminNav /> : null}
      {runs ? (
        <div className="admin-content admin-content--banner">
          <UpdatesBanner pending={runs.pending} latest={runs.latest} />
        </div>
      ) : null}
      <div className="admin-content">{children}</div>
    </div>
  );
}
