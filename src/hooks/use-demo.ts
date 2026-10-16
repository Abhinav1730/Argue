"use client";
import { useState, useEffect, useRef } from "react";
export function useDemo() {
  const [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [ended, setEnded] = useState(false);
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = (text: string) => {
    setNotice(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(""), 3000);
  };
  return {
    muted,
    captions,
    ended,
    notice,
    toggleMic: () => setMuted((v) => !v),
    toggleCaptions: () => setCaptions((v) => !v),
    leave: () => setEnded(true),
    reset: () => {
      setEnded(false);
      setMuted(false);
      setCaptions(true);
    },
    replay: () => flash("Replaying the last translation · Demo"),
    flash,
  };
}
