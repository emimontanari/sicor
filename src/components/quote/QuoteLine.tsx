"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { itemKey, type CartItem } from "../../lib/cart/cart";
import { dispatchCart } from "../../lib/cart/store";
import type { QuoteMedia } from "../../lib/cart/quote";

export function QuoteLine({ item, media, onRemove }: {
  item: CartItem; media: QuoteMedia; onRemove: (item: CartItem) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(item.note));
  const id = useId();
  const key = itemKey(item);
  const variants = [item.talle ? `Talle ${item.talle}` : "", item.color ? `Color ${item.color}` : ""].filter(Boolean).join(" · ");
  return (
    <li className="qc-line">
      <div className={`qc-thumb${media.image ? "" : " qc-thumb--empty"}`}>
        {media.image ? (
          // Catalog URLs are already resolved to our image route on the server.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.image} alt={item.name} width={72} height={72} loading="lazy" />
        ) : <><b>Sin foto</b><span>{item.code}</span></>}
      </div>
      <div className="qc-info">
        <p className="qc-meta">{media.brand && <><b>{media.brand}</b> · </>}{item.code}</p>
        <Link className="qc-name" href={`/producto/${encodeURIComponent(item.code)}`}>{item.name}</Link>
        {variants && <p className="qc-variant">{variants}</p>}
      </div>
      <div className="qc-controls">
        <div className="qc-step" role="group" aria-label={`Cantidad de ${item.name}`}>
          <button type="button" aria-label="Menos" onClick={() => item.quantity <= 1 ? onRemove(item) : dispatchCart({ type: "decrement", key })}>−</button>
          <output aria-live="polite">{item.quantity}</output>
          <button type="button" aria-label="Más" onClick={() => dispatchCart({ type: "setQuantity", key, quantity: item.quantity + 1 })}>+</button>
        </div>
        <button type="button" className="qc-tool" aria-expanded={noteOpen} aria-controls={id} onClick={() => setNoteOpen(!noteOpen)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          Nota{item.note && <span className="qc-dot" aria-label="con nota" />}
        </button>
        <button type="button" className="qc-trash" aria-label={`Quitar ${item.name}`} onClick={() => onRemove(item)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="qc-note" id={id} hidden={!noteOpen}>
        <label className="sr-only" htmlFor={`${id}-input`}>Nota para {item.name}</label>
        <input id={`${id}-input`} type="text" maxLength={200} placeholder="Nota (opcional): medida, color, marca…" value={item.note ?? ""} onChange={(e) => dispatchCart({ type: "setNote", key, note: e.target.value })} />
      </div>
    </li>
  );
}
