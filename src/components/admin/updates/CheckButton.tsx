"use client";

import { useActionState } from "react";
import { checkAction, type UpdatesActionState } from "../../../app/admin/actualizaciones/actions";

export function CheckButton() {
  const [state, action, pending] = useActionState<UpdatesActionState>(checkAction, {});
  return (
    <form action={action} className="upd-check">
      <button type="submit" className="admin-btn" disabled={pending} aria-busy={pending}>
        {pending ? "Buscando… (puede tardar unos segundos)" : "Buscar actualizaciones"}
      </button>
      {state.error ? (
        <p role="alert" className="admin-error">
          {state.error}
        </p>
      ) : state.message ? (
        <p role="status">{state.message}</p>
      ) : null}
    </form>
  );
}
