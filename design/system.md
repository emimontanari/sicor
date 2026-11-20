# SICOR design system

Synced (read-only) from `src/app/globals.css` and `src/app/admin/admin.css`. Plain CSS, no Tailwind, no build-time tokens. Mobile-first; the admin dashboard reuses the storefront variables plus a compact 34px control family.

## Colors
Source: `src/app/globals.css` (`:root`)

| Token | Value | Usage |
| --- | --- | --- |
| `--red` | `#e1202f` | Primary brand red: 8px top bar, `.btn--primary`, section-title bar, `:focus-visible` ring, cart FAB, `.badge--red`, `.badge-count`, admin `.admin-btn` (both files) |
| `--red-dark` | `#b8101e` | Error text (`.form-error`, `.admin-error`, `.qc-off`), link buttons (`.link-btn`, `.pr-link`, `.qc-link`, `.pr-pager a`), `.card__cta`, admin logout, `.pr-ctl--danger` (`admin.css`) |
| `--charcoal` | `#2b2a33` | Body text, default `.btn` fill, footer and `.admin-header` background, selected chip fill, compact-control border, `.badge--dark` |
| `--light` | `#f3f3f5` | Image boxes, stepper buttons, `.note` background, hover fill of compact controls, `.admin-shell` page background (`admin.css`) |
| `--line` | `#d9d9de` | Borders, dividers, empty-image glyph |
| `--muted` | `#5d5c66` | Secondary text, counts, crumbs, empty states, `.fs legend` |
| `--white` | `#fff` | Page and card background, text on red/charcoal |

Other literal colors found in the sources (name — value — usage):

| Color | Value | Usage |
| --- | --- | --- |
| Header bg | `#f8f8f8` | `.site-header` background, matches the logo image background (`globals.css`) |
| WhatsApp / ok | `#1a7f37` | `.btn--wa`, `.form-ok`, `.qc-send` (`globals.css`) |
| Admin ok text | `#1a6b34` | `.pr-ok` success text (`admin.css`) |
| Solid hover | `#000` | Hover of charcoal-filled compact controls: `.card__actions .add:hover`, `.qc-tool--fill` fixed charcoal, `.pr-ctl--solid:hover`, `.pr-ctl--danger:hover` (both files) |
| Badge on bg / border | `#e3f4e8` / `#9fd1ae` | `.pr-badge--on` (`admin.css`) |
| Badge new bg / border | `#fff3cd` / `#e5c96b` | `.pr-badge--new` (`admin.css`) |
| Badge off bg / border | `#fde3e5` / `#e5a1a7` | `.pr-badge--off` (`admin.css`) |
| Failed banner bg | `#fdecea` | `.upd-banner--failed` (`admin.css`) |
| Backdrops | `rgb(43 42 51 / 0.55)` | `.sheet::backdrop`, `.psheet::backdrop`, `.drawer::backdrop` (`rgba(43, 42, 51, .55)` in `admin.css`) |
| Empty stripes | `rgb(217 217 222 / 0.5)` | `.img-box--empty`, `.qc-thumb--empty` diagonal stripes |

## Typography
Source: `src/app/globals.css`

| Token | Value | Usage |
| --- | --- | --- |
| `--font` | `"Helvetica Neue", Arial, "Segoe UI", system-ui, sans-serif` | Everything (system stack, no web fonts) |

- Headings (`h1`-`h3`): uppercase, weight 800, letter-spacing 0.01em, line-height 1.15. Hero `.page-title` weight 900 `clamp(1.4rem, 6vw, 2.2rem)`; catalog `.title` 900 `clamp(1.3rem, 6vw, 2rem)`; `.section__title` 1.15rem; admin page `h1` 1.4rem (`admin.css`).
- Body: line-height 1.45. Inputs and selects 1rem minimum (avoids iOS zoom).
- Buttons and labels: weight 800 (`.admin-btn` uses 700), uppercase, letter-spacing 0.02em.
- **Compact control family text**: 0.65rem / weight 800 / uppercase / letter-spacing 0.02em (`.ficha`, `.card__actions .add`, `.card-step`, `.qc-tool`, `.pr-ctl`, `.pr-chip`, `.admin-burger`, `.drawer__close`, `.admin-nav a`, `admin.css`).
- Card name 0.85rem (0.95rem from 640px), clamped to 3 lines (2 on mobile). Small labels 0.72-0.85rem.

