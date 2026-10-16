import type { Language } from "../shared/protocol";
type Unit = {
  id: string;
  text: string;
  targetLanguage: Language;
  createdAt: number;
  participantId: string;
  segmentId: string;
  sourceRevision: number;
};
type SynthPort = {
  voices: () => SpeechSynthesisVoice[];
  speak: (u: SpeechSynthesisUtterance) => void;
  cancel: () => void;
  utterance: (text: string) => SpeechSynthesisUtterance;
};
export class PlaybackController {
  epoch = 0;
  played: string[] = [];
  unavailable = false;
  private held = false;
  private disposed = false;
  private history: Unit[] = [];
  private current?: Unit;
  private pending?: Unit;
  private revisions = new Map<string, number>();
  private eligible(t: Unit) {
    return (
      t.sourceRevision >=
      (this.revisions.get(t.participantId + ":" + t.segmentId) ?? 0)
    );
  }
  invalidate(participantId: string, segmentId: string, revision: number) {
    const key = participantId + ":" + segmentId;
    this.revisions.set(key, Math.max(revision, this.revisions.get(key) ?? 0));
    while (this.revisions.size > 100)
      this.revisions.delete(this.revisions.keys().next().value!);
    this.history = this.history.filter((t) => this.eligible(t));
    if (this.pending && !this.eligible(this.pending)) this.pending = undefined;
    if (this.current && !this.eligible(this.current)) {
      this.interrupt();
      this.resume();
    }
  }
  constructor(
    private port: SynthPort,
    private clock = Date.now,
    private acknowledge?: (
      id: string,
      epoch: number,
      status: "played" | "interrupted",
    ) => void,
  ) {}
  enqueue(t: Unit, automatic = true) {
    if (this.disposed || !this.eligible(t)) return;
    this.history = [...this.history.filter((x) => x.id !== t.id), t]
      .filter((x) => this.clock() - x.createdAt <= 30000)
      .slice(-10);
    if (this.held || !automatic) return;
    if (this.current) {
      this.pending = t;
      return;
    }
    this.play(t);
  }
  private play(t: Unit) {
    if (this.disposed || !this.eligible(t)) return;
    const voice = this.port
      .voices()
      .find((v) => v.lang.toLowerCase().split("-")[0] === t.targetLanguage);
    if (!voice) {
      this.unavailable = true;
      return;
    }
    this.unavailable = false;
    const epoch = this.epoch;
    this.current = t;
    const u = this.port.utterance(t.text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 1.05;
    u.onend = () => {
      if (this.disposed || epoch !== this.epoch) return;
      this.played = [...this.played, t.id].slice(-100);
      this.acknowledge?.(t.id, epoch, "played");
      this.current = undefined;
      const next = this.pending;
      this.pending = undefined;
      if (next && !this.held) this.play(next);
    };
    u.onerror = () => {
      if (epoch === this.epoch) {
        this.current = undefined;
        this.pending = undefined;
        this.unavailable = true;
      }
    };
    this.port.speak(u);
  }
  interrupt() {
    if (this.disposed) return;
    const current = this.current;
    this.port.cancel();
    this.epoch++;
    this.current = undefined;
    this.pending = undefined;
    this.held = true;
    if (current) this.acknowledge?.(current.id, this.epoch, "interrupted");
  }
  resume() {
    this.held = false;
    this.pending = undefined;
  }
  replay() {
    const t = this.history
      .filter((x) => this.clock() - x.createdAt <= 30000 && this.eligible(x))
      .at(-1);
    if (!t || this.disposed) return false;
    this.interrupt();
    this.held = false;
    this.play(t);
    return !this.unavailable;
  }
  dispose() {
    this.interrupt();
    this.disposed = true;
    this.history = [];
    this.revisions.clear();
  }
}
export function browserPlayback(
  acknowledge?: (
    id: string,
    epoch: number,
    status: "played" | "interrupted",
  ) => void,
) {
  return new PlaybackController(
    {
      voices: () => speechSynthesis.getVoices(),
      speak: (u) => speechSynthesis.speak(u),
      cancel: () => speechSynthesis.cancel(),
      utterance: (text) => new SpeechSynthesisUtterance(text),
    },
    Date.now,
    acknowledge,
  );
}
