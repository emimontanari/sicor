import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Readable } from "node:stream";
import { resolvePdfFile, safeDownloadName } from "../../../server/catalog/paths";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const root = process.env.IMAGES_DIR;
  if (!root) return notFound();
  const { path: segments } = await ctx.params;
  const file = await resolvePdfFile(resolve(root), ["docs", ...(segments ?? [])]);
  if (!file) return notFound();
  try {
    const s = await stat(file);
    if (!s.isFile()) return notFound();
    const name = safeDownloadName(new URL(req.url).searchParams.get("n"), basename(file));
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}"`,
        "Content-Length": String(s.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}
