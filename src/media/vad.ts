import type { MicVAD } from "@ricky0123/vad-web";
export class VadController {
  private vad?: MicVAD;
  private disposed = false;
  async start(
    stream: MediaStream,
    onSpeechStart: () => void,
    onSpeechEnd: () => void,
  ) {
    const { MicVAD } = await import("@ricky0123/vad-web");
    if (this.disposed) return;
    const vad = await MicVAD.new({
      model: "v5",
      baseAssetPath: "/vad/",
      onnxWASMBasePath: "/vad/",
      getStream: async () => stream,
      pauseStream: async () => {},
      resumeStream: async () => stream,
      startOnLoad: false,
      onSpeechStart,
      onSpeechEnd: () => onSpeechEnd(),
      onVADMisfire: onSpeechEnd,
      ortConfig: (ort) => {
        ort.env.wasm.numThreads = 1;
      },
    });
    if (this.disposed) {
      await vad.destroy();
      return;
    }
    this.vad = vad;
    await vad.start();
  }
  async dispose() {
    this.disposed = true;
    await this.vad?.destroy();
  }
}
