import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "../../../server/auth/session";
import { resolveAuthConfig } from "../../../server/auth/token";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ingresar", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await getAdminSession()) redirect("/admin/productos");
  const cfg = resolveAuthConfig();
  return (
    <div className="admin-login-wrap">
      {cfg.enabled ? (
        <LoginForm />
      ) : (
        <div className="admin-card admin-login">
          <h1>Admin deshabilitado</h1>
          <p role="alert" className="admin-error">
            {cfg.reason}
          </p>
        </div>
      )}
    </div>
  );
}