## Spacing and layout
Source: `src/app/globals.css` (plus `admin.css` gaps below)

| Token | Value | Usage |
| --- | --- | --- |
| `--pad` | `1rem` | Horizontal page padding (`--gutter` in `.catalog` is set to `var(--pad)`) |
| `--max` | `72rem` | Max content width (`main`, header inner, footer, `.admin-content`) |
| `--hdr` | `64px` | Header `min-height` (`.site-header__inner`) |
| `--gutter` | `var(--pad)` (local to `.catalog`) | Catalog horizontal padding; 2rem from 900px |
| `--edge` | `max(var(--gutter), calc(50vw - var(--max) / 2 + var(--gutter)))` (local to `.catalog`) | Re-aligns full-bleed `.catbar` chips with page content |

- Gaps (`globals.css`): 0.5rem chips/search, 0.75rem mobile grid, 1rem grid from 640px. Gaps (`admin.css`): 0.25rem-1.25rem, page stacks 0.9-1rem.
- Breakpoints: 639.98px and below = single-column mobile cards; `640px` (3-col grid), `900px` (4-col grid, two-column product, catalog chips wrap, desktop drawer/sheet becomes centered panel, admin `.admin-header__inner` goes row at `48rem`).
- Touch targets: 44px minimum hit area everywhere; 48px search/buttons; cart FAB 56px. Compact controls are 34px visible with an `::after` inset hit area (`-5px 0`, `-6px -4px` in `admin.css`) reaching ≥44px.

## Radius
Source: `src/app/globals.css` and `src/app/admin/admin.css` (literal values)

| Value | Usage |
| --- | --- |
| `3px` | `.sheet__grab` handle |
| `4px` | `.badge`, admin inputs/selects (`.admin-login input`, `.cat-row__form select`, `.pr-filters input`, `.set-form input`), `.pr-thumb`, `.qc-thumb` empty thumbs, `.admin-nav a` hover tile |
| `5px` | `.qc-step button`, `.img-box` inner radius on mobile cards |
| `6px` | Inputs, `.btn`, `.search`, chips (`.chip`, `.chip-btn`, `.pr-chip`), cards (`.card`, `.admin-card`, `.cat-row`, `.quote__item`), the compact control family, `.pr-toast` close, `.icon-btn` |
| `8px` | `.quote__item`, `.qc-list`/`.qc-panel`, `.empty-state`, `.pr-toast`, `.drawer:has(.sheet)` desktop centered panel |
| `11px` | `.badge-count` pill |
| `12px` | Cart badge, `.sheet` and bottom-sheet top corners (`border-radius: 12px 12px 0 0`), `.psheet__panel` desktop |
| `999px` | Cart FAB, `.fchip`, `.pr-tab`, `.pr-badge`, `.pr-ctl__badge`, `.qc-send-logo` |

## Shadows
Source: `src/app/globals.css` (and `admin.css` variants)

| Value | Usage |
| --- | --- |
| `0 4px 14px rgb(43 42 51 / 0.15)` | `.card:hover` |
| `0 4px 14px rgb(43 42 51 / 0.35)` | `.cart-fab`, `.sheet`, `.qc-toast`, `.psheet__panel` desktop |
| `0 0 24px rgba(0, 0, 0, .25)` | `.drawer__panel` (`admin.css`) |
| `0 4px 16px rgba(0, 0, 0, .3)` | `.pr-toast` (`admin.css`) |

## Components
Source: `src/app/globals.css`, `src/app/admin/admin.css`, `src/components/*`

