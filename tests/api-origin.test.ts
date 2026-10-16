import { it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/[...path]/route";
afterEach(() => vi.unstubAllGlobals());
it("uses the actual request host when Next normalizes an internal URL", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ roomId: "r" }));
  const request = new NextRequest("http://localhost:3000/api/rooms", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    body: "{}",
  });
  expect(
    (await POST(request, { params: Promise.resolve({ path: ["rooms"] }) }))
      .status,
  ).toBe(200);
});
it("rejects a different browser origin", async () => {
  const request = new NextRequest("http://localhost:3000/api/rooms", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", origin: "https://unrelated.example" },
    body: "{}",
  });
  expect(
    (await POST(request, { params: Promise.resolve({ path: ["rooms"] }) }))
      .status,
  ).toBe(403);
});
