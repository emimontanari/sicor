import { revalidatePath } from "next/cache";
import {
  AdminNotFoundError,
  AdminValidationError,
  MAX_IMAGE_BYTES,
  saveCustomImage,
} from "../../../../../server/admin";
import { getAdminSession } from "../../../../../server/auth/session";
import { getAdminDb, getImagesDir } from "../../../../../lib/admin/products/db";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Route handler (not a server action): Server Actions cap bodies at 1 MB and next.config is out of scope here.
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }): Promise<Response> {
  if (!(await getAdminSession())) return json({ ok: false, error: "No autorizado" }, 401);
  const { code: raw } = await ctx.params;
  const code = decodeURIComponent(raw);
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("image");
  } catch {
    return json({ ok: false, error: "Solicitud inválida" }, 400);
  }
  if (!(file instanceof File) || file.size === 0) return json({ ok: false, error: "Elegí una imagen" }, 400);
  if (file.size > MAX_IMAGE_BYTES) return json({ ok: false, error: "La imagen supera los 5 MB" }, 400);
  try {
    await saveCustomImage(getAdminDb(), getImagesDir(), code, new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (e) {
    if (e instanceof AdminValidationError) return json({ ok: false, error: Object.values(e.fields)[0] ?? "Imagen inválida" }, 400);
    if (e instanceof AdminNotFoundError) return json({ ok: false, error: e.message }, 404);
    throw e;
  }
  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${encodeURIComponent(code)}`);
  revalidatePath("/");
  revalidatePath("/buscar");
  revalidatePath("/categoria/[slug]", "page");
  revalidatePath("/producto/[code]", "page");
  return json({ ok: true }, 200);
}
