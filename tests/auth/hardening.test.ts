import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../../src/server/auth/password";
import { attemptLogin, resetLoginLimiter } from "../../src/server/auth/login";
import { isSameOrigin } from "../../src/server/auth/origin";

describe("account-wide login limiter", () => {
  let env: Record<string, string>;
  beforeEach(async () => {
    resetLoginLimiter();
    env = { SESSION_SECRET: "s".repeat(40), ADMIN_EMAIL: "admin@sicor.com", ADMIN_PASSWORD_HASH: await hashPassword("pw-123456") };
  });
  it("locks after 10 failures across different IPs, even with the right password", async () => {
    for (let i = 0; i < 10; i++) await attemptLogin({ email: "admin@sicor.com", password: "bad", ip: `10.0.0.${i}` }, env);
    const r = await attemptLogin({ email: "admin@sicor.com", password: "pw-123456", ip: "10.9.9.9" }, env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Demasiados intentos/);
  });
  it("counts failures with other submitted emails toward the account limiter", async () => {
    for (let i = 0; i < 10; i++) await attemptLogin({ email: `x${i}@y.z`, password: "bad", ip: `10.0.1.${i}` }, env);
    const r = await attemptLogin({ email: "admin@sicor.com", password: "pw-123456", ip: "10.9.9.9" }, env);
    expect(r.ok).toBe(false);
  });
  it("success resets the per-ip counter", async () => {
    for (let i = 0; i < 4; i++) await attemptLogin({ email: "admin@sicor.com", password: "bad", ip: "5.5.5.5" }, env);
    expect((await attemptLogin({ email: "admin@sicor.com", password: "pw-123456", ip: "5.5.5.5" }, env)).ok).toBe(true);
    for (let i = 0; i < 4; i++) await attemptLogin({ email: "admin@sicor.com", password: "bad", ip: "5.5.5.5" }, env);
    expect((await attemptLogin({ email: "admin@sicor.com", password: "pw-123456", ip: "5.5.5.5" }, env)).ok).toBe(true);
  });
});

describe("isSameOrigin", () => {
  it("accepts matching host and forwarded host", () => {
    expect(isSameOrigin("https://sicor.com", "sicor.com")).toBe(true);
    expect(isSameOrigin("https://sicor.com", "internal:3000", "sicor.com")).toBe(true);
    expect(isSameOrigin("http://localhost:3000", "localhost:3000")).toBe(true);
  });
  it("rejects missing, foreign, malformed origins and missing host", () => {
    expect(isSameOrigin(null, "sicor.com")).toBe(false);
    expect(isSameOrigin("https://evil.com", "sicor.com")).toBe(false);
    expect(isSameOrigin("https://sicor.com", "internal:3000", "evil.com")).toBe(false);
    expect(isSameOrigin("not a url", "sicor.com")).toBe(false);
    expect(isSameOrigin("https://sicor.com", null)).toBe(false);
  });
});
