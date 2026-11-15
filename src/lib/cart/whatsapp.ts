import type { CartItem } from "./cart";

type MessageInput = { template: string; items: CartItem[]; customerNote?: string };

export function buildQuoteMessage({ template, items, customerNote }: MessageInput): string {
  const lines = [template];
  for (const i of items) {
    const variants = [i.talle ? `Talle ${i.talle}` : "", i.color ? `Color ${i.color}` : ""].filter(Boolean);
    let line = `• ${i.quantity} x ${i.name}`;
    if (variants.length) line += ` (${variants.join(", ")})`;
    line += ` [${i.code}]`;
    const note = i.note?.trim();
    if (note) line += ` — ${note}`;
    lines.push(line);
  }
  const extra = customerNote?.trim();
  if (extra) lines.push("", extra);
  return lines.join("\n");
}

/** Returns null when there is no usable number: a link is never built without one. */
export function buildWhatsAppUrl(input: MessageInput & { number: string | null | undefined }): string | null {
  const digits = (input.number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(buildQuoteMessage(input))}`;
}
