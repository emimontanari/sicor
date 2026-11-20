import { describe, expect, it } from "vitest";
import { DdpConnection, type DdpSocket } from "../../src/server/masefer/ddp";
import { MaseferSyncError } from "../../src/server/masefer/errors";

type Handler = (msg: Record<string, unknown>, reply: (m: unknown) => void, sock: FakeSocket) => void;

class FakeSocket implements DdpSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  closed = false;
  constructor(private handler: Handler, opts: { failOpen?: boolean } = {}) {
    queueMicrotask(() => (opts.failOpen ? this.onerror?.(new Error("boom")) : this.onopen?.()));
  }
  reply = (m: unknown) => queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(m) }));
  send(data: string) {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    this.handler(msg, this.reply, this);
  }
  close() {
    this.closed = true;
  }
}

const happy: Handler = (msg, reply) => {
  if (msg.msg === "connect") reply({ msg: "connected", session: "s" });
  if (msg.msg === "sub") {
    reply({ msg: "ping" });
    reply({ msg: "added", collection: "c", id: "1", fields: { a: 1 } });
    reply({ msg: "ready", subs: [msg.id] });
  }
};

const open = (handler: Handler, timeoutMs = 200) => {
  let sock!: FakeSocket;
  const p = DdpConnection.open({ url: "ws://x", timeoutMs, settleMs: 0, createSocket: () => (sock = new FakeSocket(handler)) });
  return { p, sock: () => sock };
};

describe("DdpConnection", () => {
  it("connects, subscribes, collects docs on ready, answers ping, closes", async () => {
    const { p, sock } = open(happy);
    const conn = await p;
    await conn.subscribe("things", [1]);
    expect(conn.docs()).toEqual([{ collection: "c", id: "1", fields: { a: 1 } }]);
    expect(sock().sent.map((m) => m.msg)).toEqual(["connect", "sub", "pong"]);
    expect(sock().sent[1]).toMatchObject({ name: "things", params: [1] });
    conn.close();
    expect(sock().closed).toBe(true);
  });

  it("rejects with MaseferSyncError on nosub", async () => {
    const { p } = open((msg, reply) => {
      if (msg.msg === "connect") reply({ msg: "connected" });
      if (msg.msg === "sub") reply({ msg: "nosub", id: msg.id, error: { reason: "nope" } });
    });
    const conn = await p;
    const err = await conn.subscribe("bad", []).catch((e) => e);
    expect(err).toBeInstanceOf(MaseferSyncError);
    expect(err.code).toBe("subscription");
    expect(err.message).toContain("bad");
  });

  it("rejects with timeout MaseferSyncError when ready never arrives", async () => {
    const { p } = open((msg, reply) => {
      if (msg.msg === "connect") reply({ msg: "connected" });
    }, 30);
    const conn = await p;
    const err = await conn.subscribe("slow", []).catch((e) => e);
    expect(err).toBeInstanceOf(MaseferSyncError);
    expect(err.code).toBe("timeout");
  });

  it("rejects DDP version negotiation as a protocol error and closes the socket", async () => {
    const { p, sock } = open((msg, reply) => {
      if (msg.msg === "connect") reply({ msg: "failed", version: "2" });
    });
    await expect(p).rejects.toMatchObject({ code: "protocol", message: "Masefer rejected the DDP version" });
    expect(sock().closed).toBe(true);
  });

  it("rejects with timeout when connected never arrives", async () => {
    const err = await open(() => {}, 30).p.catch((e) => e);
    expect(err).toBeInstanceOf(MaseferSyncError);
    expect(err.code).toBe("timeout");
  });

  it("rejects with connect error when socket errors", async () => {
    const err = await DdpConnection.open({ url: "ws://x", timeoutMs: 100, settleMs: 0, createSocket: () => new FakeSocket(happy, { failOpen: true }) }).catch((e) => e);
    expect(err).toBeInstanceOf(MaseferSyncError);
    expect(err.code).toBe("connect");
  });

  it("rejects pending subscription when the socket closes", async () => {
    const { p, sock } = open((msg, reply, s) => {
      if (msg.msg === "connect") reply({ msg: "connected" });
      if (msg.msg === "sub") queueMicrotask(() => s.onclose?.());
    });
    const conn = await p;
    const err = await conn.subscribe("x", []).catch((e) => e);
    expect(err).toBeInstanceOf(MaseferSyncError);
    expect(sock().closed).toBe(false);
  });
});
