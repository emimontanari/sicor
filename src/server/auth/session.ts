import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthConfig, SESSION_COOKIE, verifySessionToken, type SessionPayload } from "./token";

/** Valid admin session from the request cookie, or null (also null when auth is disabled). */
export async function getAdminSession(): Promise<SessionPayload | null> {
  const cfg = resolveAuthConfig();
  if (!cfg.enabled) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = verifySessionToken(token, cfg.secret);
  return session && session.sub === cfg.email ? session : null;
}

/** Call at the top of every admin page and server action. Redirects to the login when unauthenticated. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}
