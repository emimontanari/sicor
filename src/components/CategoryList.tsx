import Link from "next/link";
import type { CategoryWithCount } from "../server/catalog";

export const badgeNumber = (i: number) => String(i + 1).padStart(2, "0");

/** Numbered list like PDF page 2: red / charcoal alternating badges. */
export function CategoryList({ categories }: { categories: CategoryWithCount[] }) {
  return (
    <ol className="cat-list">
      {categories.map((c, i) => (
        <li key={c.slug}>
          <Link href={`/categoria/${c.slug}`} className="cat-list__row">
            <span className={`badge ${i % 2 === 0 ? "badge--red" : "badge--dark"}`} aria-hidden>
              {badgeNumber(i)}
            </span>
            <span className="cat-list__name">{c.name}</span>
            <span className="cat-list__count">
              {c.count} {c.count === 1 ? "producto" : "productos"}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
