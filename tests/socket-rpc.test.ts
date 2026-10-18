import { it, expect } from "vitest";
import { WebSocket } from "ws";
import { createRoomServer } from "../server/index";
import type { JoinResult, RoomEvent } from "../src/shared/protocol";
import { socketRequest } from "../src/media/socket-rpc";

it("creates, joins, authenticates and translates entirely over the room sockets", async () => {
  const server = createRoomServer({
    secret: "test",
    port: 0,
    adapter: {
      translate: async () => ({ status: "translated", text: "Hola" }),
    },
  });
  await server.start();
  const clients: WebSocket[] = [];
  async function client() {
    const ws = new WebSocket("ws://127.0.0.1:" + server.port);
    clients.push(ws);
    await new Promise<void>((resolve) => ws.once("open", resolve));
    return ws;
  }
  function next(ws: WebSocket, type: string, id?: string) {
    return new Promise<{
      type: string;
      id?: string;
      status: number;
      body: JoinResult;
      event: RoomEvent;
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.off("message", listener);
        reject(Error("Missing " + type));
      }, 1500);
      const listener = (raw: unknown) => {
        const value = JSON.parse(String(raw));
        if (value.type === type && (!id || value.id === id)) {
          clearTimeout(timeout);
          ws.off("message", listener);
          resolve(value);
        }
      };
      ws.on("message", listener);
    });
  }
  const profile = { name: "A", language: "en", listeningLanguage: "es" };
  async function rpc(
    ws: WebSocket,
    id: string,
    path: string,
    body: unknown,
    token?: string,
  ) {
    const response = next(ws, "rpc-result", id);
    ws.send(JSON.stringify({ type: "rpc", id, path, body, token }));
    return response;
  }
  async function auth(ws: WebSocket, token: string) {
    const welcome = next(ws, "welcome");
    ws.send(JSON.stringify({ type: "auth", token, afterSeq: 0 }));
    await welcome;
  }
  try {
    const a = await client();
    const created = await rpc(a, "create", "rooms", profile);
    expect(created.status).toBe(200);
    await auth(a, created.body.token);
    const b = await client();
    const joined = await rpc(b, "join", "rooms/join", {
      ...profile,
      name: "B",
      invite: created.body.invite,
    });
    expect(joined.status).toBe(200);
    await auth(b, joined.body.token);
    const delivered = next(b, "event");
    expect(
      (
        await rpc(
          a,
          "translate",
          "translate",
          { segmentId: "s", revision: 1, committed: true, text: "Hello" },
          created.body.token,
        )
      ).status,
    ).toBe(200);
    expect((await delivered).event.type).toBe("source");
    const third = await client();
    expect(
      (
        await rpc(third, "third", "rooms/join", {
          ...profile,
          invite: created.body.invite,
        })
      ).status,
    ).toBe(409);
    expect(
      (await rpc(a, "bad-token", "rooms/renew", {}, "forged-token")).status,
    ).toBe(400);
  } finally {
    for (const ws of clients) ws.terminate();
    await server.stop();
  }
});

it("the browser RPC bridge resolves replies, rejects errors and cleans up on close", async () => {
  const server = createRoomServer({ secret: "test", port: 0 });
  await server.start();
  const ws = new WebSocket("ws://127.0.0.1:" + server.port);
  const browserSocket = ws as unknown as globalThis.WebSocket;
  try {
    // Request begins while CONNECTING, just as the HTTPS room flow does.
    const result = (await socketRequest(browserSocket, "rooms", {
      name: "A",
      language: "en",
      listeningLanguage: "es",
    })) as JoinResult;
    expect(result.participant.name).toBe("A");
    await expect(
      socketRequest(browserSocket, "rooms/renew", {}, "forged-token"),
    ).rejects.toThrow("unauthorized request");
    expect(ws.listenerCount("message")).toBe(0);
    ws.close();
    await expect(socketRequest(browserSocket, "rooms", {})).rejects.toThrow(
      "connection closed",
    );
  } finally {
    ws.terminate();
    await server.stop();
  }
});
