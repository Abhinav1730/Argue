// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useRoom } from "../src/hooks/use-room";
it("does not start media controllers when audio resume finishes after leave",async()=>{const {result}=setup();let resume!:()=>void;let stopped=0;let closed=0;vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({getTracks:()=>[{stop:()=>stopped++}]} as unknown as MediaStream);vi.stubGlobal("AudioContext",class {resume(){return new Promise<void>(r=>resume=r)}createAnalyser(){return {fftSize:0}}createMediaStreamSource(){return {connect(){}}}async close(){closed++}});await act(async()=>{await result.current.openRoom({name:"Asha",language:"hi",listeningLanguage:"en"})});let task!:Promise<void>;await act(async()=>{task=result.current.startAudio();await Promise.resolve()});act(()=>result.current.leave());await act(async()=>{resume();await task});expect(result.current.analyser).toBeUndefined();expect(stopped).toBe(1);expect(closed).toBe(1);expect(result.current.status).toBe("ended")});
vi.mock("../src/media/vad", () => ({
  VadController: class {
    async start() {}
    async dispose() {}
  },
}));
class Socket {
  static OPEN = 1;
  readyState = 1;
  onopen: unknown;
  onmessage: unknown;
  onerror: unknown;
  onclose: unknown;
  send() {}
  close() {
    this.readyState = 3;
  }
}
const join = {
  roomId: "room",
  invite: "invite",
  participant: {
    id: "a",
    name: "Asha",
    language: "hi",
    listeningLanguage: "en",
    connected: false,
  },
  participants: [],
  token: "token",
  resumeToken: "resume",
  expiresAt: Date.now() + 900000,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function setup() {
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", async () => Response.json(join));
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
  return renderHook(() => useRoom());
}
it("never requests a microphone just by entering a room", async () => {
  const { result } = setup();
  await act(async () => {
    await result.current.openRoom({
      name: "Asha",
      language: "hi",
      listeningLanguage: "en",
    });
  });
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  expect(result.current.join?.roomId).toBe("room");
});
it("stops a stream that arrives after leaving", async () => {
  const { result } = setup();
  let resolve!: (s: MediaStream) => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await act(async () => {
    await result.current.openRoom({
      name: "Asha",
      language: "hi",
      listeningLanguage: "en",
    });
  });
  let task!: Promise<void>;
  act(() => {
    task = result.current.startAudio();
  });
  act(() => result.current.leave());
  let stopped = 0;
  await act(async () => {
    resolve({
      getTracks: () => [{ stop: () => stopped++ }],
    } as unknown as MediaStream);
    await task;
  });
  expect(stopped).toBe(1);
  expect(result.current.status).toBe("ended");
  expect(result.current.audioStarted).toBe(false);
});
it("cannot restore a room from a late create response", async () => {
  const { result } = setup();
  let resolve!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  let task!: Promise<unknown>;
  act(() => {
    task = result.current.openRoom({
      name: "Asha",
      language: "hi",
      listeningLanguage: "en",
    });
  });
  act(() => result.current.leave());
  await act(async () => {
    resolve(Response.json(join));
    await task;
  });
  expect(result.current.join).toBeUndefined();
  expect(result.current.status).toBe("ended");
});
