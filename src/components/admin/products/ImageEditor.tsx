"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { resetImageAction } from "../../../app/admin/productos/actions";

type Props = { code: string; customUrl: string | null; supplierUrl: string | null };

const MAX = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ImageEditor({ code, customUrl, supplierUrl }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, startReset] = useTransition();

  const previewRef = useRef<string | null>(null);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const setSelection = (f: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = f ? URL.createObjectURL(f) : null;
    setFile(f);
    setPreview(previewRef.current);
  };

  const pick = (f: File | null) => {
    setOk(null);
    setError(null);
    if (f && !TYPES.includes(f.type)) {
      setError("Formato no permitido (solo JPEG, PNG o WebP)");
      setSelection(null);
    } else if (f && f.size > MAX) {
      setError("La imagen supera los 5 MB");
      setSelection(null);
    } else setSelection(f);
  };

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const body = new FormData();
      body.set("image", file);
      const res = await fetch(`/admin/productos/${encodeURIComponent(code)}/imagen`, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) setError(data.error ?? "No se pudo subir la imagen");
      else {
        setOk("Imagen actualizada");
        setSelection(null);
        router.refresh();
      }
    } catch {
      setError("No se pudo subir la imagen");
    } finally {
      setBusy(false);
    }
  }

  const shown = preview ?? customUrl ?? supplierUrl;
  return (
    <section className="admin-card pr-image">
      <h2>Imagen</h2>
      <div className="pr-image__preview">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={preview ? "Vista previa" : "Imagen actual"} />
        ) : (
          <span>Sin imagen</span>
        )}
      </div>
      <p className="pr-muted">
        {preview ? "Vista previa (sin guardar)" : customUrl ? "Imagen personalizada" : "Imagen del proveedor"}
      </p>
      <label>
        Subir imagen (JPEG, PNG o WebP, máx. 5 MB)
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </label>
      <div className="pr-image__actions">
        <button type="button" className="admin-btn" disabled={!file || busy} onClick={upload}>
          {busy ? "Subiendo…" : "Subir imagen"}
        </button>
        {customUrl ? (
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={resetting}
            onClick={() => startReset(async () => { await resetImageAction(code); setOk("Se volvió a la imagen del proveedor"); router.refresh(); })}
          >
            Volver a imagen del proveedor
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="admin-error">{error}</p> : null}
      {ok ? <p role="status" className="pr-ok">{ok}</p> : null}
    </section>
  );
}
