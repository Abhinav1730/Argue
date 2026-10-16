"use client";
import { useEffect, useRef, useState } from "react";
import { XIcon, LockSimpleIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import {
  languages,
  type Language,
  type ParticipantProfile,
} from "../shared/protocol";
import { recognitionConstructor } from "../media/recognition";
export function RoomSetup({
  onClose,
  onSubmit,
  invite = "",
  busy,
  error,
  providerDescription,
}: {
  onClose: () => void;
  onSubmit: (profile: ParticipantProfile, invite?: string) => void;
  invite?: string;
  busy: boolean;
  error: string;
  providerDescription: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState<Language>("en");
  const [target, setTarget] = useState<Language>("es");
  const [link, setLink] = useState(invite);
  const [consent, setConsent] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  function testVoice() {
    const voice = window.speechSynthesis
      ?.getVoices()
      .find((v) => v.lang.split("-")[0] === target);
    if (!voice) {
      setTestMessage(
        "No matching voice installed. Translated captions will still work.",
      );
      return;
    }
    const u = new SpeechSynthesisUtterance(
      {
        en: "Ready when you are.",
        hi: "जब आप तैयार हों।",
        es: "Cuando quieras.",
      }[target],
    );
    u.voice = voice;
    u.lang = voice.lang;
    speechSynthesis.speak(u);
    setTestMessage(
      recognitionConstructor()
        ? "Voice ready. Browser recognition is checked when you start your mic."
        : "Voice ready. Recognition unavailable in this browser; you can type.",
    );
  }
  function parseInvite() {
    if (!link.trim()) return undefined;
    try {
      return new URL(link).searchParams.get("invite") || link.trim();
    } catch {
      return link.trim();
    }
  }
  return (
    <dialog
      ref={ref}
      className="setup-dialog"
      onCancel={onClose}
      aria-label="Private room setup"
    >
      <button
        className="close-button"
        onClick={onClose}
        aria-label="Close room setup"
      >
        <XIcon size={24} />
      </button>
      <p className="eyebrow mono">
        <LockSimpleIcon size={16} /> TWO PEOPLE. ONE CONVERSATION.
      </p>
      <h2>Let’s talk.</h2>
      <p className="setup-description">
        Different languages shouldn’t get the last word.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(
            { name, language: source, listeningLanguage: target },
            parseInvite(),
          );
        }}
      >
        <label>
          Your name
          <input
            autoComplete="given-name"
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should we call you?"
          />
        </label>
        <div className="form-pair">
          <label>
            I speak
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as Language)}
            >
              {Object.entries(languages).map(([id, l]) => (
                <option key={id} value={id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Translate into
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as Language)}
            >
              {Object.entries(languages).map(([id, l]) => (
                <option key={id} value={id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Joining someone? <span className="optional">Optional</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste an invitation link"
          />
        </label>
        <button type="button" className="text-action" onClick={testVoice}>
          Test my listening voice <ArrowUpRightIcon />
        </button>
        {testMessage ? (
          <p className="form-note" role="status">
            {testMessage}
          </p>
        ) : null}
        <div className="processing-note">
          <strong>Private room. Clear boundaries.</strong>
          <p>
            Original audio goes to your partner over WebRTC. Your browser’s
            speech recognition may use a cloud service. Text goes to OpenRouter
            and the configured provider. No audio recording. Room text is kept
            briefly in server memory.
          </p>
          <p>{providerDescription}</p>
          <p>
            Use headphones. Voice support varies by browser and language. Typing
            and captions are available.
          </p>
        </div>
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          <span>I understand how audio and text are processed.</span>
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="submit-button" disabled={!consent || busy}>
          {busy
            ? "Connecting…"
            : link
              ? "Join private room"
              : "Create private room"}
          <ArrowUpRightIcon size={21} />
        </button>
      </form>
    </dialog>
  );
}
