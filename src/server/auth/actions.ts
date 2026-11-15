"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieOptions } from "./cookie";
import { attemptLogin } from "./login";
import { SESSION_COOKIE } from "./token";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const result = await attemptLogin({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    ip,
  });
  if (!result.ok) return { error: result.error };
  (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions());
  redirect("/admin/productos");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  redirect("/admin/login");
}
