import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "sicor_admin";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const MIN_SECRET_LENGTH = 32;

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

type Env = Record<string, string | undefined>;

export type AuthConfig =
  | { enabled: true; email: string; passwordHash: string; secret: string }
  | { enabled: false; reason: string };

/** Auth is only enabled when all three env vars are valid; otherwise the admin stays closed. */
export function resolveAuthConfig(env: Env = process.env): AuthConfig {
  const secret = env.SESSION_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    return { enabled: false, reason: `Admin deshabilitado: SESSION_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres.` };
  }
  const email = (env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const passwordHash = env.ADMIN_PASSWORD_HASH ?? "";
  if (!email || !passwordHash) {
    return { enabled: false, reason: "Admin deshabilitado: faltan ADMIN_EMAIL o ADMIN_PASSWORD_HASH." };
  }
  return { enabled: true, email, passwordHash, secret };
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

export function createSessionToken(sub: string, secret: string, now: number = nowSeconds()): string {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  const payload: SessionPayload = { sub, iat: now, exp: now + SESSION_MAX_AGE_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(token: string, secret: string, now: number = nowSeconds()): SessionPayload | null {
  if (!token || secret.length < MIN_SECRET_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof p.sub !== "string" || typeof p.iat !== "number" || typeof p.exp !== "number") return null;
    if (p.exp <= now) return null;
    return { sub: p.sub, iat: p.iat, exp: p.exp };
  } catch {
    return null;
  }
}
