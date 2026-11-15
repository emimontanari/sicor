import type { Metadata } from "next";

export const SITE_NAME = "SICOR";
export const DEFAULT_IMAGE = "/brand/sicor-logo.png";
export const SITE_DESCRIPTION =
  "Catálogo comercial SICOR — Suministros Industriales Córdoba. Soluciones para la industria, el trabajo y la seguridad.";

/** Public origin used for absolute OG/Twitter URLs (PUBLIC_BASE_URL, no trailing slash). */
export function baseUrl(): string {
  const raw = process.env.PUBLIC_BASE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${baseUrl()}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

export function truncateDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function buildPageMetadata(input: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
}): Metadata {
  const url = absoluteUrl(input.path);
  const image = absoluteUrl(input.image || DEFAULT_IMAGE);
  const description = truncateDescription(input.description);
  return {
    title: input.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: input.title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "es_AR",
      type: "website",
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description,
      images: [image],
    },
  };
}
