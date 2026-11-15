import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__logo" aria-label="SICOR — inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/sicor-logo.png" alt="SICOR Suministros Industriales" width={640} height={375} />
        </Link>
        <Link href="/buscar" className="site-header__search" aria-label="Buscar productos">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
