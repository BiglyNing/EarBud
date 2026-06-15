// PCM capture worklet for EarBud one-mic diarization.
//
// AssemblyAI streaming wants raw PCM audio, so this worklet taps
// the microphone and forwards mono Float32 frames to the main thread, which
// downsamples them to 16 kHz PCM16 and sends them over the diarization socket.
//
// AudioWorklet runs in 128-sample render quanta. Posting each quantum would be
// far too chatty, so frames are accumulated into ~4096-sample blocks first.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blockSize = 4096;
    this.buffer = new Float32Array(this.blockSize);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += 1) {
      this.buffer[this.offset++] = channel[i];
      if (this.offset === this.blockSize) {
        // Transfer a copy so the main thread owns the memory.
        const frame = this.buffer.slice(0, this.blockSize);
        this.port.postMessage(frame, [frame.buffer]);
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
