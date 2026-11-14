import { MaseferSyncError } from "./errors";

export interface DdpDoc {
  collection: string;
  id: string;
  fields: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Minimal WebSocket surface (matches the Node/browser global WebSocket). */
export interface DdpSocket {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export interface DdpOptions {
  url: string;
  /** Deadline for the whole connection lifetime (connect + all subscriptions), in ms. */
  timeoutMs: number;
  /** Quiet period after `ready` to catch late docs. 0 disables. */
  settleMs?: number;
  createSocket?: (url: string) => DdpSocket;
}

interface Pending {
  name: string;
  resolve: () => void;
  reject: (e: MaseferSyncError) => void;
}

/** Thin Meteor DDP transport: connect, sub, ready/nosub, ping/pong, deadline, close. No catalog knowledge. */
export class DdpConnection {
  private store = new Map<string, DdpDoc>();
  private pending = new Map<string, Pending>();
  private n = 0;
  private closedByUs = false;
  private failure: MaseferSyncError | null = null;

  private constructor(
    private ws: DdpSocket,
    private deadline: number,
    private settleMs: number,
  ) {}

  static open(opts: DdpOptions): Promise<DdpConnection> {
    const create = opts.createSocket ?? ((u: string) => new WebSocket(u) as unknown as DdpSocket);
    const deadline = Date.now() + opts.timeoutMs;
    return new Promise((resolve, reject) => {
      let ws: DdpSocket;
      try {
        ws = create(opts.url);
      } catch (cause) {
        return reject(new MaseferSyncError("connect", "Could not open Masefer WebSocket", { cause }));
      }
      const conn = new DdpConnection(ws, deadline, opts.settleMs ?? 300);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        conn.close();
        reject(new MaseferSyncError("timeout", `Timed out connecting to Masefer (${opts.timeoutMs}ms)`));
      }, opts.timeoutMs);
      const fail = (e: MaseferSyncError) => {
        if (settled) return conn.fail(e);
        settled = true;
        clearTimeout(timer);
        conn.close();
        reject(e);
      };
      ws.onopen = () => ws.send(JSON.stringify({ msg: "connect", version: "1", support: ["1"] }));
      ws.onerror = (cause) => fail(new MaseferSyncError("connect", "Masefer WebSocket error", { cause }));
      ws.onclose = () => {
        if (!conn.closedByUs) fail(new MaseferSyncError("connect", "Masefer WebSocket closed unexpectedly"));
      };
      ws.onmessage = (e) => {
        const ok = conn.handle(e.data, () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(conn);
        });
        if (!ok) fail(new MaseferSyncError("protocol", "Invalid DDP message from Masefer"));
      };
    });
  }

  private handle(raw: unknown, onConnected: () => void): boolean {
    let o: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      o = JSON.parse(String(raw));
    } catch {
      return false;
    }
    switch (o.msg) {
      case "connected":
        onConnected();
        break;
      case "failed":
        this.fail(new MaseferSyncError("connect", "Masefer rejected the DDP version"));
        break;
      case "ping":
        this.ws.send(JSON.stringify(o.id ? { msg: "pong", id: o.id } : { msg: "pong" }));
        break;
      case "added":
      case "changed":
        if (o.msg === "added") this.store.set(o.collection + "\u0000" + o.id, { collection: o.collection, id: o.id, fields: o.fields ?? {} });
        else {
          const d = this.store.get(o.collection + "\u0000" + o.id);
          if (d) d.fields = { ...d.fields, ...(o.fields ?? {}) };
        }
        break;
      case "removed":
        this.store.delete(o.collection + "\u0000" + o.id);
        break;
      case "ready":
        for (const id of o.subs ?? []) this.pending.get(id)?.resolve();
        break;
      case "nosub": {
        const p = this.pending.get(o.id);
        if (p) {
          const reason = typeof o.error === "string" ? o.error : (o.error?.reason ?? o.error?.message ?? "unknown");
          p.reject(new MaseferSyncError("subscription", `Subscription "${p.name}" rejected: ${reason}`));
        }
        break;
      }
    }
    return true;
  }

  private fail(e: MaseferSyncError) {
    this.failure ??= e;
    for (const p of this.pending.values()) p.reject(e);
  }

  /** Subscribe and wait until ready (and quiet). Docs accumulate in {@link docs}. */
  async subscribe(name: string, params: unknown[]): Promise<void> {
    if (this.failure) throw this.failure;
    const id = "s" + ++this.n;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        this.pending.set(id, { name, resolve, reject });
        timer = setTimeout(() => reject(new MaseferSyncError("timeout", `Timed out waiting for "${name}"`)), Math.max(0, this.deadline - Date.now()));
        this.ws.send(JSON.stringify({ msg: "sub", id, name, params }));
      });
      // docs can keep streaming after `ready`: wait until quiet
      while (this.settleMs > 0) {
        const before = this.store.size;
        await new Promise((r) => setTimeout(r, Math.min(this.settleMs, Math.max(0, this.deadline - Date.now()))));
        if (this.store.size === before || Date.now() >= this.deadline) break;
      }
    } finally {
      clearTimeout(timer);
      this.pending.delete(id);
    }
  }

  docs(): DdpDoc[] {
    return [...this.store.values()];
  }

  close() {
    this.closedByUs = true;
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}
