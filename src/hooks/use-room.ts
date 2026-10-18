"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  emptyConversation,
  reduceRoomEvent,
  latestSource,
  type ConversationState,
} from "../shared/conversation";
import type {
  Participant,
  ParticipantProfile,
  JoinResult,
  SourceInput,
  RoomEvent,
  RtcSignal,
} from "../shared/protocol";
import { SessionGuard } from "../media/lifecycle";
import { RtcController } from "../media/rtc";
import { RecognitionController } from "../media/recognition";
import { browserPlayback, type PlaybackController } from "../media/playback";
import { VadController } from "../media/vad";
import { socketRequest } from "../media/socket-rpc";
type Status = "idle" | "connecting" | "ready" | "reconnecting" | "ended";
type Resources = {
  join?: JoinResult;
  socket?: WebSocket;
  rtc?: RtcController;
  peerId?: string;
  stream?: MediaStream;
  context?: AudioContext;
  recognition?: RecognitionController;
  vad?: VadController;
  playback?: PlaybackController;
  audio?: HTMLAudioElement;
  renew?: ReturnType<typeof setInterval>;
  reconnect?: ReturnType<typeof setTimeout>;
  speakEnd?: ReturnType<typeof setTimeout>;
  attempts: number;
  interpretation: boolean;
  muted: boolean;
  original: boolean;
  seq: number;
  analyser?: AnalyserNode;
};
export function useRoom() {
  const [status, setStatus] = useState<Status>("idle");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [join, setJoin] = useState<JoinResult>();
  const [conversation, setConversation] =
    useState<ConversationState>(emptyConversation);
  const [error, setError] = useState("");
  const [audioNotice, setAudioNotice] = useState("");
  const [audioStarted, setAudioStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [interpretation, setInterpretation] = useState(false);
  const [original, setOriginal] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode>();
  const guard = useRef(new SessionGuard());
  const resources = useRef<Resources>({
    attempts: 0,
    interpretation: false,
    muted: true,
    original: false,
    seq: 0,
  });
  const model = useRef(emptyConversation());
  const dispose = useCallback(() => {
    guard.current.end();
    const r = resources.current;
    clearInterval(r.renew);
    clearTimeout(r.reconnect);
    clearTimeout(r.speakEnd);
    r.recognition?.dispose();
    void r.vad?.dispose();
    r.playback?.dispose();
    r.rtc?.dispose();
    r.socket?.close();
    for (const t of r.stream?.getTracks() || []) t.stop();
    void r.context?.close();
    if (r.audio) {
      r.audio.pause();
      r.audio.srcObject = null;
    }
    resources.current = {
      attempts: 0,
      interpretation: false,
      muted: true,
      original: false,
      seq: 0,
    };
  }, []);
  useEffect(() => dispose, [dispose]);
  function send(data: unknown) {
    const s = resources.current.socket;
    if (s?.readyState === WebSocket.OPEN) s.send(JSON.stringify(data));
  }
  async function api(path: string, body: unknown, token?: string) {
    if (location.protocol === "https:" || process.env.NEXT_PUBLIC_ROOM_WS_URL) {
      const r = resources.current;
      if (!r.socket || r.socket.readyState >= WebSocket.CLOSING)
        r.socket = new WebSocket(roomSocketUrl());
      return (await socketRequest(
        r.socket,
        path,
        body,
        token,
      )) as JoinResult & { status?: string };
    }
    const response = await fetch("/api/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Request failed");
    return data;
  }
  function roomSocketUrl() {
    return (
      process.env.NEXT_PUBLIC_ROOM_WS_URL ||
      (location.protocol === "https:"
        ? "wss://" + location.host + "/api/relay"
        : "ws://" + location.hostname + ":8787")
    );
  }
  const messages: Record<string, string> = {
    unavailable:
      "Translation unavailable. Check the server key and free provider policy.",
    rate_limited:
      "Translation quota reached. Wait before sending another phrase.",
    queue_full: "Translation is behind. Try a shorter phrase in a moment.",
    timeout:
      "Translation took too long. Captions continue; you can send it again.",
    provider_error: "The translation provider is unavailable.",
    invalid_output:
      "The provider returned an invalid translation. It was not spoken.",
  };
  function showError(e: unknown) {
    const text = e instanceof Error ? e.message : String(e);
    setError(messages[text] || text);
  }
  function receiveEvent(event: RoomEvent, live: boolean, epoch: number) {
    if (!guard.current.current(epoch)) return;
    const next = reduceRoomEvent(model.current, event);
    if (next === model.current) return;
    if (event.type === "source")
      resources.current.playback?.invalidate(
        event.participantId,
        event.segmentId,
        event.revision,
      );
    model.current = next;
    resources.current.seq = next.latestSeq;
    setConversation(next);
    if (
      live &&
      event.type === "translation" &&
      event.recipientId === resources.current.join?.participant.id &&
      next.translations.some((t) => t.id === event.id) &&
      "speechSynthesis" in window
    ) {
      resources.current.playback ??= browserPlayback(
        (id, playbackEpoch, status) => {
          if (guard.current.current(epoch))
            send({
              type: "playback",
              translationId: id,
              epoch: playbackEpoch,
              status,
            });
        },
      );
      resources.current.playback.enqueue(
        event,
        resources.current.interpretation,
      );
      if (resources.current.playback?.unavailable)
        setAudioNotice(
          "No matching voice on this device. Translated captions remain available.",
        );
    }
  }
  function syncRtc(list: Participant[], epoch: number) {
    const r = resources.current;
    const self = r.join?.participant.id;
    const other = list.find((p) => p.id !== self && p.connected);
    if (!other) {
      r.rtc?.dispose();
      r.rtc = undefined;
      r.peerId = undefined;
      return;
    }
    if (r.peerId === other.id && r.rtc) return;
    r.rtc?.dispose();
    r.peerId = other.id;
    try {
      const ice = JSON.parse(
        process.env.NEXT_PUBLIC_ICE_SERVERS || "[]",
      ) as RTCIceServer[];
      r.audio ??= new Audio();
      r.audio.muted = !r.original;
      r.rtc = new RtcController(
        (s) => {
          if (guard.current.current(epoch)) send({ type: "signal", signal: s });
        },
        r.audio,
        self! > other.id,
        ice,
        (m) => {
          if (guard.current.current(epoch)) setAudioNotice(m);
        },
      );
      if (r.stream) void r.rtc.start(r.stream).catch(showError);
    } catch {
      setAudioNotice(
        "Audio connection unavailable. Typed conversation still works.",
      );
    }
  }
  function connect(epoch: number) {
    const r = resources.current;
    const j = r.join;
    if (!j || !guard.current.current(epoch)) return;
    const socket =
      r.socket && r.socket.readyState <= WebSocket.OPEN
        ? r.socket
        : new WebSocket(roomSocketUrl());
    r.socket = socket;
    socket.onopen = () => {
      if (!guard.current.current(epoch)) {
        socket.close();
        return;
      }
      socket.send(
        JSON.stringify({ type: "auth", token: r.join!.token, afterSeq: r.seq }),
      );
    };
    socket.onmessage = async (e) => {
      if (!guard.current.current(epoch) || r.socket !== socket) return;
      try {
        const message = JSON.parse(e.data);
        if (message.type === "welcome") {
          r.attempts = 0;
          setStatus("ready");
          setParticipants(message.participants);
          for (const event of message.history.events)
            receiveEvent(event, false, epoch);
          model.current = {
            ...model.current,
            latestSeq: message.history.latestSeq,
            historyIncomplete:
              message.history.historyIncomplete ||
              model.current.historyIncomplete,
          };
          r.seq = message.history.latestSeq;
          setConversation(model.current);
          syncRtc(message.participants, epoch);
        }
        if (message.type === "members") {
          setParticipants(message.participants);
          syncRtc(message.participants, epoch);
        }
        if (message.type === "event") receiveEvent(message.event, true, epoch);
        if (message.type === "cursor") {
          r.seq = Math.max(r.seq, message.seq);
          model.current = { ...model.current, latestSeq: r.seq };
        }
        if (message.type === "signal")
          await r.rtc?.handleSignal(message.signal as RtcSignal);
        if (message.type === "error")
          setError(messages[message.error] || message.error);
      } catch {
        if (guard.current.current(epoch))
          setError("A room update could not be read.");
      }
    };
    socket.onerror = () => {
      if (guard.current.current(epoch))
        setError(
          "Room connection unavailable. Check the room service address.",
        );
    };
    socket.onclose = () => {
      if (!guard.current.current(epoch) || r.socket !== socket) return;
      r.rtc?.dispose();
      r.rtc = undefined;
      r.peerId = undefined;
      setStatus("reconnecting");
      if (r.attempts++ >= 5) {
        setError("Could not reconnect. Rejoin the room to continue.");
        return;
      }
      r.reconnect = setTimeout(
        () => connect(epoch),
        Math.min(1000 * 2 ** r.attempts, 10000),
      );
    };
    if (socket.readyState === WebSocket.OPEN) socket.onopen(new Event("open"));
  }
  async function openRoom(profile: ParticipantProfile, invite?: string) {
    dispose();
    const epoch = guard.current.begin();
    setBusy(true);
    setError("");
    setStatus("connecting");
    setAudioStarted(false);
    setMuted(true);
    setInterpretation(false);
    setOriginal(false);
    setSpeaking(false);
    setDraft("");
    setAudioNotice("");
    model.current = emptyConversation();
    setConversation(model.current);
    setParticipants([]);
    setJoin(undefined);
    try {
      let resumeToken: string | undefined;
      if (invite) {
        try {
          resumeToken =
            sessionStorage.getItem("relay-resume:" + invite) || undefined;
        } catch {}
      }
      const result: JoinResult = await api(invite ? "rooms/join" : "rooms", {
        ...profile,
        ...(invite ? { invite, resumeToken } : {}),
      });
      if (!guard.current.current(epoch)) return;
      resources.current.join = result;
      setJoin(result);
      setParticipants(result.participants);
      try {
        sessionStorage.setItem(
          "relay-resume:" + result.invite,
          result.resumeToken,
        );
      } catch {}
      connect(epoch);
      resources.current.renew = setInterval(async () => {
        try {
          const current = resources.current.join;
          if (!current) return;
          const renewed: JoinResult = await api(
            "rooms/renew",
            {},
            current.token,
          );
          if (!guard.current.current(epoch)) return;
          resources.current.join = renewed;
          send({
            type: "auth",
            token: renewed.token,
            afterSeq: resources.current.seq,
          });
        } catch {
          if (guard.current.current(epoch))
            setError(
              "Room credential renewal failed. Rejoin if the connection expires.",
            );
        }
      }, 600000);
      return true;
    } catch (e) {
      if (guard.current.current(epoch)) {
        showError(e);
        setStatus("idle");
        if (invite && e instanceof Error && e.message === "Reconnect expired") {
          try {
            sessionStorage.removeItem("relay-resume:" + invite);
          } catch {}
        }
      }
      return false;
    } finally {
      if (guard.current.current(epoch)) setBusy(false);
    }
  }
  async function source(input: SourceInput, epoch: number) {
    if (!guard.current.current(epoch)) return;
    setDraft(input.text);
    if (!input.committed) {
      send({ type: "source", ...input });
      return;
    }
    try {
      const j = resources.current.join;
      if (!j) return;
      const result = await api("translate", input, j.token);
      if (guard.current.current(epoch)) {
        setError(
          result.status === "needs_context"
            ? "Waiting for more context before translating."
            : "",
        );
      }
    } catch (e) {
      if (guard.current.current(epoch)) showError(e);
    }
  }
  async function startAudio() {
    const r = resources.current;
    if (!r.join || busy) return;
    const mediaEpoch = guard.current.currentValue();
    setBusy(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Microphone capture requires a secure supported browser.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (!guard.current.current(mediaEpoch)) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      r.stream = stream;
      r.muted = false;
      setMuted(false);
      setAudioStarted(true);
      r.context = new AudioContext();
      await r.context.resume();
      if (!guard.current.current(mediaEpoch)) return;
      r.analyser = r.context.createAnalyser();
      r.analyser.fftSize = 256;
      r.context.createMediaStreamSource(stream).connect(r.analyser);
      setAnalyser(r.analyser);
      if (r.rtc) await r.rtc.start(stream);
      if (!guard.current.current(mediaEpoch)) return;
      const onset = () => {
        if (!guard.current.current(mediaEpoch) || r.muted) return;
        clearTimeout(r.speakEnd);
        setSpeaking(true);
        r.playback?.interrupt();
      };
      const end = () => {
        if (!guard.current.current(mediaEpoch)) return;
        r.speakEnd = setTimeout(() => {
          if (guard.current.current(mediaEpoch)) {
            setSpeaking(false);
            r.playback?.resume();
          }
        }, 250);
      };
      r.recognition = new RecognitionController(
        (s) => void source(s, mediaEpoch),
        (message) => {
          if (guard.current.current(mediaEpoch)) setAudioNotice(message);
        },
        onset,
        end,
      );
      r.recognition.start(r.join!.participant.language);
      r.vad = new VadController();
      void r.vad.start(stream, onset, end).catch(() => {
        if (guard.current.current(mediaEpoch))
          setAudioNotice(
            "Local speech detection unavailable. Use Stop interpretation to interrupt manually.",
          );
      });
    } catch (e) {
      if (guard.current.current(mediaEpoch)) {
        r.stream?.getTracks().forEach((t) => t.stop());
        void r.context?.close();
        r.stream = undefined;
        r.context = undefined;
        setAudioStarted(false);
        showError(e);
      }
    } finally {
      if (guard.current.current(mediaEpoch)) setBusy(false);
    }
  }
  function toggleMic() {
    const r = resources.current;
    if (!r.stream) {
      void startAudio();
      return;
    }
    r.muted = !r.muted;
    r.rtc?.setMuted(r.muted);
    for (const t of r.stream.getTracks()) t.enabled = !r.muted;
    setMuted(r.muted);
    if (r.muted) {
      r.recognition?.stop();
      setSpeaking(false);
    } else r.recognition?.start(r.join!.participant.language);
  }
  function toggleInterpretation() {
    const r = resources.current;
    if (!("speechSynthesis" in window)) {
      setAudioNotice("Speech synthesis unavailable. Use translated captions.");
      return;
    }
    r.interpretation = !r.interpretation;
    setInterpretation(r.interpretation);
    r.playback ??= browserPlayback((id, epoch, status) =>
      send({ type: "playback", translationId: id, epoch, status }),
    );
    if (!r.interpretation) r.playback.interrupt();
    else {
      r.playback.resume();
      if (
        !speechSynthesis
          .getVoices()
          .some(
            (v) =>
              v.lang.split("-")[0] === r.join?.participant.listeningLanguage,
          )
      )
        setAudioNotice(
          "No matching voice installed yet. Captions remain available.",
        );
    }
  }
  function toggleOriginal() {
    const r = resources.current;
    r.original = !r.original;
    setOriginal(r.original);
    if (r.audio) {
      r.audio.muted = !r.original;
      if (r.original)
        void r.audio
          .play()
          .catch(() => setAudioNotice("Original audio is not connected yet."));
    }
  }
  function leave() {
    send({ type: "leave" });
    const invite = resources.current.join?.invite;
    if (invite)
      try {
        sessionStorage.removeItem("relay-resume:" + invite);
      } catch {}
    dispose();
    setStatus("ended");
    setAudioStarted(false);
    setAnalyser(undefined);
    setSpeaking(false);
    setBusy(false);
  }
  function sendTyped(text: string, correct = false) {
    if (!text.trim()) return;
    const last = latestSource(
      model.current,
      resources.current.join?.participant.id,
      true,
    );
    void source(
      {
        segmentId: correct && last ? last.segmentId : crypto.randomUUID(),
        revision: correct && last ? last.revision + 1 : 1,
        text: text.trim(),
        committed: true,
      },
      guard.current.currentValue(),
    );
  }
  return {
    status,
    participants,
    join,
    conversation,
    error,
    audioNotice,
    audioStarted,
    muted,
    captions,
    interpretation,
    original,
    speaking,
    draft,
    busy,
    openRoom,
    startAudio,
    toggleMic,
    toggleCaptions: () => setCaptions((v) => !v),
    toggleInterpretation,
    toggleOriginal,
    leave,
    sendTyped,
    replay: () => {
      if (!resources.current.playback?.replay())
        setAudioNotice("No playable translation in the last 30 seconds.");
    },
    stopInterpretation: () => resources.current.playback?.interrupt(),
    analyser,
  };
}
