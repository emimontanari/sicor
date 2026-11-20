"use client";

import { useActionState, useState } from "react";
import { saveSettingsAction, type SettingsState } from "../../../app/admin/ajustes/actions";
import { buildQuoteMessage } from "../../../lib/cart/whatsapp";

type Initial = {
  whatsappNumber: string;
  messageTemplate: string;
  showPrices: boolean;
};

export function SettingsForm({ initial, defaultTemplate }: { initial: Initial; defaultTemplate: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, {});
  const [template, setTemplate] = useState(initial.messageTemplate);
  const preview = buildQuoteMessage({
    template: template.trim() || defaultTemplate,
    items: [
      { code: "EJ-001", name: "Producto de ejemplo", quantity: 2, talle: "M", color: "Azul" },
      { code: "EJ-002", name: "Otro producto", quantity: 1 },
    ],
    customerNote: "Nota del cliente (ejemplo)",
  });
  const err = state.fields ?? {};
  return (
    <form action={action} className="admin-card set-form">
      <label>
        Número de WhatsApp
        <input
          name="whatsappNumber"
          type="tel"
          inputMode="tel"
          defaultValue={initial.whatsappNumber}
          placeholder="5491112345678"
          aria-invalid={!!err.whatsappNumber}
        />
        <small>Solo dígitos con código de país (8 a 15). Vacío = usa el número configurado en el servidor.</small>
        {err.whatsappNumber ? <span className="admin-error" role="alert">{err.whatsappNumber}</span> : null}
      </label>
      <label>
        Mensaje de cotización
        <textarea
          name="messageTemplate"
          rows={4}
          maxLength={500}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder={defaultTemplate}
          aria-invalid={!!err.messageTemplate}
        />
        <small>Vacío = mensaje por defecto. Máximo 500 caracteres.</small>
        {err.messageTemplate ? <span className="admin-error" role="alert">{err.messageTemplate}</span> : null}
      </label>
      <div className="set-preview">
        <strong>Vista previa del mensaje</strong>
        <pre>{preview}</pre>
      </div>
      <label className="set-check">
        <input type="checkbox" name="showPrices" defaultChecked={initial.showPrices} />
        <span>Mostrar precios en el catálogo</span>
      </label>
      <p className="set-note">
        Los precios solo se muestran en los productos que tengan activado “mostrar precio” (y un precio cargado).
      </p>
      {state.error ? <p role="alert" className="admin-error">{state.error}</p> : null}
      {state.ok ? <p role="status">Ajustes guardados.</p> : null}
      <button type="submit" className="admin-btn" disabled={pending} aria-busy={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
