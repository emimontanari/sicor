/**
 * Placeholder for T4: rendered disabled with data attributes the cart script reads.
 * T4 removes `disabled` / `data-pending` when it wires the click handler.
 */
export function AddToQuoteButton({ code, name }: { code: string; name: string }) {
  return (
    <button
      type="button"
      className="btn btn--primary"
      data-quote-add
      data-code={code}
      data-name={name}
      data-variant=""
      data-pending="true"
      disabled
    >
      Agregar a la cotización
    </button>
  );
}
