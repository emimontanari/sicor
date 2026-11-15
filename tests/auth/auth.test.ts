import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "../../src/server/auth/password";
import { createSessionToken, verifySessionToken, resolveAuthConfig, SESSION_MAX_AGE_SECONDS } from "../../src/server/auth/token";
import { createRateLimiter } from "../../src/server/auth/rate-limit";
import { attemptLogin, resetLoginLimiter } from "../../src/server/auth/login";
import { sessionCookieOptions } from "../../src/server/auth/cookie";

const SECRET = "s".repeat(40);
const cookieStore = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (cookieStore.value && n === "sicor_admin" ? { name: n, value: cookieStore.value } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

describe("password hashing", () => {
  it("hashes and verifies; salts differ", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword("correct horse", a)).toBe(true);
  });
  it("rejects wrong password and malformed hashes", async () => {
    const h = await hashPassword("correct horse");
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });
});

describe("session token", () => {
  const now = 1_700_000_000;
  it("round-trips with sub/iat/exp and 7 day expiry", () => {
    const t = createSessionToken("a@b.c", SECRET, now);
    const p = verifySessionToken(t, SECRET, now + 10);
    expect(p).toEqual({ sub: "a@b.c", iat: now, exp: now + SESSION_MAX_AGE_SECONDS });
    expect(SESSION_MAX_AGE_SECONDS).toBe(7 * 24 * 3600);
  });
  it("rejects tampered payload, wrong secret and bad shapes", () => {
    const t = createSessionToken("a@b.c", SECRET, now);
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "evil", iat: now, exp: now + 99999 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`, SECRET, now)).toBeNull();
    expect(verifySessionToken(`${body}.${sig}x`, SECRET, now)).toBeNull();
    expect(verifySessionToken(t, "o".repeat(40), now)).toBeNull();
    expect(verifySessionToken("nope", SECRET, now)).toBeNull();
    expect(verifySessionToken("", SECRET, now)).toBeNull();
  });
  it("rejects expired tokens", () => {
    const t = createSessionToken("a@b.c", SECRET, now);
    expect(verifySessionToken(t, SECRET, now + SESSION_MAX_AGE_SECONDS)).toBeNull();
    expect(verifySessionToken(t, SECRET, now + SESSION_MAX_AGE_SECONDS - 1)).not.toBeNull();
  });
  it("refuses to sign with a short secret", () => {
    expect(() => createSessionToken("a", "short", now)).toThrow(/32/);
  });
});

describe("auth config", () => {
  it("is disabled with a clear error when the secret is short or missing", () => {
    const short = resolveAuthConfig({ SESSION_SECRET: "short", ADMIN_EMAIL: "a@b.c", ADMIN_PASSWORD_HASH: "x" });
    expect(short.enabled).toBe(false);
    if (!short.enabled) expect(short.reason).toMatch(/SESSION_SECRET.*32/);
    expect(resolveAuthConfig({}).enabled).toBe(false);
    expect(resolveAuthConfig({ SESSION_SECRET: SECRET, ADMIN_EMAIL: "a@b.c" }).enabled).toBe(false);
    expect(resolveAuthConfig({ SESSION_SECRET: SECRET, ADMIN_EMAIL: "a@b.c", ADMIN_PASSWORD_HASH: "h" }).enabled).toBe(true);
  });
});

describe("rate limiter", () => {
  it("locks after 5 failures, resets on success and after the window", () => {
    let t = 0;
    const rl = createRateLimiter({ max: 5, windowMs: 900_000, now: () => t });
    for (let i = 0; i < 4; i++) rl.fail("k");
    expect(rl.isLimited("k")).toBe(false);
    rl.fail("k");
    expect(rl.isLimited("k")).toBe(true);
    expect(rl.isLimited("other")).toBe(false);
    t = 900_001;
    expect(rl.isLimited("k")).toBe(false);
    for (let i = 0; i < 5; i++) rl.fail("k");
    rl.reset("k");
    expect(rl.isLimited("k")).toBe(false);
  });
});

describe("attemptLogin", () => {
  let env: Record<string, string>;
  beforeEach(async () => {
    resetLoginLimiter();
    env = { SESSION_SECRET: SECRET, ADMIN_EMAIL: "Admin@Sicor.com", ADMIN_PASSWORD_HASH: await hashPassword("pw-123456") };
  });
  it("accepts the email case-insensitively and returns a verifiable token", async () => {
    const r = await attemptLogin({ email: "  admin@SICOR.com ", password: "pw-123456", ip: "1.1.1.1" }, env);
    expect(r.ok).toBe(true);
    if (r.ok) expect(verifySessionToken(r.token, SECRET)?.sub).toBe("admin@sicor.com");
  });
  it("gives the same generic error for wrong email and wrong password", async () => {
    const a = await attemptLogin({ email: "x@y.z", password: "pw-123456", ip: "1.1.1.1" }, env);
    const b = await attemptLogin({ email: "admin@sicor.com", password: "bad", ip: "1.1.1.1" }, env);
    expect(a).toEqual({ ok: false, error: "Email o contraseña incorrectos." });
    expect(b).toEqual(a);
  });
  it("locks out after 5 failures even with the right password, per ip+email", async () => {
    for (let i = 0; i < 5; i++) await attemptLogin({ email: "admin@sicor.com", password: "bad", ip: "9.9.9.9" }, env);
    const locked = await attemptLogin({ email: "ADMIN@sicor.com", password: "pw-123456", ip: "9.9.9.9" }, env);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error).toMatch(/Demasiados intentos/);
    const other = await attemptLogin({ email: "admin@sicor.com", password: "pw-123456", ip: "8.8.8.8" }, env);
    expect(other.ok).toBe(true);
  });
  it("success resets the failure counter", async () => {
    for (let i = 0; i < 4; i++) await attemptLogin({ email: "admin@sicor.com", password: "bad", ip: "7.7.7.7" }, env);
    expect((await attemptLogin({ email: "admin@sicor.com", password: "pw-123456", ip: "7.7.7.7" }, env)).ok).toBe(true);
    for (let i = 0; i < 4; i++) await attemptLogin({ email: "admin@sicor.com", password: "bad", ip: "7.7.7.7" }, env);
    expect((await attemptLogin({ email: "admin@sicor.com", password: "pw-123456", ip: "7.7.7.7" }, env)).ok).toBe(true);
  });
  it("fails closed when auth is disabled", async () => {
    const r = await attemptLogin({ email: "admin@sicor.com", password: "pw-123456", ip: "1.1.1.1" }, { ...env, SESSION_SECRET: "short" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/SESSION_SECRET/);
  });
});

describe("cookie options", () => {
  it("is HttpOnly, Lax, Path=/ and Secure only in production", () => {
    const dev = sessionCookieOptions("development");
    expect(dev).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: SESSION_MAX_AGE_SECONDS });
    expect(sessionCookieOptions("production").secure).toBe(true);
  });
});

describe("requireAdmin / getAdminSession", () => {
  it("redirects to /admin/login without a cookie, returns null session", async () => {
    process.env.SESSION_SECRET = SECRET;
    process.env.ADMIN_EMAIL = "a@b.c";
    process.env.ADMIN_PASSWORD_HASH = "h";
    cookieStore.value = undefined;
    const { requireAdmin, getAdminSession } = await import("../../src/server/auth/session");
    expect(await getAdminSession()).toBeNull();
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });
  it("returns the session for a valid cookie and rejects a tampered one", async () => {
    process.env.SESSION_SECRET = SECRET;
    process.env.ADMIN_EMAIL = "a@b.c";
    process.env.ADMIN_PASSWORD_HASH = "h";
    const { requireAdmin } = await import("../../src/server/auth/session");
    cookieStore.value = createSessionToken("a@b.c", SECRET);
    expect((await requireAdmin()).sub).toBe("a@b.c");
    cookieStore.value = cookieStore.value + "x";
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });
});
