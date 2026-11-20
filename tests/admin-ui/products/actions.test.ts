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
}));
const denied = vi.hoisted(() => ({ value: false }));

import { archiveAction, restoreAction } from "../../../src/app/admin/productos/actions";

beforeEach(() => {
  calls.length = 0;
  denied.value = false;
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
