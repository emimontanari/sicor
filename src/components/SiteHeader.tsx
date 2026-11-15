import Link from "next/link";
import { HeaderSearchButton } from "./HeaderSearchButton";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__logo" aria-label="SICOR — inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/sicor-logo.png" alt="SICOR Suministros Industriales" width={640} height={375} />
        </Link>
        <span className="site-header__tag">Catálogo comercial · Consultá cotización por WhatsApp</span>
        <HeaderSearchButton />
      </div>
    </header>
  );
}
