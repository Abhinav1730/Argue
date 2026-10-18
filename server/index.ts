import {
  createServer,
  type IncomingMessage,
  type IncomingHttpHeaders,
} from "node:http";
import { Readable } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { RoomStore } from "./rooms";
import { signParticipant, verifyParticipant } from "./auth";
import {
  profileSchema,
  sourceSchema,
  clientMessageSchema,
  type RoomEvent,
} from "../src/shared/protocol";
import { OpenRouterAdapter, type TranslationAdapter } from "./translation";
import { TranslationScheduler } from "./translation-limiter";
type Options = {
  secret: string;
  port: number;
  key?: string;
  model?: string;
  providers?: string[];
  adapter?: TranslationAdapter;
};
type RoomRequest = AsyncIterable<string | Uint8Array> & {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string };
};
type RoomResponse = {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body: string): unknown;
};
export function createRoomServer(options: Options) {
  if (!options.secret) throw Error("ROOM_SERVICE_SECRET required");
  const store = new RoomStore();
  const scheduler = new TranslationScheduler();
  const adapter =
    options.adapter ??
    new OpenRouterAdapter({
      key: options.key || "",
      model: options.model || "google/gemma-4-31b-it:free",
      providers: options.providers || ["google-ai-studio"],
      dataCollection:
        process.env.OPENROUTER_DATA_COLLECTION === "allow" ? "allow" : "deny",
    });
  const sockets = new Map<
    string,
    { ws: WebSocket; roomId: string; expiresAt: number }
  >();
  const joins = new Map<string, { count: number; until: number }>();
  const inflight = new Set<string>();
  const send = (ws: WebSocket, data: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  };
  const broadcast = (roomId: string, data: unknown) => {
    for (const [id, s] of sockets)
      if (s.roomId === roomId && eligible(id, s)) send(s.ws, data);
  };
  function eligible(id: string, s: { roomId: string; expiresAt: number }) {
    try {
      return (
        Date.now() < s.expiresAt &&
        store.member(s.roomId, id).participant.connected
      );
    } catch {
      return false;
    }
  }
  const publish = (event: RoomEvent) => {
    for (const [id, s] of sockets)
      if (s.roomId === event.roomId && eligible(id, s)) {
        if (event.type !== "translation" || event.recipientId === id)
          send(s.ws, { type: "event", event });
        else send(s.ws, { type: "cursor", seq: event.seq });
      }
  };
  const membership = (roomId: string) =>
    broadcast(roomId, {
      type: "members",
      participants: store.participants(roomId),
    });
  const credentials = async (r: ReturnType<RoomStore["create"]>) => ({
    ...r,
    token: await signParticipant(r.roomId, r.participant.id, options.secret),
    expiresAt: Date.now() + 900000,
  });
  function detach(id: string, ws: WebSocket) {
    const owned = sockets.get(id);
    if (owned?.ws !== ws) return;
    sockets.delete(id);
    store.disconnect(id);
    try {
      membership(owned.roomId);
    } catch {}
  }
  const auth = async (token: string) => {
    const a = await verifyParticipant(token, options.secret);
    store.member(a.roomId, a.participantId);
    return a;
  };
  const handleHttp = async (req: RoomRequest, res: RoomResponse) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const reply = (status: number, data: unknown) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    if (
      req.method !== "POST" ||
      req.headers["x-room-secret"] !== options.secret
    ) {
      reply(403, { error: "Forbidden" });
      return;
    }
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 16384) {
          reply(413, { error: "Message too large" });
          return;
        }
      }
      const body = JSON.parse(raw || "{}");
      if (req.url === "/rooms" || req.url === "/rooms/join") {
        const ip = req.socket.remoteAddress || "local";
        let rate = joins.get(ip);
        if (!rate || rate.until < Date.now()) {
          rate = { count: 0, until: Date.now() + 60000 };
          joins.set(ip, rate);
        }
        if (++rate.count > 30) {
          reply(429, { error: "Too many room attempts" });
          return;
        }
        const p = profileSchema.parse(body);
        const r =
          req.url === "/rooms"
            ? store.create(p)
            : store.join(
                z.string().max(128).parse(body.invite),
                p,
                body.resumeToken
                  ? z.string().max(128).parse(body.resumeToken)
                  : undefined,
              );
        reply(200, await credentials(r));
        return;
      }
      const token = String(req.headers.authorization || "").replace(
        /^Bearer /,
        "",
      );
      const a = await auth(token);
      if (req.url === "/rooms/renew") {
        reply(200, await credentials(store.member(a.roomId, a.participantId)));
        return;
      }
      if (req.url === "/translate") {
        const source = sourceSchema.parse(body);
        if (!source.committed) {
          reply(400, { error: "Stable source required" });
          return;
        }
        let stored = store.currentSource(
          a.roomId,
          a.participantId,
          source.segmentId,
        );
        if (!stored || stored.revision < source.revision) {
          publish(store.source(a.roomId, a.participantId, source));
          stored = store.currentSource(
            a.roomId,
            a.participantId,
            source.segmentId,
          );
        }
        if (
          !stored ||
          stored.revision !== source.revision ||
          stored.text !== source.text
        ) {
          reply(409, { error: "Obsolete revision" });
          return;
        }
        const recipient = store
          .participants(a.roomId)
          .find((p) => p.id !== a.participantId);
        if (!recipient) {
          reply(409, { error: "Waiting for the other participant" });
          return;
        }
        const unit =
          a.participantId + ":" + source.segmentId + ":" + source.revision;
        if (inflight.has(unit)) {
          reply(409, { error: "Translation already requested" });
          return;
        }
        inflight.add(unit);
        try {
          const context = store
            .history(a.roomId, 0)
            .events.filter(
              (e) =>
                e.type === "source" &&
                e.participantId === a.participantId &&
                e.segmentId !== source.segmentId,
            )
            .slice(-6)
            .map((e) => ("text" in e ? e.text : ""));
          while (context.join("").length > 3000) context.shift();
          const result = await scheduler.submit(a.roomId, (signal) =>
            adapter.translate(
              {
                text: stored!.text,
                sourceLanguage: stored!.language,
                targetLanguage: recipient.listeningLanguage,
                segmentId: source.segmentId,
                revision: source.revision,
                context,
              },
              signal,
            ),
          );
          const current = store.currentSource(
            a.roomId,
            a.participantId,
            source.segmentId,
          );
          if (current?.revision !== source.revision) {
            reply(409, { error: "Obsolete revision" });
            return;
          }
          store.member(a.roomId, recipient.id);
          store.member(a.roomId, a.participantId);
          if (result.status === "needs_context") {
            reply(200, result);
            return;
          }
          const event = store.append({
            type: "translation",
            roomId: a.roomId,
            participantId: a.participantId,
            segmentId: source.segmentId,
            revision: source.revision,
            sourceRevision: source.revision,
            sourceTimestamp: stored.sourceTimestamp,
            recipientId: recipient.id,
            targetLanguage: recipient.listeningLanguage,
            text: result.text,
            status: "translated",
          });
          publish(event);
          reply(200, { status: "translated" });
          return;
        } catch (error) {
          const code =
            error instanceof Error ? error.message : "provider_error";
          if (
            [
              "unavailable",
              "rate_limited",
              "queue_full",
              "timeout",
              "provider_error",
              "invalid_output",
            ].includes(code)
          ) {
            const listener = sockets.get(recipient.id);
            if (listener?.roomId === a.roomId)
              send(listener.ws, { type: "error", error: code });
          }
          throw error;
        } finally {
          inflight.delete(unit);
        }
      }
      reply(404, { error: "Not found" });
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? "Invalid input"
          : error instanceof Error
            ? error.message
            : "Request failed";
      const safe = [
        "unavailable",
        "rate_limited",
        "queue_full",
        "timeout",
        "provider_error",
        "invalid_output",
        "Room is full",
        "Room expired",
        "Membership expired",
        "Reconnect expired",
        "Obsolete revision",
        "Server room capacity reached",
      ].includes(message)
        ? message
        : "Unauthorized or invalid request";
      reply(
        message === "Room is full"
          ? 409
          : message === "rate_limited" || message === "queue_full"
            ? 429
            : message === "timeout"
              ? 504
              : message === "unavailable"
                ? 503
                : message === "provider_error" || message === "invalid_output"
                  ? 502
                  : 400,
        { error: safe },
      );
    }
  };
  const http = createServer(handleHttp);
  const wss = new WebSocketServer({ server: http, maxPayload: 16384 });
  const attachSocket = (ws: WebSocket, request: IncomingMessage) => {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin) {
      try {
        const u = new URL(origin);
        const allowed = (process.env.ROOM_ALLOWED_ORIGINS || "").split(",");
        if (u.hostname !== host?.split(":")[0] && !allowed.includes(origin)) {
          ws.close(1008, "Origin rejected");
          return;
        }
      } catch {
        ws.close(1008);
        return;
      }
    }
    let identity: Awaited<ReturnType<typeof auth>> | undefined;
    let count = 0;
    let windowAt = Date.now();
    const deadline = setTimeout(() => {
      if (!identity) ws.close(1008, "Authentication required");
    }, 5000);
    ws.on("error", () => {});
    ws.on("message", async (data) => {
      let rpcId: string | undefined;
      try {
        if (Date.now() - windowAt > 1000) {
          count = 0;
          windowAt = Date.now();
        }
        if (++count > 30) {
          ws.close(1008, "Rate limited");
          return;
        }
        const raw = JSON.parse(String(data));
        if (raw.type === "rpc") {
          const m = z
            .object({
              id: z.string().min(1).max(80),
              path: z.enum(["rooms", "rooms/join", "rooms/renew", "translate"]),
              body: z.unknown(),
              token: z.string().max(2048).optional(),
            })
            .parse(raw);
          rpcId = m.id;
          if (m.path !== "rooms" && m.path !== "rooms/join") {
            if (!identity || sockets.get(identity.participantId)?.ws !== ws)
              throw Error("Authentication required");
            const owner = await auth(m.token || "");
            if (
              owner.participantId !== identity.participantId ||
              owner.roomId !== identity.roomId
            )
              throw Error("Identity change");
          } else if (identity) throw Error("Already joined");
          // Invoke the existing HTTP contract in-process. No localhost request,
          // listening port, or second function instance is involved.
          const req = Object.assign(
            Readable.from([JSON.stringify(m.body ?? {})]),
            {
              method: "POST",
              url: "/" + m.path,
              headers: {
                "x-room-secret": options.secret,
                authorization: "Bearer " + (m.token || ""),
              },
              socket: request.socket,
            },
          );
          const res = {
            statusCode: 200,
            setHeader() {},
            end(body: string) {
              send(ws, {
                type: "rpc-result",
                id: m.id,
                status: this.statusCode,
                body: JSON.parse(body),
              });
            },
          };
          await handleHttp(req, res);
          return;
        }
        const m = clientMessageSchema.parse(raw);
        if (m.type === "auth") {
          const a = await auth(m.token);
          if (
            identity &&
            (identity.participantId !== a.participantId ||
              identity.roomId !== a.roomId)
          )
            throw Error("Identity change");
          identity = a;
          clearTimeout(deadline);
          const old = sockets.get(a.participantId);
          sockets.set(a.participantId, {
            ws,
            roomId: a.roomId,
            expiresAt: a.expiresAt,
          });
          if (old?.ws !== ws) old?.ws.close(1000, "Reconnected");
          store.connect(a.roomId, a.participantId);
          const history = store.history(a.roomId, m.afterSeq);
          send(ws, {
            type: "welcome",
            participants: store.participants(a.roomId),
            history: {
              ...history,
              events: history.events.filter(
                (e) =>
                  e.type !== "translation" || e.recipientId === a.participantId,
              ),
            },
          });
          membership(a.roomId);
          return;
        }
        if (
          !identity ||
          Date.now() >= identity.expiresAt ||
          sockets.get(identity.participantId)?.ws !== ws
        )
          throw Error("Authentication expired");
        store.member(identity.roomId, identity.participantId);
        if (m.type === "signal") {
          for (const [id, s] of sockets)
            if (
              id !== identity.participantId &&
              s.roomId === identity.roomId &&
              eligible(id, s)
            )
              send(s.ws, {
                type: "signal",
                participantId: identity.participantId,
                signal: m.signal,
              });
        }
        if (m.type === "source")
          publish(store.source(identity.roomId, identity.participantId, m));
        if (m.type === "playback") {
          const t = store
            .history(identity.roomId, 0)
            .events.find((e) => e.id === m.translationId);
          if (
            t?.type !== "translation" ||
            t.recipientId !== identity.participantId
          )
            throw Error("Invalid playback");
          publish(
            store.append({
              type: "playback",
              roomId: identity.roomId,
              participantId: identity.participantId,
              segmentId: t.segmentId,
              revision: t.revision,
              sourceTimestamp: Date.now(),
              translationId: m.translationId,
              epoch: m.epoch,
              status: m.status,
            }),
          );
        }
        if (m.type === "leave") {
          store.leave(identity.roomId, identity.participantId);
          sockets.delete(identity.participantId);
          membership(identity.roomId);
          ws.close();
        }
      } catch {
        if (rpcId) {
          send(ws, {
            type: "rpc-result",
            id: rpcId,
            status: 400,
            body: { error: "Invalid, obsolete, or unauthorized request" },
          });
          return;
        }
        send(ws, {
          type: "error",
          error: "Invalid, obsolete, or unauthorized event",
        });
      }
    });
    ws.on("close", () => {
      clearTimeout(deadline);
      if (identity) detach(identity.participantId, ws);
    });
  };
  wss.on("connection", attachSocket);
  const sweep = setInterval(() => {
    store.sweep();
    for (const [key, value] of joins)
      if (value.until < Date.now()) joins.delete(key);
    for (const [id, s] of sockets) {
      if (Date.now() >= s.expiresAt || !store.rooms.has(s.roomId)) {
        detach(id, s.ws);
        s.ws.close(1008, "Session expired");
      } else s.ws.ping();
    }
  }, 30000);
  sweep.unref();
  return {
    store,
    attachSocket,
    http,
    get port() {
      const a = http.address();
      return typeof a === "object" && a ? a.port : options.port;
    },
    start: () =>
      new Promise<void>((resolve) =>
        http.listen(options.port, "0.0.0.0", resolve),
      ),
    stop: async () => {
      clearInterval(sweep);
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => http.close(() => r()));
    },
  };
}
