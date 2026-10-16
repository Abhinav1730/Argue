import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  ClosedCaptioningIcon,
  PhoneIcon,
  ArrowCounterClockwiseIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
export function CallControls({
  muted,
  captions,
  onMic,
  onCaptions,
  onLeave,
  onReplay,
  onSettings,
  disabled,
}: {
  muted: boolean;
  captions: boolean;
  onMic: () => void;
  onCaptions: () => void;
  onLeave: () => void;
  onReplay: () => void;
  onSettings: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="call-controls" aria-label="Call controls">
      <button
        className="settings-button"
        onClick={onSettings}
        aria-label="Room and audio settings"
      >
        <SlidersHorizontalIcon size={23} />
        <span>Room settings</span>
      </button>
      <div className="primary-controls">
        <div className="control">
          <button
            className={"round mic" + (muted ? " is-muted" : "")}
            onClick={onMic}
            aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            aria-pressed={!muted}
            disabled={disabled}
          >
            {muted ? (
              <MicrophoneSlashIcon size={38} />
            ) : (
              <MicrophoneIcon size={38} />
            )}
          </button>
          <span>{muted ? "Mic off" : "Microphone"}</span>
        </div>
        <div className="control">
          <button
            className={"round captions" + (captions ? " selected" : "")}
            onClick={onCaptions}
            aria-label={captions ? "Hide captions" : "Show captions"}
            aria-pressed={captions}
          >
            <ClosedCaptioningIcon size={40} />
          </button>
          <span>Captions</span>
        </div>
        <div className="control">
          <button
            className="round leave"
            onClick={onLeave}
            aria-label="Leave room"
          >
            <PhoneIcon size={38} weight="fill" style={{transform:"rotate(135deg)"}}/>
          </button>
          <span>Leave</span>
        </div>
      </div>
      <button className="replay" onClick={onReplay}>
        <ArrowCounterClockwiseIcon size={33} weight="bold" />
        <span>Replay last 30 seconds</span>
      </button>
    </section>
  );
}
