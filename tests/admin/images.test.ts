import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../../src/server/db";
import {
  AdminNotFoundError,
  AdminValidationError,
  MAX_IMAGE_BYTES,
  detectImageType,
  resetCustomImage,
  safeCodeDir,
  saveCustomImage,
} from "../../src/server/admin";
import { add, setup, type Ctx } from "./helpers";

let ctx: Ctx;
let db: Ctx["db"];
let dir: string;
beforeEach(async () => {
  ctx = await setup();
  db = ctx.db;
  dir = await mkdtemp(path.join(tmpdir(), "sicor-admin-img-"));
});
afterEach(async () => {
  await ctx.close();
  await rm(dir, { recursive: true, force: true });
});

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 1)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20, 2)]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8, 3)]);
const override = async (code: string) =>
  (await db.select().from(schema.productOverrides)).find((o) => o.productCode === code);

describe("detectImageType", () => {
  it("recognises jpeg/png/webp and rejects others", () => {
    expect(detectImageType(jpeg)?.ext).toBe("jpg");
    expect(detectImageType(png)?.ext).toBe("png");
    expect(detectImageType(webp)?.ext).toBe("webp");
    expect(detectImageType(Buffer.from("GIF89a......"))).toBeNull();
    expect(detectImageType(Buffer.from("<svg xmlns='x'></svg>"))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("saveCustomImage (S2)", () => {
  it("stores under custom/<safe-code>/<hash>.<ext> and sets custom_image_path", async () => {
    await add(db, { code: "A-1" });
    const { path: rel } = await saveCustomImage(db, dir, "A-1", jpeg, "image/jpeg");
    expect(rel).toMatch(/^custom\/A-1\/[0-9a-f]{16}\.jpg$/);
    expect(await readFile(path.join(dir, rel))).toEqual(jpeg);
    expect((await override("A-1"))?.customImagePath).toBe(rel);
    expect((await saveCustomImage(db, dir, "A-1", png, "image/png")).path).toMatch(/\.png$/);
    expect((await saveCustomImage(db, dir, "A-1", webp, "image/webp")).path).toMatch(/\.webp$/);
  });
  it("keeps weird codes confined to the images dir", async () => {
    for (const code of ["../../etc", "a/b", "..", "x\\y", "é"]) {
      await add(db, { code });
      const { path: rel } = await saveCustomImage(db, dir, code, png, "image/png");
      const full = path.resolve(dir, rel);
      expect(full.startsWith(path.resolve(dir) + path.sep)).toBe(true);
      expect(existsSync(full)).toBe(true);
      expect(rel.split("/")).toHaveLength(3);
      expect(safeCodeDir(code)).not.toMatch(/[/\\]|^\.+$/);
    }
  });
  it("rejects non-images, mismatched types, empty and oversize without writing or changing data", async () => {
    await add(db, { code: "A" }, { customName: "Keep" });
    const cases: [Buffer, string][] = [
      [Buffer.from("GIF89a-----------"), "image/gif"],
      [Buffer.from("<svg></svg>"), "image/svg+xml"],
      [Buffer.from("not an image at all"), "image/jpeg"],
      [png, "image/jpeg"],
      [jpeg, "text/html"],
      [Buffer.alloc(0), "image/png"],
      [Buffer.concat([png, Buffer.alloc(MAX_IMAGE_BYTES)]), "image/png"],
    ];
    for (const [bytes, type] of cases) {
      await expect(saveCustomImage(db, dir, "A", bytes, type)).rejects.toBeInstanceOf(AdminValidationError);
    }
    expect(existsSync(path.join(dir, "custom"))).toBe(false);
    expect(await override("A")).toMatchObject({ customImagePath: null, customName: "Keep" });
  });
  it("accepts exactly 5 MB and rejects unknown products", async () => {
    await add(db, { code: "A" });
    const exact = Buffer.concat([png, Buffer.alloc(MAX_IMAGE_BYTES - png.length)]);
    await saveCustomImage(db, dir, "A", exact, "image/png");
    await expect(saveCustomImage(db, dir, "NOPE", png, "image/png")).rejects.toBeInstanceOf(AdminNotFoundError);
  });
});

describe("resetCustomImage", () => {
  it("clears the path, keeps other edits, rejects unknown codes", async () => {
    await add(db, { code: "A" }, { customName: "Keep" });
    await saveCustomImage(db, dir, "A", jpeg, "image/jpeg");
    await resetCustomImage(db, "A");
    expect(await override("A")).toMatchObject({ customImagePath: null, customName: "Keep" });
    await expect(resetCustomImage(db, "NOPE")).rejects.toBeInstanceOf(AdminNotFoundError);
  });
});
