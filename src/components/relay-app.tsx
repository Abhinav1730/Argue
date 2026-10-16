"use client";
import { useState, useEffect, useRef } from "react";
import {
  LockSimpleIcon,
  WaveformIcon,
  ArrowUpRightIcon,
  XIcon,
  CopyIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { useDemo } from "../hooks/use-demo";
import { useRoom } from "../hooks/use-room";
import { SpeakerCard } from "./speaker-card";
import { TranslationStage } from "./translation-stage";
import { CallControls } from "./call-controls";
import { RoomSetup } from "./room-setup";
import { languages, type ParticipantProfile } from "../shared/protocol";
import { latestSource, sourceForTranslation } from "../shared/conversation";
function Settings({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="setup-dialog settings-dialog"
      aria-label="Room and audio settings"
      onCancel={onClose}
    >
      <button
        className="close-button"
        onClick={onClose}
        aria-label="Close settings"
      >
        <XIcon size={24} />
      </button>
      {children}
    </dialog>
  );
}
export function RelayApp({
  initialInvite = "",
  providerDescription,
}: {
  initialInvite?: string;
  providerDescription: string;
}) {
  const demo = useDemo();
  const room = useRoom();
  const [live, setLive] = useState(false);
  const [setup, setSetup] = useState(!!initialInvite);
  const [settings, setSettings] = useState(false);
  const invite = initialInvite;
  const [clock, setClock] = useState<Date | null>(null);
  const [typed, setTyped] = useState("");
  const [correct, setCorrect] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const ended = live ? room.status === "ended" : demo.ended;
  const self = room.join?.participant;
  const remote = room.participants.find((p) => p.id !== self?.id);
  const incoming = room.conversation.translations
    .filter((t) => t.recipientId === self?.id)
    .at(-1);
  const source = latestSource(room.conversation, remote?.id);
  const stageSource = incoming
    ? sourceForTranslation(room.conversation, incoming)
    : source;
  const remoteSpeaking =
    !!source &&
    !source.committed &&
    !!clock &&
    clock.getTime() - source.createdAt < 5000;
  const captions = live ? room.captions : demo.captions;
  async function create(profile: ParticipantProfile, invitation?: string) {
    const success = await room.openRoom(profile, invitation);
    if (success) {
      setLive(true);
      setSetup(false);
    }
  }
  async function copyInvite() {
    if (!room.join) return;
    try {
      await navigator.clipboard.writeText(
        location.origin + "/?invite=" + room.join.invite,
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  const start = () => {
    setSetup(true);
    setSettings(false);
  };
  return (
    <main className="relay-shell">
      <header className="app-header">
        <button
          className="brand"
          onClick={() => (live ? start() : demo.reset())}
          aria-label="Argue home"
        >
          Argue
          <span />
        </button>
        <span className="header-rule" />
        <div className="room-context">
          <div>
            <LockSimpleIcon size={22} weight="fill" />
            <button onClick={start}>Private room</button>
            {!live ? (
              <span className="demo-badge">DEMO</span>
            ) : (
              <span className="live-badge">{room.status}</span>
            )}
            <button className="start-link" onClick={start}>
              {live ? "New room" : "Start a room"}
              <ArrowUpRightIcon size={13} />
            </button>
          </div>
          <p>Two languages. A more interesting conversation.</p>
        </div>
        <div className="relay-identity">
          <span>RELAY</span>
          <WaveformIcon size={40} weight="bold" />
        </div>
        <div className="header-time mono">
          {clock
            ? clock
                .toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })
                .toUpperCase()
            : "16 OCTOBER 2026"}
          <br />
          UTC{" "}
          {clock
            ? clock.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
              })
            : "--:--"}
        </div>
      </header>
      {ended ? (
        <section className="ended-view">
          <p className="mono">ROOM CLOSED</p>
          <h1>
            A good argument
            <br />
            <em>starts with listening.</em>
          </h1>
          <p>Your microphone and room connection are stopped.</p>
          <button className="submit-button" onClick={start}>
            Start another conversation
            <ArrowUpRightIcon />
          </button>
          <button
            className="text-action"
            onClick={() => {
              setLive(false);
              demo.reset();
            }}
          >
            Back to demo
          </button>
        </section>
      ) : (
        <>
          <div className="conversation-layout">
            <aside className="speaker-rail" aria-label="Participants">
              <SpeakerCard
                name={live ? self?.name || "You" : "Asha"}
                language={live ? self?.language || "en" : "hi"}
                active={live ? room.speaking : !demo.muted}
                highlight={live ? room.speaking : !demo.muted}
                seed={1}
                analyser={live ? room.analyser : undefined}
                captions={captions}
                text={
                  live
                    ? room.draft || "Your words, in your own language."
                    : "“लेकिन समय सीमा बहुत जल्दी है।”"
                }
                romanization={
                  live ? undefined : "Lekin samay seema bahut jaldi hai."
                }
              />
              <SpeakerCard
                name={live ? remote?.name || "Your partner" : "Mateo"}
                language={live ? remote?.language || "es" : "es"}
                active={live ? remoteSpeaking : true}
                seed={2}
                captions={captions}
                waiting={live && !remote}
                text={
                  live
                    ? source?.text ||
                      "Share your invitation to get the conversation going."
                    : "“Estoy de acuerdo con el coste. No con el plazo.”"
                }
              />
            </aside>
            <TranslationStage
              text={
                live
                  ? incoming?.text || "Waiting for a translation."
                  : "I agree about the cost."
              }
              emphasis={live ? undefined : "Not the deadline."}
              original={
                live
                  ? stageSource?.text || ""
                  : "Estoy de acuerdo con el coste. No con el plazo."
              }
              language={
                live ? stageSource?.language || remote?.language || "es" : "es"
              }
              overlap={live ? room.speaking && remoteSpeaking : !demo.muted}
              captions={captions}
              demo={!live}
              empty={live && !incoming}
              error={live ? room.error : undefined}
              notice={live ? room.audioNotice : demo.notice}
            />
          </div>
          {live ? (
            <div className="live-tools">
              <div className="invite-tools">
                <span className="mono">
                  {remote
                    ? "CONNECTED · " + room.participants.length + "/2"
                    : "WAITING FOR YOUR PARTNER"}
                </span>
                <button onClick={copyInvite}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? "Copied" : "Copy invite"}
                </button>
                {room.join ? (
                  <input
                    aria-label="Room invitation link"
                    readOnly
                    value={
                      (typeof location !== "undefined" ? location.origin : "") +
                      "/?invite=" +
                      room.join.invite
                    }
                  />
                ) : null}
              </div>
              <form
                className="typed-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  room.sendTyped(typed, correct);
                  setTyped("");
                  setCorrect(false);
                }}
              >
                <input
                  aria-label="Type a message or correction"
                  value={typed}
                  maxLength={1000}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Type when words need a second try…"
                  disabled={room.status !== "ready"}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={correct}
                    onChange={(e) => setCorrect(e.target.checked)}
                  />
                  Correct last
                </label>
                <button disabled={!typed.trim() || room.status !== "ready"}>
                  Send
                  <ArrowUpRightIcon />
                </button>
              </form>
              {room.conversation.historyIncomplete ? (
                <p role="status">Some older events could not be recovered.</p>
              ) : null}
            </div>
          ) : null}
          <CallControls
            muted={live ? room.muted : demo.muted}
            captions={captions}
            onMic={live ? room.toggleMic : demo.toggleMic}
            onCaptions={live ? room.toggleCaptions : demo.toggleCaptions}
            onLeave={live ? room.leave : demo.leave}
            onReplay={live ? room.replay : demo.replay}
            onSettings={() => setSettings(true)}
            disabled={live && room.busy}
          />
        </>
      )}
      <footer className="app-footer">
        <span className="footer-mark">
          RELAY <span>—</span>
        </span>
        <p className="mono">
          REAL PEOPLE
          <br />
          REAL DIFFERENCES
          <br />
          BETTER CONVERSATIONS
        </p>
        <p className="mono footer-manifesto">
          LANGUAGE SHOULDN’T BE A BARRIER
          <br />
          TO A GOOD ARGUMENT.
        </p>
      </footer>
      {setup ? (
        <RoomSetup
          providerDescription={providerDescription}
          invite={invite}
          onClose={() => setSetup(false)}
          onSubmit={create}
          busy={room.busy}
          error={room.error}
        />
      ) : null}
      {settings ? (
        <Settings onClose={() => setSettings(false)}>
          <p className="mono">YOUR CONVERSATION</p>
          <h2>
            Make room
            <br />
            for every word.
          </h2>
          {live ? (
            <>
              <button
                className="setting-row"
                onClick={room.toggleInterpretation}
              >
                Translated speech{" "}
                <strong>{room.interpretation ? "On" : "Off"}</strong>
              </button>
              <button className="setting-row" onClick={room.toggleOriginal}>
                Original audio <strong>{room.original ? "On" : "Off"}</strong>
              </button>
              <button className="setting-row" onClick={room.stopInterpretation}>
                Stop interpretation <span>Now</span>
              </button>
              <p>
                Listening in {languages[self?.listeningLanguage || "en"].label}.
                Use headphones when enabling audio. Captions continue when you
                interrupt.
              </p>
              {room.audioNotice ? (
                <p role="status">{room.audioNotice}</p>
              ) : null}
            </>
          ) : (
            <p>
              You’re exploring a scripted demo. Create a private room to speak,
              translate, and interrupt in real time.
            </p>
          )}
          <button className="submit-button" onClick={start}>
            Create or join a room
            <ArrowUpRightIcon />
          </button>
        </Settings>
      ) : null}
    </main>
  );
}
