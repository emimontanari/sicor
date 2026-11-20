import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const denied = vi.hoisted(() => ({ value: false }));
const fail = vi.hoisted(() => ({ value: null as null | "validation" | "notfound" | "boom" }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string, t?: string) => calls.push(`revalidate:${p}${t ? `:${t}` : ""}`) }));
vi.mock("../../../src/server/auth/session", () => ({
  requireAdmin: async () => {
    calls.push("requireAdmin");
    if (denied.value) throw new Error("NEXT_REDIRECT:/admin/login");
    return { sub: "a" };
  },
}));
vi.mock("../../../src/lib/admin/products/db", () => ({ getAdminDb: () => ({}) }));
vi.mock("../../../src/server/admin", async (orig) => {
  const real = await orig<typeof import("../../../src/server/admin")>();
  const maybeFail = () => {
    if (fail.value === "validation") throw new real.AdminValidationError({ name: "Ya existe una categoría con ese nombre" });
    if (fail.value === "notfound") throw new real.AdminNotFoundError("x");
    if (fail.value === "boom") throw new Error("db down");
  };
  return {
    ...real,
    createCategory: async (_db: unknown, name: string) => (calls.push(`create:${name}`), maybeFail(), {} as never),
    renameCategory: async (_db: unknown, id: number, name: string) => (calls.push(`rename:${id}:${name}`), maybeFail(), {} as never),
    deleteCategory: async (_db: unknown, id: number) => (calls.push(`delete:${id}`), maybeFail()),
  };
});

import { deleteCategoryAction, saveCategoryAction } from "../../../src/app/admin/categorias/actions";

beforeEach(() => {
  calls.length = 0;
  denied.value = false;
  fail.value = null;
});

const REVALIDATED = ["revalidate:/admin/categorias", "revalidate:/admin/productos", "revalidate:/:layout"];

describe("category actions", () => {
  it("save (new): requireAdmin first, then create, then revalidates categorias, productos and the layout", async () => {
    const r = await saveCategoryAction(null, "Prueba");
    expect(r).toEqual({ ok: true, message: "Categoría agregada" });
    expect(calls.slice(0, 2)).toEqual(["requireAdmin", "create:Prueba"]);
    expect(calls.slice(2)).toEqual(REVALIDATED);
  });
  it("save (existing) renames; delete deletes — both authenticate first and revalidate", async () => {
    expect(await saveCategoryAction(3, "X")).toEqual({ ok: true, message: "Categoría actualizada" });
    expect(calls.slice(0, 2)).toEqual(["requireAdmin", "rename:3:X"]);
    calls.length = 0;
    expect(await deleteCategoryAction(3)).toEqual({ ok: true, message: "Categoría eliminada" });
    expect(calls).toEqual(["requireAdmin", "delete:3", ...REVALIDATED]);
  });
  it("unauthenticated: nothing is changed or revalidated", async () => {
    denied.value = true;
    await expect(saveCategoryAction(null, "A")).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(saveCategoryAction(1, "A")).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(deleteCategoryAction(1)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(calls.filter((c) => c !== "requireAdmin")).toEqual([]);
  });
  it("validation error → field message, no revalidation", async () => {
    fail.value = "validation";
    expect(await saveCategoryAction(null, "dup")).toEqual({
      ok: false,
      message: "Ya existe una categoría con ese nombre",
      errors: { name: "Ya existe una categoría con ese nombre" },
    });
    expect(calls.filter((c) => c.startsWith("revalidate"))).toEqual([]);
  });
  it("unknown id and unexpected failures return a message instead of throwing", async () => {
    fail.value = "notfound";
    expect(await deleteCategoryAction(9)).toEqual({ ok: false, message: "La categoría ya no existe" });
    fail.value = "boom";
    expect(await deleteCategoryAction(9)).toEqual({ ok: false, message: "No se pudo guardar" });
    expect(calls.filter((c) => c.startsWith("revalidate"))).toEqual([]);
  });
});