- **Page frame**: 8px `--red` top border on `body`; sticky `.site-header` on `#f8f8f8` with bottom `--line` border and the SICOR logo (48px high); footer on `--charcoal`, white bold text "SICOR | SUMINISTROS INDUSTRIALES CÓRDOBA".
- **Section title**: uppercase, 5px `--red` left bar, 0.6rem padding. Catalog `.title` same bar.
- **Button `.btn`**: 48px high, 6px radius, charcoal fill, white uppercase 800 text. `.btn--primary` red; `.btn--ghost` transparent with 2px charcoal border; `.btn--wa` `#1a7f37`; `:disabled` opacity 0.55.
- **Admin button `.admin-btn`** (`admin.css`): red fill, 4px radius, 44px min-height, 700 weight; hover `--red-dark`. `--secondary` white with 1px `--line` border; `--ghost` white with 1px `--line`; `--sm` 44px with smaller padding.
- **Compact control family** (shared storefront cards, quote cart and admin, `admin.css` T2 comment: "34px visible, 1px charcoal, 6px radius, uppercase .65rem/800, ≥44px hit area"): `.pr-ctl`, `.admin-burger`, `.drawer__close`, `.pr-chip`, `.admin-nav a`, `.admin-nav__logout`, and in `globals.css` `.ficha`, `.card__actions .add`, `.card-step`, `.qc-tool`, `.qc-step`, `.qc-trash`. Height 34px, 1px `--charcoal` border, 6px radius, white background, `::after` inset -6px -4px hit area; hover `--light`; `--solid` charcoal fill white text (hover `#000`); `--danger` `--red-dark` fill; `--icon` 34px square; `__badge` red pill.
- **Search**: 48px input with 2px `--line` border (charcoal on focus) plus button. Catalog `.searchfield` inlines the icon (20px, left 0.8rem); admin `.pr-toolbar input[type=search]` is 44px with 1px `--charcoal` border.
- **Chip (radio/filter)**: `.chip` min 44x44, 2px `--line` border, 6px radius, weight 700; checked = charcoal fill with white text; focus ring `--red` 3px on the span. Catalog `.chip-btn` same shape as buttons, `.is-on` charcoal fill; horizontal scroll row with snap and edge fade mask. Admin `.pr-chip` uses the compact 34px family on `--light` background.
- **Product card**: 1px `--line` border, 6px radius; square `--light` image box (`object-fit: contain`, multiply blend); name clamped; "Consultar cotización" in `--red-dark` uppercase 800 0.72rem. Empty image: `--line` letters on striped `--light`. Mobile: horizontal card, 112px thumb left. `content-visibility: auto` for ~550 cards.
- **Numbered category row**: 44x48 `.badge` (`--red` or `--charcoal`, 4px radius), uppercase name, muted count, 2px `--line` divider.
- **Admin rows** (`admin.css`): `.cat-row` white card, 1px `--line` border, 6px radius; `.pr-row` grid with 64px thumb, checkboxes 24px in 44px rows, `.pr-opt` list rows 44px with `aria-current` marked by 4px `--red` inset shadow.
- **Cart FAB**: fixed bottom-right, 56px high pill, `--red`, white uppercase text, charcoal count badge with 2px white border.
- **Note / qc-message**: `--light` background, 5px `--red` left bar.
- **Drawers and sheets**: native `<dialog>`; side drawer panel `min(20rem, 88vw)` white, full height; `:has(.sheet)` turns it into a bottom sheet (`border-radius: 12px 12px 0 0`, max-height 80dvh) which at ≥900px becomes a centered 24rem panel (8px radius). Backdrop `rgb(43 42 51 / .55)`; `sheet-in` slide animation under `prefers-reduced-motion: no-preference` only; body scroll locked while open.
- **Toast**: `.toast`/`.qc-toast`/`.pr-toast` charcoal pill, white 700 text, fixed bottom, 6-8px radius; `.pr-toast` includes an action button in the compact family.
- **Admin shell** (`admin.css`): `body:has(.admin-shell)` hides storefront header/footer/cart FAB; `.admin-shell` on `--light`; sticky `.admin-header` charcoal bar (min-height 48px) with brand (uppercase 0.85rem) and a 34px burger (`--white` border, hover `--red`); nav links are compact controls, current page charcoal fill; logout red-bordered.
- **Focus**: `:focus-visible` 3px `--red` outline, 2px offset. Motion only under `prefers-reduced-motion: no-preference` (smooth scroll, card/sheet/drawer/toast transitions).
