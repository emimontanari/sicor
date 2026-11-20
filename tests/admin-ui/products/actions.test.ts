import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => calls.push(`revalidate:${p}`) }));
vi.mock("../../../src/server/auth/session", () => ({
  requireAdmin: async () => {
    calls.push("requireAdmin");
    if (denied.value) throw new Error("NEXT_REDIRECT:/admin/login");
    return { sub: "a" };
  },
}));
vi.mock("../../../src/lib/admin/products/db", () => ({ getAdminDb: () => ({}) }));
vi.mock("../../../src/server/admin", async (orig) => ({
  ...(await orig<object>()),
  archiveProducts: async (_db: unknown, codes: string[]) => (calls.push(`archive:${codes.join(",")}`), { updated: codes.length }),
  restoreProducts: async (_db: unknown, codes: string[]) => (calls.push(`restore:${codes.join(",")}`), { updated: codes.length }),
  bulkUpdate: async (_db: unknown, codes: string[], patch: unknown) =>
    (calls.push(`bulk:${codes.join(",")}:${JSON.stringify(patch)}`), { updated: codes.length }),
  bulkUpdateFiltered: async (_db: unknown, input: unknown, patch: unknown) =>
    (calls.push(`bulkFiltered:${JSON.stringify(input)}:${JSON.stringify(patch)}`), { updated: bulkCount.value }),
  updateOverride: async (_db: unknown, code: string, patch: unknown) =>
    (calls.push(`update:${code}:${JSON.stringify(patch)}`), {} as never),
}));
const denied = vi.hoisted(() => ({ value: false }));
const bulkCount = vi.hoisted(() => ({ value: 0 }));

import { archiveAction, bulkAction, restoreAction } from "../../../src/app/admin/productos/actions";

beforeEach(() => {
  calls.length = 0;
  denied.value = false;
  bulkCount.value = 0;
});

describe("archiveAction / restoreAction", () => {
  it("archive: requireAdmin first, then archive, then revalidates list, product, home and public page", async () => {
    const r = await archiveAction("A1");
    expect(r.ok).toBe(true);
    expect(calls[0]).toBe("requireAdmin");
    expect(calls[1]).toBe("archive:A1");
    expect(calls).toEqual(
      expect.arrayContaining(["revalidate:/admin/productos", "revalidate:/admin/productos/A1", "revalidate:/", "revalidate:/producto/[code]"]),
    );
  });
  it("restore: requireAdmin first, then restore", async () => {
    await restoreAction("A1");
    expect(calls.slice(0, 2)).toEqual(["requireAdmin", "restore:A1"]);
  });
  it("unauthenticated: nothing is archived or revalidated", async () => {
    denied.value = true;
    await expect(archiveAction("A1")).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(restoreAction("A1")).rejects.toThrow(/NEXT_REDIRECT/);
    expect(calls.filter((c) => c !== "requireAdmin")).toEqual([]);
  });
  it("rejects an empty code without touching data", async () => {
    const r = await archiveAction("");
    expect(r.ok).toBe(false);
    expect(calls).toEqual(["requireAdmin"]);
  });
});

describe("bulkAction (S5)", () => {
  it("scope=all: requireAdmin first, resolves codes server-side, never trusts client codes, exact count feedback", async () => {
    bulkCount.value = 552;
    const fd = new FormData();
    fd.set("scope", "all");
    fd.set("filtro", "visibles");
    fd.set("categoria", "indumentaria-laboral");
    fd.set("intent", "hide");
    fd.append("code", "FAKE1");
    const r = await bulkAction({}, fd);
    expect(r).toEqual({ ok: true, message: "552 productos actualizados" });
    expect(calls[0]).toBe("requireAdmin");
    expect(calls[1]).toContain("bulkFiltered");
    expect(calls[1]).toContain('"filter":"visible"');
    expect(calls[1]).toContain('"categorySlug":"indumentaria-laboral"');
    expect(calls[1]).toContain('"visible":false');
    // the forged codes never reach the data layer nor a per-code revalidation
    expect(calls.some((c) => c.includes("FAKE1"))).toBe(false);
    expect(calls).toEqual(
      expect.arrayContaining(["revalidate:/admin/productos", "revalidate:/", "revalidate:/producto/[code]", "revalidate:/categoria/[slug]"]),
    );
  });
  it("scope=codes: unchanged per-row path through bulkUpdate", async () => {
    const fd = new FormData();
    fd.set("scope", "codes");
    fd.set("intent", "show");
    fd.append("code", "A1");
    fd.append("code", "B2");
    const r = await bulkAction({}, fd);
    expect(r).toEqual({ ok: true, message: "2 productos actualizados" });
    expect(calls.slice(0, 2)).toEqual(["requireAdmin", 'bulk:A1,B2:{"visible":true}']);
    expect(calls).toContain("revalidate:/admin/productos/A1");
    expect(calls).toContain("revalidate:/admin/productos/B2");
  });
  it("invalid scope=all form: no data call at all", async () => {
    const fd = new FormData();
    fd.set("scope", "all");
    fd.set("filtro", "eliminados");
    fd.set("intent", "hide");
    const r = await bulkAction({}, fd);
    expect(r.ok).toBe(false);
    expect(calls.filter((c) => c !== "requireAdmin")).toEqual([]);
  });
  it("unauthenticated: no bulk call, nothing revalidated", async () => {
    denied.value = true;
    const fd = new FormData();
    fd.set("scope", "all");
    fd.set("intent", "show");
    await expect(bulkAction({}, fd)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(calls.filter((c) => c !== "requireAdmin")).toEqual([]);
  });
});
