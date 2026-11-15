import type { Metadata } from "next";
import { QuoteCart } from "../../components/QuoteCart";
import { getStorefrontSettings } from "../../server/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi cotización", robots: { index: false } };

export default async function QuotePage() {
  const { whatsappNumber, messageTemplate } = await getStorefrontSettings();
  return (
    <section className="section">
      <h1 className="page-title">Mi cotización</h1>
      <p className="muted">Revisá los productos y envialos por WhatsApp para consultar cotización.</p>
      <QuoteCart whatsappNumber={whatsappNumber} messageTemplate={messageTemplate} />
    </section>
  );
}
