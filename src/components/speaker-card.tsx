import { WaveformIcon } from "@phosphor-icons/react";
import { Waveform } from "./waveform";
import { languages, type Language } from "../shared/protocol";
export function SpeakerCard({
  name,
  language,
  active,
  highlight,
  text,
  romanization,
  analyser,
  seed = 1,
  captions = true,
  waiting = false,
}: {
  name: string;
  language: Language;
  active: boolean;
  highlight?: boolean;
  text: string;
  romanization?: string;
  analyser?: AnalyserNode;
  seed?: number;
  captions?: boolean;
  waiting?: boolean;
}) {
  return (
    <article className={"speaker-card" + (highlight ? " highlighted" : "")}>
      <div className="speaker-title">
        <h2>{name}</h2>
        <span className={"speaker-status" + (active ? " active" : "")}>
          {waiting ? "Waiting" : active ? "Speaking" : "Listening"}
          <WaveformIcon size={38} weight="bold" />
        </span>
      </div>
      <p className="mono speaker-language">
        {waiting ? "INVITE SOMEONE" : languages[language].label}
      </p>
      <Waveform active={active} seed={seed} analyser={analyser} />
      <div className="speaker-transcript" aria-live="polite">
        {captions ? (
          <>
            <p lang={language}>{text}</p>
            {romanization ? <span>{romanization}</span> : null}
          </>
        ) : (
          <p className="muted-copy">Captions hidden</p>
        )}
      </div>
    </article>
  );
}
