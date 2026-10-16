import { languages, type Language, type SourceInput } from "../shared/protocol";
import { RecognitionPolicy } from "./lifecycle";
type Result = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<Result> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  abort(): void;
};
type Constructor = new () => Recognition;
export function recognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: Constructor;
    webkitSpeechRecognition?: Constructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}
export class RecognitionController {
  private recognition?: Recognition;
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private policy = new RecognitionPolicy();
  private session = 0;
  constructor(
    private onSource: (s: SourceInput) => void,
    private onError: (message: string) => void,
    private speechStart: () => void,
    private speechEnd: () => void,
  ) {}
  start(language: Language) {
    this.stop();
    const C = recognitionConstructor();
    if (!C) {
      this.onError("Speech recognition unavailable. You can type instead.");
      return;
    }
    this.running = true;
    this.policy = new RecognitionPolicy();
    const token = ++this.session;
    const launch = () => {
      if (!this.running || token !== this.session) return;
      const r = new C();
      this.recognition = r;
      r.lang = languages[language].locale;
      r.continuous = true;
      r.interimResults = true;
      const segments = new Map<number, { id: string; revision: number }>();
      r.onresult = (e) => {
        if (!this.running || token !== this.session) return;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const text = [...result[0].transcript.trim()].slice(0, 1000).join("");
          if (!text) continue;
          const unit = segments.get(i) || {
            id: crypto.randomUUID(),
            revision: 0,
          };
          unit.revision++;
          segments.set(i, unit);
          this.onSource({
            segmentId: unit.id,
            revision: unit.revision,
            text,
            committed: result.isFinal,
          });
        }
      };
      r.onspeechstart = this.speechStart;
      r.onspeechend = this.speechEnd;
      r.onerror = (e) => {
        if (!this.running) return;
        if (
          [
            "not-allowed",
            "service-not-allowed",
            "language-not-supported",
            "audio-capture",
          ].includes(e.error)
        ) {
          this.policy.deny();
          this.running = false;
          this.onError(
            "Recognition unavailable (" + e.error + "). You can type instead.",
          );
        } else if (e.error !== "no-speech" && e.error !== "aborted")
          this.onError(
            "Recognition interrupted. You can type while it recovers.",
          );
      };
      r.onend = () => {
        if (!this.running || token !== this.session) return;
        const delay = this.policy.nextDelay();
        if (delay === null) {
          this.running = false;
          this.onError(
            "Recognition stopped repeatedly. Restart your microphone or type instead.",
          );
          return;
        }
        this.timer = setTimeout(launch, delay);
      };
      try {
        r.start();
      } catch {
        this.running = false;
        this.onError("Recognition could not start. You can type instead.");
      }
    };
    launch();
  }
  stop() {
    this.running = false;
    this.session++;
    clearTimeout(this.timer);
    if (this.recognition) {
      this.recognition.onend = null;
      this.recognition.onresult = null;
      this.recognition.onspeechstart = null;
      this.recognition.onspeechend = null;
      this.recognition.abort();
      this.recognition = undefined;
    }
  }
  dispose() {
    this.stop();
  }
}
