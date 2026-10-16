import type { RoomEvent, SourceSegment, Translation } from "./protocol";
export type ConversationState = {
  events: RoomEvent[];
  sources: Record<string, SourceSegment>;
  translations: Translation[];
  latestSeq: number;
  historyIncomplete: boolean;
};
export const emptyConversation = (): ConversationState => ({
  events: [],
  sources: {},
  translations: [],
  latestSeq: 0,
  historyIncomplete: false,
});
export function latestSource(
  state: ConversationState,
  participantId?: string,
  committedOnly = false,
): SourceSegment | undefined {
  if (!participantId) return undefined;
  return Object.values(state.sources)
    .filter(
      (s) =>
        s.participantId === participantId && (!committedOnly || s.committed),
    )
    .sort((a, b) => b.seq - a.seq)[0];
}
export function sourceForTranslation(
  state: ConversationState,
  translation: Translation,
): SourceSegment | undefined {
  const source =
    state.sources[translation.participantId + ":" + translation.segmentId];
  return source?.revision === translation.sourceRevision ? source : undefined;
}
export function reduceRoomEvent(
  state: ConversationState,
  event: RoomEvent,
): ConversationState {
  if (state.events.some((e) => e.id === event.id)) return state;
  const key = event.participantId + ":" + event.segmentId;
  if (
    event.type === "source" &&
    (state.sources[key]?.revision ?? 0) >= event.revision
  )
    return state;
  if (
    event.type === "translation" &&
    (state.sources[key]?.revision ?? 0) > event.sourceRevision
  )
    return state;
  const next = {
    ...state,
    latestSeq: Math.max(state.latestSeq, event.seq),
    historyIncomplete:
      state.historyIncomplete || event.seq > state.latestSeq + 1,
    events: [...state.events, event].slice(-100),
  };
  if (event.type === "source") {
    next.sources = { ...state.sources, [key]: event };
    next.translations = state.translations.filter(
      (t) =>
        t.participantId !== event.participantId ||
        t.segmentId !== event.segmentId ||
        t.sourceRevision >= event.revision,
    );
    const entries = Object.entries(next.sources)
      .sort((a, b) => b[1].createdAt - a[1].createdAt)
      .slice(0, 100);
    next.sources = Object.fromEntries(entries);
  }
  if (event.type === "translation")
    next.translations = [
      ...state.translations.filter(
        (t) =>
          t.segmentId !== event.segmentId ||
          t.participantId !== event.participantId,
      ),
      event,
    ].slice(-100);
  return next;
}
