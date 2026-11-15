"use client";
import Link from "next/link";
import { itemKey } from "../lib/cart/cart";
import { dispatchCart, useCart } from "../lib/cart/store";
import { buildWhatsAppUrl } from "../lib/cart/whatsapp";

export function QuoteCart({
  whatsappNumber,
  messageTemplate,
}: {
  whatsappNumber: string | null;
  messageTemplate: string;
}) {
  const cart = useCart();

  if (cart.items.length === 0) {
    return (
      <div className="empty">
        <p>Tu cotización está vacía.</p>
        <Link href="/" className="btn btn--primary">
          Ver catálogo
        </Link>
      </div>
    );
  }

  const url = buildWhatsAppUrl({
    number: whatsappNumber,
    template: messageTemplate,
    items: cart.items,
    customerNote: cart.customerNote,
  });

  return (
    <div className="quote">
      <ul className="quote__list">
        {cart.items.map((i) => {
          const key = itemKey(i);
          const variants = [i.talle ? `Talle ${i.talle}` : "", i.color ? `Color ${i.color}` : ""]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={key} className="quote__item">
              <div className="quote__head">
                <div>
                  <Link href={`/producto/${encodeURIComponent(i.code)}`} className="quote__name">
                    {i.name}
                  </Link>
                  <p className="muted quote__meta">
                    {i.code}
                    {variants ? ` · ${variants}` : ""}
                  </p>
                </div>
                <button type="button" className="link-btn" onClick={() => dispatchCart({ type: "remove", key })}>
                  Quitar
                </button>
              </div>
              <div className="stepper" role="group" aria-label={`Cantidad de ${i.name}`}>
                <button
                  type="button"
                  aria-label="Menos"
                  disabled={i.quantity <= 1}
                  onClick={() => dispatchCart({ type: "setQuantity", key, quantity: i.quantity - 1 })}
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  aria-label="Cantidad"
                  value={i.quantity}
                  onChange={(e) =>
                    dispatchCart({ type: "setQuantity", key, quantity: Number(e.target.value) || 1 })
                  }
                />
                <button
                  type="button"
                  aria-label="Más"
                  onClick={() => dispatchCart({ type: "setQuantity", key, quantity: i.quantity + 1 })}
                >
                  +
                </button>
              </div>
              <label className="field">
                <span>Nota (opcional)</span>
                <input
                  type="text"
                  value={i.note ?? ""}
                  maxLength={200}
                  onChange={(e) => dispatchCart({ type: "setNote", key, note: e.target.value })}
                />
              </label>
            </li>
          );
        })}
      </ul>

      <label className="field">
        <span>Tu nombre o comentario general (opcional)</span>
        <textarea
          rows={2}
          maxLength={500}
          value={cart.customerNote}
          onChange={(e) => dispatchCart({ type: "setCustomerNote", note: e.target.value })}
        />
      </label>

      <div className="quote__actions">
        {url ? (
          <a className="btn btn--wa" href={url} target="_blank" rel="noopener noreferrer" data-wa-send>
            Enviar por WhatsApp
          </a>
        ) : (
          <>
            <button type="button" className="btn btn--wa" disabled>
              Enviar por WhatsApp
            </button>
            <p className="form-error" role="status">
              WhatsApp no configurado
            </p>
          </>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            if (window.confirm("¿Vaciar la cotización?")) dispatchCart({ type: "clear" });
          }}
        >
          Vaciar cotización
        </button>
      </div>
    </div>
  );
}
