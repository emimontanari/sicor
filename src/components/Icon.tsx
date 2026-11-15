export type IconName =
  | "shoe"
  | "shirt"
  | "helmet"
  | "goggles"
  | "glove"
  | "cone"
  | "box"
  | "search"
  | "filter"
  | "x"
  | "plus"
  | "check"
  | "cart"
  | "options";

/** References a symbol from <IconSprite />. Decorative: always aria-hidden. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} aria-hidden focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** Rendered once in the root layout; every icon in the site is a <use> of one of these. */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        <symbol id="i-shoe" viewBox="0 0 48 48">
          <path d="M5 30c0-7 2-13 4-17l8 4 4-4c2 6 8 10 17 12 5 1 8 3 8 7v4H5z" />
          <path d="M5 38h38M18 17l4 5M24 20l4 5" />
        </symbol>
        <symbol id="i-shirt" viewBox="0 0 48 48">
          <path d="M17 6 6 12l4 9 5-2v23h18V19l5 2 4-9-11-6c-1 4-4 6-7 6s-6-2-7-6z" />
        </symbol>
        <symbol id="i-helmet" viewBox="0 0 48 48">
          <path d="M8 32c0-10 7-18 16-18s16 8 16 18z" />
          <path d="M3 32h42v5H3zM22 14v12h4V14" />
        </symbol>
        <symbol id="i-goggles" viewBox="0 0 48 48">
          <path d="M3 18h42v9c0 5-3 8-8 8h-5c-3 0-5-2-6-4h-4c-1 2-3 4-6 4h-5c-5 0-8-3-8-8z" />
          <path d="M3 22H1M45 22h2" />
        </symbol>
        <symbol id="i-glove" viewBox="0 0 48 48">
          <path d="M13 44V29l-6-8c-1-2 1-4 3-3l5 5V9c0-2 4-2 4 0v12V6c0-2 4-2 4 0v15V8c0-2 4-2 4 0v14V14c0-2 4-2 4 0v16c0 8-4 14-10 14z" />
          <path d="M13 38h20" />
        </symbol>
        <symbol id="i-cone" viewBox="0 0 48 48">
          <path d="M24 5 35 37H13z" />
          <path d="M5 43h38v-6H5zM19 24h10M16 31h16" />
        </symbol>
        <symbol id="i-box" viewBox="0 0 48 48">
          <path d="M5 14 24 6l19 8v22l-19 8-19-8z" />
          <path d="m5 14 19 8 19-8M24 22v22" />
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </symbol>
        <symbol id="i-filter" viewBox="0 0 24 24">
          <path d="M3 6h18M6 12h12M10 18h4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </symbol>
        <symbol id="i-plus" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-options" viewBox="0 0 24 24">
          <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-cart" viewBox="0 0 24 24">
          <path d="M3 4h3l2.4 11h9.7L20 8H7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9.5" cy="19.5" r="1.6" fill="currentColor" />
          <circle cx="17" cy="19.5" r="1.6" fill="currentColor" />
        </symbol>
      </defs>
    </svg>
  );
}
