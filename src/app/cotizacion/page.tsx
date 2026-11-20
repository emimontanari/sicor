import type { Metadata } from "next";
import { QuoteCart } from "../../components/QuoteCart";
import { getStorefrontSettings, listProducts } from "../../server/catalog";
import { quoteMediaMap } from "../../lib/cart/quote";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi cotización", robots: { index: false } };

export default async function QuotePage() {
  const [{ whatsappNumber, messageTemplate }, products] = await Promise.all([
    getStorefrontSettings(), listProducts(),
  ]);
  return (
    <section className="section quote-page">
      <h1 className="page-title">Mi cotización</h1>
      <p className="muted">Revisá los productos y envialos por WhatsApp para consultar cotización.</p>
      <QuoteCart whatsappNumber={whatsappNumber} messageTemplate={messageTemplate} media={quoteMediaMap(products)} />
    </section>
  );
}
