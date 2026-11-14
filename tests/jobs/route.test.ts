import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../../src/app/api/internal/sync/check/route";

const SECRET = "route-test-secret-value";
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.SYNC_SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.SYNC_SECRET;
  else process.env.SYNC_SECRET = saved;
});

const req = (auth?: string) =>
  new Request("http://x/api/internal/sync/check", { method: "POST", headers: auth ? { authorization: auth } : {} });

describe("POST /api/internal/sync/check auth", () => {
  it("503 with empty body when SYNC_SECRET is unset", async () => {
    delete process.env.SYNC_SECRET;
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("");
  });
  it.each([undefined, "Bearer wrong", "Basic " + SECRET, `Bearer ${SECRET}x`])("401 empty body for %j", async (h) => {
    process.env.SYNC_SECRET = SECRET;
    const res = await POST(req(h));
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toBe("");
    expect(body).not.toContain(SECRET);
  });
});
