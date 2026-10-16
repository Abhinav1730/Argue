import { it, expect } from "vitest";
import { PlaybackController } from "../src/media/playback";
it("removes corrected units from the pending speech queue", () => {
  const { p, utterances } = fixture();
  p.enqueue({ ...t, id: "busy", segmentId: "other", text: "Busy" });
  p.enqueue(t);
  p.invalidate("a", "s", 2);
  utterances[0].onend?.();
  expect(utterances.map((u) => u.text)).toEqual(["Busy"]);
});
it("cancels corrected speech and prevents obsolete replay or late delivery", () => {
  const { p, utterances } = fixture();
  p.enqueue(t);
  p.invalidate("a", "s", 2);
  expect(p.replay()).toBe(false);
  p.enqueue(t);
  expect(utterances).toHaveLength(1);
  p.enqueue({ ...t, id: "new", sourceRevision: 2, text: "Corrected" });
  expect(utterances.at(-1)?.text).toBe("Corrected");
});
it("retains a caption for explicit replay when automatic speech is off", () => {
  const { p, utterances } = fixture();
  p.enqueue(t, false);
  expect(utterances).toHaveLength(0);
  expect(p.replay()).toBe(true);
  expect(utterances).toHaveLength(1);
});
function fixture() {
  const utterances: Array<{ text: string; onend: (() => void) | null }> = [];
  let cancelled = 0;
  const p = new PlaybackController(
    {
      voices: () => [{ lang: "en-US" } as SpeechSynthesisVoice],
      speak: (u) =>
        utterances.push(u as unknown as (typeof utterances)[number]),
      cancel: () => {
        cancelled++;
      },
      utterance: (text) => ({ text, onend: null }) as SpeechSynthesisUtterance,
    },
    () => 1000,
  );
  return { p, utterances, cancels: () => cancelled };
}
const t = {
  id: "t",
  participantId: "a",
  segmentId: "s",
  sourceRevision: 1,
  text: "Not the deadline.",
  targetLanguage: "en",
  createdAt: 1000,
} as const;
it("interrupts locally and rejects obsolete completion", () => {
  const { p, utterances, cancels } = fixture();
  p.enqueue(t);
  const oldEnd = utterances[0].onend;
  p.interrupt();
  expect(cancels()).toBe(1);
  expect(p.epoch).toBe(1);
  oldEnd?.();
  expect(p.played).toHaveLength(0);
  expect(p.replay()).toBe(true);
});
it("does not speak without a matching-language voice", () => {
  const { p, utterances } = fixture();
  p.enqueue({ ...t, targetLanguage: "hi" });
  expect(utterances).toHaveLength(0);
  expect(p.unavailable).toBe(true);
});
it("does not automatically drain interruption backlog", () => {
  const { p, utterances } = fixture();
  p.interrupt();
  p.enqueue(t);
  p.enqueue({ ...t, id: "t2" });
  expect(utterances).toHaveLength(0);
  expect(p.replay()).toBe(true);
  expect(utterances).toHaveLength(1);
});
