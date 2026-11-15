import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminNav } from "../../components/admin/shell/AdminNav";
import { getAdminSession } from "../../server/auth/session";
import "./admin.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin SICOR" },
  robots: { index: false, follow: false },
};

// The layout only decides whether to show the nav; each page/action still calls requireAdmin().
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  return (
    <div className="admin-shell">
      {session ? <AdminNav /> : null}
      <div className="admin-content">{children}</div>
    </div>
  );
}
