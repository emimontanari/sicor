import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { imageContentType, resolveImagePath } from "../../../server/catalog/paths";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const root = process.env.IMAGES_DIR;
  if (!root) return notFound();
  const { path: segments } = await ctx.params;
  const { resolve } = await import("node:path");
  const file = resolveImagePath(resolve(root), segments ?? []);
  const type = file ? imageContentType(file) : null;
  if (!file || !type) return notFound();
  try {
    const s = await stat(file);
    if (!s.isFile()) return notFound();
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(s.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}
