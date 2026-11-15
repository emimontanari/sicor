"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "../../../server/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="admin-card admin-login">
      <h1>Ingresar</h1>
      <label>
        Email
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        Contraseña
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error ? (
        <p role="alert" className="admin-error">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="admin-btn" disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
