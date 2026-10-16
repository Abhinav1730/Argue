import { it, expect } from "vitest";
import { WebSocket } from "ws";
import { createRoomServer } from "../server/index";
import type { TranslationAdapter } from "../server/translation";
const profile = { name: "A", language: "en", listeningLanguage: "es" };
const unit = {
  segmentId: "s",
  revision: 1,
  text: "Not the deadline.",
  committed: true,
};
async function fixture(adapter: TranslationAdapter) {
  const service = createRoomServer({ secret: "test", port: 0, adapter });
  await service.start();
  const post = (path: string, body: unknown, token?: string) =>
    fetch("http://127.0.0.1:" + service.port + path, {
      method: "POST",
      headers: {
        "x-room-secret": "test",
        "Content-Type": "application/json",
        Authorization: "Bearer " + (token || ""),
      },
      body: JSON.stringify(body),
    });
  const a = await (await post("/rooms", profile)).json();
  const b = await (
    await post("/rooms/join", { ...profile, name: "B", invite: a.invite })
  ).json();
  return { service, post, a, b };
}
it("publishes the recipient's translation and keeps missing-provider source captions", async () => {
  const { service, post, a, b } = await fixture({
    translate: async () => ({ status: "translated", text: "No el plazo." }),
  });
  try {
    expect((await post("/translate", unit, a.token)).status).toBe(200);
    const events = service.store.history(a.roomId, 0).events;
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      type: "translation",
      recipientId: b.participant.id,
      text: "No el plazo.",
      targetLanguage: "es",
    });
  } finally {
    await service.stop();
  }
});
it("never publishes an inference result for a corrected source", async () => {
  let release!: (v: { status: "translated"; text: string }) => void;
  let started!: () => void;
  const began = new Promise<void>((r) => (started = r));
  const { service, post, a } = await fixture({
    translate: () => {
      started();
      return new Promise((r) => (release = r));
    },
  });
  try {
    const pending = post("/translate", unit, a.token);
    await began;
    service.store.source(a.roomId, a.participant.id, {
      ...unit,
      revision: 2,
      text: "I agree.",
    });
    release({ status: "translated", text: "No el plazo." });
    expect((await pending).status).toBe(409);
    expect(
      service.store
        .history(a.roomId, 0)
        .events.some((e) => e.type === "translation"),
    ).toBe(false);
  } finally {
    await service.stop();
  }
});
it("shows a provider failure to the waiting recipient as well as the speaker", async () => {
  const { service, post, a, b } = await fixture({
    translate: async () => {
      throw Error("unavailable");
    },
  });
  const ws = new WebSocket("ws://127.0.0.1:" + service.port);
  try {
    await new Promise<void>((r) => ws.once("open", r));
    ws.send(JSON.stringify({ type: "auth", token: b.token, afterSeq: 0 }));
    await new Promise<void>((r) => ws.once("message", () => r()));
    let error = "";
    ws.on("message", (raw) => {
      const data = JSON.parse(String(raw));
      if (data.type === "error") error = data.error;
    });
    expect((await post("/translate", unit, a.token)).status).toBe(503);
    await new Promise((r) => setTimeout(r, 50));
    expect(error).toBe("unavailable");
    expect(service.store.history(a.roomId, 0).events[0]).toMatchObject({
      type: "source",
      text: "Not the deadline.",
    });
  } finally {
    ws.terminate();
    await service.stop();
  }
});
