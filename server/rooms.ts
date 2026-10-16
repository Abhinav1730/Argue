import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  Participant,
  ParticipantProfile,
  SourceInput,
  RoomEvent,
  NewRoomEvent,
  HistoryResult,
} from "../src/shared/protocol";
type Seat = {
  profile: Participant;
  resumeToken: string;
  disconnectedAt: number | null;
};
type Room = {
  id: string;
  invite: string;
  createdAt: number;
  seats: Seat[];
  events: RoomEvent[];
  sources: Map<string, RoomEvent & { type: "source" }>;
  seq: number;
};
export type RoomSeatResult = {
  roomId: string;
  invite: string;
  participant: Participant;
  participants: Participant[];
  resumeToken: string;
};
export class RoomStore {
  rooms = new Map<string, Room>();
  constructor(private clock = Date.now) {}
  private get(id: string) {
    const r = this.rooms.get(id);
    if (!r || this.clock() - r.createdAt >= 86400000) {
      if (r) this.rooms.delete(id);
      throw Error("Room expired");
    }
    this.prune(r);
    return r;
  }
  private prune(r: Room) {
    r.events = r.events
      .filter((e) => this.clock() - e.createdAt <= 600000)
      .slice(-100);
    for (const [key, e] of r.sources)
      if (this.clock() - e.createdAt > 600000) r.sources.delete(key);
    while (r.sources.size > 100)
      r.sources.delete(r.sources.keys().next().value!);
  }
  private add(r: Room, profile: ParticipantProfile) {
    const seat: Seat = {
      profile: { ...profile, id: randomUUID(), connected: false },
      resumeToken: randomBytes(32).toString("base64url"),
      disconnectedAt: this.clock(),
    };
    r.seats.push(seat);
    return this.result(r, seat);
  }
  private result(r: Room, s: Seat): RoomSeatResult {
    return {
      roomId: r.id,
      invite: r.invite,
      participant: { ...s.profile },
      participants: r.seats.map((x) => ({ ...x.profile })),
      resumeToken: s.resumeToken,
    };
  }
  create(profile: ParticipantProfile) {
    this.sweep();
    if (this.rooms.size >= 500) throw Error("Server room capacity reached");
    const r: Room = {
      id: randomUUID(),
      invite: randomBytes(24).toString("base64url"),
      createdAt: this.clock(),
      seats: [],
      events: [],
      sources: new Map(),
      seq: 0,
    };
    this.rooms.set(r.id, r);
    return this.add(r, profile);
  }
  join(invite: string, profile: ParticipantProfile, resumeToken?: string) {
    this.sweep();
    const r = [...this.rooms.values()].find((x) => x.invite === invite);
    if (!r) throw Error("Room expired");
    this.get(r.id);
    if (resumeToken) {
      const seat = r.seats.find(
        (s) =>
          s.resumeToken.length === resumeToken.length &&
          timingSafeEqual(Buffer.from(s.resumeToken), Buffer.from(resumeToken)),
      );
      if (
        !seat ||
        (seat.disconnectedAt !== null &&
          this.clock() - seat.disconnectedAt > 60000)
      )
        throw Error("Reconnect expired");
      // A resume HTTP request does not transfer or disconnect socket ownership.
      return this.result(r, seat);
    }
    r.seats = r.seats.filter(
      (s) =>
        s.disconnectedAt === null || this.clock() - s.disconnectedAt <= 60000,
    );
    if (r.seats.length >= 2) throw Error("Room is full");
    return this.add(r, profile);
  }
  member(roomId: string, id: string) {
    const r = this.get(roomId);
    const s = r.seats.find((s) => s.profile.id === id);
    if (
      !s ||
      (s.disconnectedAt !== null && this.clock() - s.disconnectedAt > 60000)
    )
      throw Error("Membership expired");
    return this.result(r, s);
  }
  connect(roomId: string, id: string) {
    const r = this.get(roomId);
    const s = r.seats.find((s) => s.profile.id === id);
    this.member(roomId, id);
    s!.disconnectedAt = null;
    s!.profile.connected = true;
    return this.result(r, s!);
  }
  disconnect(id: string) {
    for (const r of this.rooms.values()) {
      const s = r.seats.find((s) => s.profile.id === id);
      if (s) {
        s.profile.connected = false;
        s.disconnectedAt = this.clock();
      }
    }
  }
  leave(roomId: string, id: string) {
    const r = this.get(roomId);
    r.seats = r.seats.filter((s) => s.profile.id !== id);
  }
  source(roomId: string, id: string, input: SourceInput) {
    const r = this.get(roomId);
    const member = this.member(roomId, id);
    const key = id + ":" + input.segmentId;
    if ((r.sources.get(key)?.revision ?? 0) >= input.revision)
      throw Error("Obsolete revision");
    const e = this.append({
      type: "source",
      roomId,
      participantId: id,
      ...input,
      language: member.participant.language,
      sourceTimestamp: this.clock(),
    });
    if (e.type === "source") r.sources.set(key, e);
    return e;
  }
  currentSource(roomId: string, id: string, segmentId: string) {
    return this.get(roomId).sources.get(id + ":" + segmentId);
  }
  participants(roomId: string) {
    return this.get(roomId).seats.map((s) => ({ ...s.profile }));
  }
  append(input: NewRoomEvent): RoomEvent {
    const r = this.get(input.roomId);
    const e = {
      ...input,
      id: randomUUID(),
      seq: ++r.seq,
      createdAt: this.clock(),
    } as RoomEvent;
    r.events.push(e);
    this.prune(r);
    return e;
  }
  history(roomId: string, afterSeq: number): HistoryResult {
    const r = this.get(roomId);
    const first = r.events[0]?.seq ?? r.seq + 1;
    return {
      events: r.events.filter((e) => e.seq > afterSeq),
      latestSeq: r.seq,
      historyIncomplete: afterSeq < first - 1,
    };
  }
  sweep() {
    for (const [id, r] of this.rooms) {
      if (this.clock() - r.createdAt >= 86400000) this.rooms.delete(id);
      else this.prune(r);
    }
  }
}
