# SICOR design system

Synced (read-only) from `src/app/globals.css` and the brand assets `public/brand/sicor-logo.png` / `public/brand/sicor-icon.png`. Plain CSS, no Tailwind, no build-time tokens. Mobile-first.

## Colors
Source: `src/app/globals.css` (`:root`)

| Token | Value | Usage |
| --- | --- | --- |
| `--red` | `#e1202f` | Primary brand red: 8px top bar, primary buttons, section-title bar, focus ring, "Consultar cotización" label. On white it is ~4.6:1, so use `--red-dark` for small red text |
| `--red-dark` | `#b8101e` | Hero brand line, error text, link-buttons, small red text |
| `--charcoal` | `#2b2a33` | Body text, default buttons, footer background, "dark" badges |
| `--light` | `#f3f3f5` | Image boxes, stepper buttons, note background |
| `--line` | `#d9d9de` | Borders, dividers, empty-image glyph |
| `--muted` | `#5d5c66` | Secondary text, counts, crumbs |
| `--white` | `#fff` | Page and card background, text on red/charcoal |

Other literal colors in the same file: `#f8f8f8` (header background, matches the logo image background) and `#1a7f37` (WhatsApp button, success text).

## Typography
Source: `src/app/globals.css`

| Token | Value | Usage |
| --- | --- | --- |
| `--font` | `"Helvetica Neue", Arial, "Segoe UI", system-ui, sans-serif` | Everything (system stack, no web fonts) |

- Headings (`h1`-`h3`): uppercase, weight 800, letter-spacing 0.01em, line-height 1.15. Hero/page titles weight 900, `clamp(1.4rem, 6vw, 2.2rem)` to `clamp(1.6rem, 7.5vw, 2.8rem)`.
- Body: line-height 1.45. Inputs 1rem minimum (avoids iOS zoom).
- Buttons and labels: weight 800, uppercase, letter-spacing 0.02em.
- Card name 0.85rem (0.95rem from 640px), clamped to 3 lines. Small labels 0.72-0.85rem.

## Spacing and layout
Source: `src/app/globals.css`

| Token | Value | Usage |
| --- | --- | --- |
| `--pad` | `1rem` | Horizontal page padding |
| `--max` | `72rem` | Max content width (`main`, header inner, footer) |

- Gaps: 0.5rem (chips, search), 0.75rem (mobile grid), 1rem (grid from 640px).
- Breakpoints: 640px (3-col grid), 900px (4-col grid, two-column product page).
- Touch targets: 44px minimum, 48px for search/buttons, cart FAB 56px.

## Radius
Source: `src/app/globals.css` (literal values)

- 4px badges; 6px inputs, buttons, chips, cards; 8px quote items; 12px cart badge; 999px cart FAB.

## Shadows
Source: `src/app/globals.css` (literal values)

- Card hover: `0 4px 14px rgb(43 42 51 / 0.15)`. Cart FAB: `0 4px 14px rgb(43 42 51 / 0.35)`.

## Components
Source: `src/app/globals.css`, `src/components/*`

- **Page frame**: 8px `--red` top border on `body`; sticky header on `#f8f8f8` with bottom `--line` border and the SICOR logo (44px high); footer on `--charcoal`, white bold text "SICOR | SUMINISTROS INDUSTRIALES CÓRDOBA".
- **Section title**: uppercase, 5px `--red` left bar, 0.6rem padding.
- **Button `.btn`**: 48px high, 6px radius, charcoal fill, white uppercase 800 text. `.btn--primary` red fill; `.btn--ghost` transparent with 2px charcoal border; `.btn--wa` `#1a7f37`.
- **Search**: 48px input with 2px `--line` border (charcoal on focus) plus button.
- **Chip**: min 44x44, 2px `--line` border, 6px radius, bold; selected = charcoal fill with white text; focus ring `--red` 3px.
- **Product card**: 1px `--line` border, 6px radius; square `--light` image box (`object-fit: contain`, multiply blend); name; "Consultar cotización" in red uppercase 800 0.72rem. Empty image: `--line` letters on `--light`.
- **Numbered category row**: 44x48 badge (`--red` or `--charcoal`), uppercase name, muted count, 2px `--line` divider.
- **Cart FAB**: fixed bottom-right, 56px high pill, `--red`, white uppercase text, charcoal count badge with 2px white border.
- **Note**: `--light` background, 5px `--red` left bar.
- **Focus**: `:focus-visible` 3px `--red` outline, 2px offset. Motion only under `prefers-reduced-motion: no-preference`.
