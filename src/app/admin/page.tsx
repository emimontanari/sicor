import { redirect } from "next/navigation";
import { requireAdmin } from "../../server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminIndex() {
  await requireAdmin();
  redirect("/admin/productos");
}
