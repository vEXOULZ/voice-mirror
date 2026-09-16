// A tap on the microphone, on the audio thread.
//
// The vault version this was ported from had to use a ScriptProcessorNode,
// deprecated for years, because an AudioWorklet needs a real module URL and
// the host's content policy refused to load one. A static page has no such
// problem, so the tap runs where it belongs and the main thread is left alone.
//
// It accumulates to a block before posting rather than posting every render
// quantum: 128 samples at a time is about 375 messages a second for nothing.
class TapProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options && options.processorOptions;
    this.size = (opts && opts.size) || 4096;
    this.buf = new Float32Array(this.size);
    this.at = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.at++] = ch[i];
      if (this.at === this.size) {
        // A copy: this buffer goes on filling while the main thread reads.
        this.port.postMessage(this.buf.slice());
        this.at = 0;
      }
    }
    return true;
  }
}

registerProcessor("tap", TapProcessor);
