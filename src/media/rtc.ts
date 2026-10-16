import type { RtcSignal } from "../shared/protocol";
export class RtcController {
  private peer: RTCPeerConnection;
  private makingOffer = false;
  private ignoreOffer = false;
  private pending: RTCIceCandidateInit[] = [];
  private stream?: MediaStream;
  constructor(
    private signal: (s: RtcSignal) => void,
    private audio: HTMLAudioElement,
    private polite: boolean,
    iceServers: RTCIceServer[],
    onStatus: (status: string) => void,
  ) {
    this.peer = new RTCPeerConnection({ iceServers });
    this.peer.onicecandidate = (e) => {
      if (e.candidate) this.signal({ candidate: e.candidate.toJSON() });
    };
    this.peer.ontrack = (e) => {
      this.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      void this.audio
        .play()
        .catch(() => onStatus("Tap Original audio to enable playback."));
    };
    this.peer.onconnectionstatechange = () =>
      onStatus(
        this.peer.connectionState === "connected"
          ? "Audio connected"
          : this.peer.connectionState === "failed"
            ? "Audio connection failed. A TURN server may be required."
            : this.peer.connectionState === "disconnected"
              ? "Audio disconnected"
              : "",
      );
    this.peer.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.peer.setLocalDescription();
        this.signal({ description: this.peer.localDescription!.toJSON() });
      } catch {
        onStatus("Audio negotiation failed");
      } finally {
        this.makingOffer = false;
      }
    };
  }
  async start(stream: MediaStream) {
    this.stream = stream;
    for (const track of stream.getAudioTracks())
      this.peer.addTrack(track, stream);
  }
  async handleSignal(s: RtcSignal) {
    if (s.description) {
      const collision =
        s.description.type === "offer" &&
        (this.makingOffer || this.peer.signalingState !== "stable");
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) return;
      await this.peer.setRemoteDescription(s.description);
      for (const c of this.pending) await this.peer.addIceCandidate(c);
      this.pending = [];
      if (s.description.type === "offer") {
        await this.peer.setLocalDescription();
        this.signal({ description: this.peer.localDescription!.toJSON() });
      }
    } else if (s.candidate) {
      if (!this.peer.remoteDescription) {
        this.pending.push(s.candidate);
        return;
      }
      try {
        await this.peer.addIceCandidate(s.candidate);
      } catch (e) {
        if (!this.ignoreOffer) throw e;
      }
    }
  }
  setMuted(muted: boolean) {
    for (const track of this.stream?.getAudioTracks() || [])
      track.enabled = !muted;
  }
  dispose() {
    this.peer.onnegotiationneeded = null;
    this.peer.ontrack = null;
    this.peer.onicecandidate = null;
    this.peer.close();
    this.audio.pause();
    this.audio.srcObject = null;
  }
}
