import type { CatalogDocument } from "../server/catalog/read";
import { Icon } from "./Icon";

/** Product page block: prominent "Ver ficha técnica" button and the list of the other PDFs. */
export function ProductDocuments({ documents }: { documents: CatalogDocument[] }) {
  const ficha = documents.find((d) => d.kind === "ficha");
  const others = documents.filter((d) => d !== ficha);
  if (!ficha && others.length === 0) return null;
  return (
    <>
      {ficha ? (
        <a className="btn btn--ghost ficha-btn" href={ficha.url} target="_blank" rel="noopener noreferrer">
          <Icon name="pdf" className="ficha-btn__ico" />
          <span>Ver ficha técnica</span>
        </a>
      ) : null}
      {others.length > 0 ? (
        <section className="docs" aria-labelledby="docs-title">
          <h2 id="docs-title" className="docs__title">
            Certificaciones y documentos
          </h2>
          <ul className="docs__list">
            {others.map((d) => (
              <li key={d.url}>
                <a href={d.url} target="_blank" rel="noopener noreferrer">
                  <Icon name="pdf" className="docs__ico" />
                  <span>{d.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
