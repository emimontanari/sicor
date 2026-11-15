import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string | string[] }> };

/** Search lives on the home page now: `/buscar?q=x` -> `/?q=x` (308). */
export default async function SearchRedirect({ searchParams }: Props) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";
  permanentRedirect(q ? `/?${new URLSearchParams({ q }).toString()}` : "/");
}
