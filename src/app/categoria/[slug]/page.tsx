import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/** The catalog is a single page now: old category URLs keep working (308). */
export default async function CategoryRedirect({ params }: Params) {
  const { slug } = await params;
  permanentRedirect(`/?${new URLSearchParams({ categoria: slug }).toString()}`);
}
