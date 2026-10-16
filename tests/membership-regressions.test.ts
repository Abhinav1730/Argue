import { it, expect, vi } from "vitest";
import { WebSocket } from "ws";
import { createRoomServer } from "../server/index";
const profile = { name: "A", language: "en", listeningLanguage: "es" };
async function fixture() {
  const service = createRoomServer({ secret: "test", port: 0 });
  await service.start();
  const post = (path: string, body: unknown) =>
    fetch("http://127.0.0.1:" + service.port + path, {
      method: "POST",
      headers: { "x-room-secret": "test", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const a = await (await post("/rooms", profile)).json();
  const b = await (
    await post("/rooms/join", { ...profile, name: "B", invite: a.invite })
  ).json();
  const sockets: WebSocket[] = [];
  const connect = async (token: string) => {
    const ws = new WebSocket("ws://127.0.0.1:" + service.port);
    sockets.push(ws);
    await new Promise<void>((r) => ws.once("open", r));
    ws.send(JSON.stringify({ type: "auth", token, afterSeq: 0 }));
    await new Promise<void>((r) => ws.once("message", () => r()));
    return ws;
  };
  await connect(a.token);
  await connect(b.token);
  return {
    service,
    post,
    a,
    b,
    sockets,
    stop: async () => {
      for (const s of sockets) s.terminate();
      await service.stop();
      vi.useRealTimers();
    },
  };
}
it("does not release an occupied seat when a resume request never opens a replacement socket", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  const f = await fixture();
  try {
    expect(
      (
        await f.post("/rooms/join", {
          ...profile,
          invite: f.a.invite,
          resumeToken: f.a.resumeToken,
        })
      ).status,
    ).toBe(200);
    vi.setSystemTime(Date.now() + 60001);
    expect(
      (
        await f.post("/rooms/join", {
          ...profile,
          name: "C",
          invite: f.a.invite,
        })
      ).status,
    ).toBe(409);
    expect(f.service.store.participants(f.a.roomId)).toHaveLength(2);
  } finally {
    await f.stop();
  }
});
it("expires sockets into a sixty-second reservation instead of a permanently occupied seat", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  const f = await fixture();
  try {
    vi.setSystemTime(Date.now() + 900001);
    await vi.advanceTimersByTimeAsync(30000);
    await new Promise((r) => setTimeout(r, 20));
    expect(
      f.service.store.participants(f.a.roomId).every((p) => !p.connected),
    ).toBe(true);
    vi.setSystemTime(Date.now() + 60001);
    expect(
      (
        await f.post("/rooms/join", {
          ...profile,
          name: "C",
          invite: f.a.invite,
        })
      ).status,
    ).toBe(200);
  } finally {
    await f.stop();
  }
});
