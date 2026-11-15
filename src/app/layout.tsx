import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { baseUrl, SITE_DESCRIPTION } from "../lib/seo/metadata";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#E1202F",
};

// Dynamic: metadataBase reads PUBLIC_BASE_URL at request time, not at docker build time.
export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(baseUrl()),
    title: { default: "Catálogo comercial | SICOR", template: "%s | SICOR" },
    description: SITE_DESCRIPTION,
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <SiteHeader />
        <main id="contenido">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
