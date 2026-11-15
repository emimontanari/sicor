import { createRateLimiter } from "./rate-limit";
import { verifyPassword } from "./password";
import { createSessionToken, resolveAuthConfig } from "./token";

export const GENERIC_LOGIN_ERROR = "Email o contraseña incorrectos.";
const LOCKED_ERROR = "Demasiados intentos. Probá de nuevo en 15 minutos.";

const WINDOW_MS = 15 * 60 * 1000;
// Per ip|email (5) plus a global per-account limiter (10) so rotating X-Forwarded-For or the submitted email cannot bypass it.
let limiter = createRateLimiter({ max: 5, windowMs: WINDOW_MS });
let accountLimiter = createRateLimiter({ max: 10, windowMs: WINDOW_MS });
export function resetLoginLimiter(): void {
  limiter = createRateLimiter({ max: 5, windowMs: WINDOW_MS });
  accountLimiter = createRateLimiter({ max: 10, windowMs: WINDOW_MS });
}

export type LoginResult = { ok: true; token: string } | { ok: false; error: string };

export async function attemptLogin(
  input: { email: string; password: string; ip: string },
  env: Record<string, string | undefined> = process.env,
): Promise<LoginResult> {
  const cfg = resolveAuthConfig(env);
  if (!cfg.enabled) return { ok: false, error: cfg.reason };

  const email = input.email.trim().toLowerCase();
  const key = `${input.ip}|${email}`;
  if (limiter.isLimited(key) || accountLimiter.isLimited(cfg.email)) return { ok: false, error: LOCKED_ERROR };

  // Always run the hash check so wrong-email and wrong-password take the same time.
  const passwordOk = await verifyPassword(input.password, cfg.passwordHash);
  if (!passwordOk || email !== cfg.email) {
    limiter.fail(key);
    accountLimiter.fail(cfg.email);
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  limiter.reset(key);
  return { ok: true, token: createSessionToken(cfg.email, cfg.secret) };
}
