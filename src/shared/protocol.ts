import { z } from "zod";
export const languages = {
  en: { label: "English", locale: "en-US" },
  hi: { label: "Hindi", locale: "hi-IN" },
  es: { label: "Spanish", locale: "es-ES" },
} as const;
export type Language = keyof typeof languages;
export const languageSchema = z.enum(["en", "hi", "es"]);
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  language: languageSchema,
  listeningLanguage: languageSchema,
});
export type ParticipantProfile = z.infer<typeof profileSchema>;
export type Participant = ParticipantProfile & {
  id: string;
  connected: boolean;
};
export const sourceSchema = z.object({
  segmentId: z.string().min(1).max(80),
  revision: z.number().int().min(1).max(10000),
  text: z
    .string()
    .trim()
    .min(1)
    .refine((s) => [...s].length <= 1000),
  committed: z.boolean(),
});
export type SourceInput = z.infer<typeof sourceSchema>;
type Base = {
  id: string;
  seq: number;
  roomId: string;
  participantId: string;
  segmentId: string;
  revision: number;
  sourceTimestamp: number;
  createdAt: number;
};
export type SourceSegment = Base & {
  type: "source";
  text: string;
  language: Language;
  committed: boolean;
};
export type Translation = Base & {
  type: "translation";
  text: string;
  recipientId: string;
  targetLanguage: Language;
  sourceRevision: number;
  status: "translated";
};
export type PlaybackEvent = Base & {
  type: "playback";
  translationId: string;
  epoch: number;
  status: "played" | "interrupted";
};
export type RoomEvent = SourceSegment | Translation | PlaybackEvent;
export type NewRoomEvent = RoomEvent extends infer T
  ? T extends RoomEvent
    ? Omit<T, "id" | "seq" | "createdAt">
    : never
  : never;
export type RtcSignal = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
export const signalSchema = z.object({
  description: z
    .object({
      type: z.enum(["offer", "answer", "rollback", "pranswer"]),
      sdp: z.string().max(12000).optional(),
    })
    .optional(),
  candidate: z
    .object({
      candidate: z.string().max(3000).optional(),
      sdpMid: z.string().nullable().optional(),
      sdpMLineIndex: z.number().nullable().optional(),
      usernameFragment: z.string().nullable().optional(),
    })
    .optional(),
});
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    token: z.string().max(2048),
    afterSeq: z.number().int().min(0).default(0),
  }),
  sourceSchema.extend({ type: z.literal("source") }),
  z.object({ type: z.literal("signal"), signal: signalSchema }),
  z.object({
    type: z.literal("playback"),
    translationId: z.string().max(80),
    epoch: z.number().int().min(0),
    status: z.enum(["played", "interrupted"]),
  }),
  z.object({ type: z.literal("leave") }),
]);
export type JoinResult = {
  roomId: string;
  invite: string;
  participant: Participant;
  participants: Participant[];
  token: string;
  resumeToken: string;
  expiresAt: number;
  wsUrl?: string;
};
export type HistoryResult = {
  events: RoomEvent[];
  latestSeq: number;
  historyIncomplete: boolean;
};
