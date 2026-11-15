import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { TestDb } from "../db";
import { productOverrides, sourceProducts } from "../db/schema";
import { resolveImagePath } from "../catalog";
import { AdminNotFoundError, AdminValidationError, type Db } from "./errors";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Kind = { ext: "jpg" | "png" | "webp"; mime: string };

/** Detects jpeg/png/webp from magic bytes; null for anything else. */
export function detectImageType(b: Uint8Array): Kind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (
    b.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)
  )
    return { ext: "png", mime: "image/png" };
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.subarray(8, 12)) === "WEBP"
  )
    return { ext: "webp", mime: "image/webp" };
  return null;
}

/** Directory-safe name from a product code (never `.`/`..`, never a separator). */
export function safeCodeDir(code: string): string {
  const cleaned = code.replace(/[^A-Za-z0-9_-]/g, "_") || "_";
  return cleaned === code ? cleaned : `${cleaned}-${createHash("sha256").update(code).digest("hex").slice(0, 8)}`;
}

/** S2: validates and stores a custom image; sets only product_overrides.custom_image_path. */
export async function saveCustomImage(
  db: Db,
  imagesDir: string,
  code: string,
  bytes: Uint8Array,
  declaredType: string,
): Promise<{ path: string }> {
  const d = db as TestDb;
  const fail = (msg: string): never => {
    throw new AdminValidationError({ image: msg });
  };
  if (bytes.length === 0) fail("La imagen está vacía");
  if (bytes.length > MAX_IMAGE_BYTES) fail("La imagen supera los 5 MB");
  const kind = detectImageType(bytes);
  if (!kind) fail("Formato no permitido (solo JPEG, PNG o WebP)");
  const declared = (declaredType ?? "").toLowerCase().trim().replace("image/jpg", "image/jpeg");
  if (declared !== kind!.mime) fail("El tipo declarado no coincide con el contenido");
  const [p] = await d.select({ code: sourceProducts.code }).from(sourceProducts).where(eq(sourceProducts.code, code));
  if (!p) throw new AdminNotFoundError(`Producto ${code} no encontrado`);

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const segments = ["custom", safeCodeDir(code), `${hash}.${kind!.ext}`];
  const root = path.resolve(imagesDir);
  const full = resolveImagePath(root, segments);
  if (!full) throw new AdminValidationError({ image: "Ruta de imagen inválida" });
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  const rel = segments.join("/");
  const now = new Date();
  await d
    .insert(productOverrides)
    .values({ productCode: code, customImagePath: rel, updatedAt: now })
    .onConflictDoUpdate({ target: productOverrides.productCode, set: { customImagePath: rel, updatedAt: now } });
  return { path: rel };
}

/** Clears the custom image (the file is left on disk). Unknown code → AdminNotFoundError. */
export async function resetCustomImage(db: Db, code: string): Promise<void> {
  const d = db as TestDb;
  const [p] = await d.select({ code: sourceProducts.code }).from(sourceProducts).where(eq(sourceProducts.code, code));
  if (!p) throw new AdminNotFoundError(`Producto ${code} no encontrado`);
  await d
    .update(productOverrides)
    .set({ customImagePath: null, updatedAt: new Date() })
    .where(eq(productOverrides.productCode, code));
}
