"use client";
import { useRef, useState } from "react";
import { missingVariants } from "../lib/cart/cart";
import { dispatchCart } from "../lib/cart/store";

const LABEL = { talle: "talle", color: "color" } as const;

export function AddToQuoteButton({
  code,
  name,
  sizes = [],
  colors = [],
}: {
  code: string;
  name: string;
  sizes?: string[];
  colors?: string[];
}) {
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  function selected(group: "talle" | "color"): string | undefined {
    const scope = root.current?.closest(".product__info") ?? document;
    return (
      scope.querySelector<HTMLInputElement>(`input[type="radio"][name="${group}"]:checked`)?.value ||
      undefined
    );
  }

  function add() {
    const talle = selected("talle");
    const color = selected("color");
    const missing = missingVariants({ sizes, colors }, { talle, color });
    if (missing.length > 0) {
      setAdded(false);
      setError(`Elegí ${missing.map((m) => LABEL[m]).join(" y ")} antes de agregar.`);
      return;
    }
    setError(null);
    dispatchCart({ type: "add", item: { code, name, talle, color, quantity: qty } });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 3500);
  }

  return (
    <div className="add-quote" ref={root}>
      <div className="stepper" role="group" aria-label="Cantidad">
        <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Menos">
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={qty}
          aria-label="Cantidad"
          onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
        />
        <button type="button" onClick={() => setQty((q) => Math.min(9999, q + 1))} aria-label="Más">
          +
        </button>
      </div>
      <button type="button" className="btn btn--primary" data-quote-add data-code={code} data-name={name} onClick={add}>
        Agregar a la cotización
      </button>
      <p className="form-error" role="alert" hidden={!error}>
        {error}
      </p>
      <p className="form-ok" role="status">
        {added ? "Agregado a la cotización" : ""}
        {added ? (
          <>
            {" "}
            <a href="/cotizacion">Ver cotización</a>
          </>
        ) : null}
      </p>
    </div>
  );
}
