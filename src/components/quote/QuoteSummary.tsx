"use client";
import { useId, useRef, useState } from "react";
import type { CartState } from "../../lib/cart/cart";
import { quoteSummary } from "../../lib/cart/quote";
import { dispatchCart } from "../../lib/cart/store";
import { buildQuoteMessage, buildWhatsAppUrl } from "../../lib/cart/whatsapp";
import { WhatsAppMark } from "./WhatsAppMark";
import { Icon } from "../Icon";

export function QuoteSummary({ cart, whatsappNumber, messageTemplate, onClear }: {
  cart: CartState; whatsappNumber: string | null; messageTemplate: string; onClear?: () => void;
}) {
  const [commentOpen, setCommentOpen] = useState(Boolean(cart.customerNote));
  const [messageOpen, setMessageOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const clearRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const input = { template: messageTemplate, items: cart.items, customerNote: cart.customerNote };
  const url = buildWhatsAppUrl({ ...input, number: whatsappNumber });
  return <aside className="qc-panel" aria-label="Resumen y envío">
    <p className="qc-count">{quoteSummary(cart)}</p>
    <div className="qc-options">
      <button type="button" className="qc-tool" aria-expanded={commentOpen} aria-controls={`${id}-comment`} onClick={() => setCommentOpen(!commentOpen)}><Icon name="plus" />Tu nombre o comentario</button>
      <button type="button" className="qc-tool" aria-expanded={messageOpen} aria-controls={`${id}-message`} onClick={() => setMessageOpen(!messageOpen)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="2.2" /><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg>Ver mensaje</button>
    </div>
    <div className="qc-comment" id={`${id}-comment`} hidden={!commentOpen}>
      <label htmlFor={`${id}-input`}>Tu nombre o comentario (opcional)</label>
      <textarea id={`${id}-input`} rows={2} maxLength={500} value={cart.customerNote} onChange={(e) => dispatchCart({ type: "setCustomerNote", note: e.target.value })} />
    </div>
    <pre className="qc-message" id={`${id}-message`} hidden={!messageOpen}>{buildQuoteMessage(input)}</pre>
    {url ? <a className="qc-send" href={url} target="_blank" rel="noopener noreferrer" data-wa-send><WhatsAppMark />Enviar por WhatsApp</a> : <>
      <button type="button" className="qc-send" disabled><WhatsAppMark />Enviar por WhatsApp</button>
      <p className="qc-off" role="status">WhatsApp no configurado</p>
    </>}
    <div className="qc-clear" onKeyDown={(e) => { if (e.key === "Escape") { setConfirm(false); clearRef.current?.focus(); } }}>
      <button ref={clearRef} hidden={confirm} type="button" className="qc-link" onClick={() => setConfirm(true)}>Vaciar cotización</button>
      {confirm && <><p>¿Vaciar la cotización?</p>
        <button type="button" className="qc-tool qc-tool--fill" autoFocus onClick={() => { onClear?.(); dispatchCart({ type: "clear" }); }}>Confirmar</button>
        <button type="button" className="qc-tool" onClick={() => { setConfirm(false); clearRef.current?.focus(); }}>Cancelar</button>
      </>}
    </div>
  </aside>;
}
