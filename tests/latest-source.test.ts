import { it, expect } from "vitest";
import {
  emptyConversation,
  reduceRoomEvent,
  latestSource,
  sourceForTranslation,
} from "../src/shared/conversation";
import type { SourceSegment, Translation } from "../src/shared/protocol";
const first: SourceSegment = {
  type: "source",
  id: "e1",
  seq: 1,
  roomId: "r",
  participantId: "a",
  segmentId: "s1",
  revision: 1,
  sourceTimestamp: 10,
  createdAt: 10,
  text: "First",
  language: "en",
  committed: true,
};
const translation: Translation = {
  ...first,
  type: "translation",
  id: "t1",
  seq: 2,
  text: "Primero",
  recipientId: "b",
  targetLanguage: "es",
  sourceRevision: 1,
  status: "translated",
};
it("selects the newest source for display and correction even with equal timestamps", () => {
  let s = reduceRoomEvent(emptyConversation(), first);
  s = reduceRoomEvent(s, {
    ...first,
    id: "e2",
    seq: 3,
    segmentId: "s2",
    text: "Second",
  });
  expect(latestSource(s, "a")?.segmentId).toBe("s2");
  expect(latestSource(s, "b")).toBeUndefined();
});
it("pairs the caption original with that translation's source instead of a newer phrase", () => {
  let s = reduceRoomEvent(emptyConversation(), first);
  s = reduceRoomEvent(s, translation);
  s = reduceRoomEvent(s, {
    ...first,
    id: "e2",
    seq: 3,
    segmentId: "s2",
    text: "Second",
  });
  expect(sourceForTranslation(s, translation)?.text).toBe("First");
  s = reduceRoomEvent(s, {
    ...first,
    id: "e3",
    seq: 4,
    revision: 2,
    text: "Corrected first",
  });
  expect(sourceForTranslation(s, translation)).toBeUndefined();
});
