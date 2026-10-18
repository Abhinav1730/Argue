import { afterEach, expect, it, vi } from "vitest";
const { upgrade } = vi.hoisted(() => ({
  upgrade: vi.fn(async () => new Response("upgraded")),
}));
vi.mock("@vercel/functions", () => ({ upgradeWebSocket: upgrade }));
import { GET, maxDuration } from "../src/app/api/relay/route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const request = (origin = "https://relay.example") =>
  new Request("https://relay.example/api/relay", {
    headers: { host: "relay.example", origin, upgrade: "websocket" },
  });
it("requires a configured private room secret without opening a local port", async () => {
  vi.stubEnv("ROOM_SERVICE_SECRET", "");
  expect((await GET(request())).status).toBe(503);
  expect(upgrade).not.toHaveBeenCalled();
});
it("rejects cross-origin upgrades", async () => {
  vi.stubEnv("ROOM_SERVICE_SECRET", "a".repeat(64));
  expect((await GET(request("https://unrelated.example"))).status).toBe(403);
  expect(upgrade).not.toHaveBeenCalled();
});
it("uses Vercel's native upgrade with a bounded payload and duration", async () => {
  vi.stubEnv("ROOM_SERVICE_SECRET", "a".repeat(64));
  expect((await GET(request())).status).toBe(200);
  expect(upgrade).toHaveBeenCalledWith(expect.any(Function), {
    maxPayload: 16384,
  });
  expect(maxDuration).toBe(300);
});
