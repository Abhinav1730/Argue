import { upgradeWebSocket } from "@vercel/functions";
import type { IncomingMessage } from "node:http";
import { createRoomServer } from "../../../../server/index";
import { serverConfig } from "../../../../server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Assignment prototype: one warm instance owns its rooms; no persistence.
let service: ReturnType<typeof createRoomServer> | undefined;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get("host"))
        return Response.json(
          { error: "Origin rejected" },
          { status: 403, headers },
        );
    } catch {
      return Response.json(
        { error: "Origin rejected" },
        { status: 403, headers },
      );
    }
  }
  const config = serverConfig();
  if (config.secret.length < 32)
    return Response.json(
      {
        error:
          "Set ROOM_SERVICE_SECRET to a random secret of at least 32 characters in Vercel.",
      },
      { status: 503, headers },
    );
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
    return Response.json(
      { error: "Connect using WebSocket." },
      { status: 426, headers },
    );
  service ??= createRoomServer(config);
  // attachSocket uses just these request fields for origin checks and throttling.
  const connection = {
    headers: { host: request.headers.get("host"), origin },
    socket: { remoteAddress: request.headers.get("x-real-ip") || "vercel" },
  } as unknown as IncomingMessage;
  const current = service;
  return upgradeWebSocket((ws) => current.attachSocket(ws, connection), {
    maxPayload: 16384,
  });
}
