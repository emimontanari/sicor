import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section notfound">
      <h1 className="page-title">Página no encontrada</h1>
      <p className="muted">El producto o la página que buscás no está disponible.</p>
      <Link href="/" className="btn btn--primary">
        Volver al catálogo
      </Link>
    </section>
  );
}
