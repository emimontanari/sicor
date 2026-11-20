import Link from "next/link";
import type { FilterChip } from "../../../lib/admin/products/filters";

/** Active filters as removable chips; each link drops exactly that filter. */
export function FilterChips({ chips }: { chips: FilterChip[] }) {
  if (chips.length === 0) return null;
  return (
    <ul className="pr-chips" aria-label="Filtros activos">
      {chips.map((c) => (
        <li key={c.key}>
          <Link href={c.href} scroll={false} className="pr-chip" aria-label={`Quitar filtro ${c.label}`}>
            <span>{c.label}</span>
            <span aria-hidden>✕</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
