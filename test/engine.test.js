// Checks over the engine's own bookkeeping: which recording a block of PCM
// belongs to, and which source is playing. Run with: node --test
//
// The browser is stood in for by the least that will do: an audio context
// whose nodes connect to nothing, a tap whose blocks are handed in by the test,
// and a recorder that, like a real one, finishes closing a moment after it is
// told to stop. That moment is where both of the bugs these guard lived.
// Kept in a file of its own so the fakes never reach the DSP tests.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const node = () => ({ connect() {}, disconnect() {} });
let sources, taps, recorders;

class FakeContext {
  constructor() {
    this.sampleRate = 48000;
    this.state = "running";
    this.destination = {};
    this.audioWorklet = { addModule: async () => {} };
  }
  createAnalyser() { return { ...node(), fftSize: 0, frequencyBinCount: 2048 }; }
  createMediaStreamSource() { return node(); }
  createGain() { return { ...node(), gain: { value: 1 } }; }
  createBufferSource() {
    const s = { ...node(), started: false, stopped: false,
                start() { this.started = true; }, stop() { this.stopped = true; } };
    sources.push(s);
    return s;
  }
  createBuffer(channels, n, rate) { return { duration: n / rate, copyToChannel() {} }; }
  async decodeAudioData() { return { duration: 1 }; }
  close() {}
}

class FakeTap {
  constructor() { this.port = { postMessage() {} }; taps.push(this); }
  connect() {}
  disconnect() {}
}

class FakeRecorder {
  static isTypeSupported() { return true; }
  constructor() { this.state = "inactive"; this.n = recorders.push(this); }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    setTimeout(() => {
      if (this.ondataavailable) this.ondataavailable({ data: new Blob(["take " + this.n], { type: "audio/webm" }) });
      if (this.onstop) this.onstop();
    }, 5);
  }
}

globalThis.window = globalThis;
globalThis.AudioContext = FakeContext;
globalThis.AudioWorkletNode = FakeTap;
globalThis.MediaRecorder = FakeRecorder;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } }
});

const { createEngine } = await import("../js/audio.js");
const { TAP } = await import("../js/constants.js");

beforeEach(() => { sources = []; taps = []; recorders = []; });

const listening = async () => {
  const engine = createEngine();
  await engine.startMic();
  assert.equal(taps.length, 1, "the tap opened");
  return engine;
};

// One block from the tap, every sample the same value.
const feed = (value) => taps[0].port.onmessage({ data: new Float32Array(TAP).fill(value) });

const samplesOf = async blob => {
  const buf = await blob.arrayBuffer();
  return new Int16Array(buf.slice(44));
};

test("a recording still closing keeps its own take when a new one has started", async () => {
  // Stop, then Record again before the first recorder has finished closing.
  // The capture used to live on the engine, so the new recording reset it and
  // the first take was built from the second one's empty arrays.
  const engine = await listening();
  engine.startRecording();
  feed(0.25); feed(0.25);
  const first = engine.stopRecording();
  engine.startRecording();
  feed(-0.5);

  const take1 = await first;
  assert.ok(take1.compressed, "the first take lost its compressed copy");
  assert.equal(await take1.compressed.text(), "take 1");
  const pcm1 = await samplesOf(take1.wav);
  assert.equal(pcm1.length, 2 * TAP, "the first take's WAV holds its own two blocks");
  assert.ok(pcm1.every(v => v === Math.trunc(0.25 * 0x7fff)), "a later block reached the first take");

  const take2 = await engine.stopRecording();
  assert.equal(await take2.compressed.text(), "take 2");
  const pcm2 = await samplesOf(take2.wav);
  assert.equal(pcm2.length, TAP);
  assert.ok(pcm2.every(v => v === -0x4000));
});

test("the WAV ends where Stop was pressed", async () => {
  const engine = await listening();
  engine.startRecording();
  feed(0.25);
  const done = engine.stopRecording();
  assert.equal(engine.rec, null, "the engine still reports a recording after Stop");
  feed(0.25);   // arrives while the recorder is closing
  const take = await done;
  assert.equal((await samplesOf(take.wav)).length, TAP);
});

test("a take finished before the microphone stops is kept", async () => {
  // What Stop does now while recording: finish the take, then close the
  // microphone. Closing the microphone first threw the take away.
  const engine = await listening();
  engine.startRecording();
  feed(0.1);
  const take = await engine.stopRecording();
  engine.stopMic();
  assert.equal(engine.take, take);
  assert.equal((await samplesOf(take.wav)).length, TAP);
});

test("starting a source stops the one already playing", async () => {
  // Overwriting the playing source left it sounding with nothing holding it,
  // so no Stop could reach it.
  const engine = await listening();
  await engine.playSamples(new Float32Array(480), () => {});
  await engine.playSamples(new Float32Array(480), () => {});
  assert.equal(sources.length, 2);
  assert.ok(sources[0].stopped, "the first source is still playing");
  assert.ok(sources[1].started && !sources[1].stopped);
  engine.stopPlayback();
  assert.ok(sources[1].stopped);
  assert.equal(engine.playing(), false);
});
