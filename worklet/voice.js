// The test voice, on the audio thread.
//
// A click or a drag on the vowel plane sends where the pointer is, and this
// turns it into sound as it moves. The synthesis itself is js/synth.js, the
// same code the tests render vowels with, so what is heard live is what was
// measured.
//
// Its own import below carries no version: a document's import map does not
// reach into a worklet. The query on this file's URL is what keeps it fresh,
// and synth.js has the one entry point this uses, which is kept stable.
import { createVoice } from "../js/synth.js";

class VoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voice = createVoice(sampleRate);
    this.port.onmessage = e => this.voice.set(e.data);
  }

  process(inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (out) this.voice.process(out);
    // Silent is still rendered, so the gain stays settled for the next sound.
    return true;
  }
}

registerProcessor("voice", VoiceProcessor);
