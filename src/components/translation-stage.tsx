import { WaveformIcon } from "@phosphor-icons/react";
import { Waveform } from "./waveform";
import { languages, type Language } from "../shared/protocol";
export function TranslationStage({
  text,
  emphasis,
  original,
  language,
  overlap,
  captions,
  demo,
  error,
  notice,
  empty,
}: {
  text: string;
  emphasis?: string;
  original: string;
  language: Language;
  overlap: boolean;
  captions: boolean;
  demo: boolean;
  error?: string;
  notice?: string;
  empty?: boolean;
}) {
  return (
    <section className="translation-stage" aria-label="Live translation">
      <div className="stage-top">
        <div className="stage-label mono">
          LIVE TRANSLATION
          <span />
        </div>
        <div className={"stage-status" + (overlap ? " active" : "")}>
          <span className="status-dot" />
          {overlap ? "Both speaking" : demo ? "Live demo" : "Private room"}
          <WaveformIcon size={42} weight="bold" />
        </div>
      </div>
      <div className="stage-content">
        {captions ? (
          <>
            <h1
              className={"translation" + (empty ? " empty-caption" : "")}
              aria-live="polite"
            >
              <span>{text}</span>
              {emphasis ? <span className="emphasis">{emphasis}</span> : null}
            </h1>
            <Waveform wide active={!empty} seed={3} />
            <div className="original">
              <p className="mono">ORIGINAL ({languages[language].label})</p>
              <p lang={language}>
                {original || "Your partner’s words will appear here."}
              </p>
            </div>
          </>
        ) : (
          <div className="caption-hidden">
            <h1>Stay in the conversation.</h1>
            <p>Captions are hidden. Audio and translation continue.</p>
          </div>
        )}
      </div>
      {error || notice ? (
        <div
          className={"stage-message" + (error ? " error" : "")}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </div>
      ) : null}
    </section>
  );
}
