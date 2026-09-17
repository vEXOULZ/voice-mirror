// The microphone, the analyser, the rewind ring, the recorder and the
// downloads. Everything that touches hardware or a file is here, so the frame
// loop above it only ever asks for numbers.

import { t } from "./i18n.js";
import { FFT, WORK_RATE, REWIND_S, TAP, PCM_CAP_S } from "./constants.js";
import { makeTaps } from "./dsp.js";
import { encodeWav, encodeWavChunks, floatToInt16 } from "./wav.js";
import { VERSION } from "./version.js";
import { saveBlob } from "./save.js";

export const createEngine = () => {
  const st = {
    ctx: null, analyser: null, stream: null, mic: null, play: null,
    tap: null, sink: null, kind: null,
    ring: null, ringAt: 0, ringFull: false,
    rec: null, recAt: 0, capture: null,
    take: null, clip: null,
    voice: null, voiceOn: false, voiceFailed: false, voiceGen: 0,
    buf: null, work: null, taps: null, freq: null, dec: 1
  };

  const rate = () => (st.ctx ? st.ctx.sampleRate : 48000);

  // The analyser is the one hub. The microphone feeds it, and so does a take
  // being played back, so what you see on playback is the identical analysis
  // rather than a second implementation of it.
  st.ensureContext = async () => {
    if (st.ctx) return;
    st.ctx = new (window.AudioContext || window.webkitAudioContext)();
    // iOS hands back a suspended context even from inside a tap handler.
    if (st.ctx.state === "suspended") { try { await st.ctx.resume(); } catch (e) {} }
    st.analyser = st.ctx.createAnalyser();
    st.analyser.fftSize = FFT;
    st.analyser.smoothingTimeConstant = 0;
    st.dec = Math.max(1, Math.round(st.ctx.sampleRate / WORK_RATE));
    st.taps = makeTaps(st.ctx.sampleRate);
    st.buf = new Float32Array(st.analyser.fftSize);
    st.work = new Float32Array(Math.floor(st.buf.length / st.dec));
    st.freq = new Float32Array(st.analyser.frequencyBinCount);
  };

  st.workRate = () => rate() / st.dec;

  // --- the tap, the ring and the capture ---------------------------------
  const onBlock = block => {
    const ring = st.ring;
    if (ring) {
      const n = ring.length;
      let at = st.ringAt;
      for (let i = 0; i < block.length; i++) {
        ring[at++] = block[i];
        if (at === n) { at = 0; st.ringFull = true; }
      }
      st.ringAt = at;
    }
    // The PCM that makes a lossless WAV of a recording. Capped, so a take left
    // running cannot eat the tab; past the cap the compressed recorder goes on
    // alone and the WAV is what was captured up to then.
    const cap = st.capture;
    if (cap && !cap.capped) {
      if (cap.pcmN >= PCM_CAP_S * rate()) cap.capped = true;
      else { cap.pcm.push(floatToInt16(block)); cap.pcmN += block.length; }
    }
  };

  const openTap = async () => {
    if (st.tap) { st.ringAt = 0; st.ringFull = false; return; }
    st.ring = new Float32Array(Math.ceil(REWIND_S * rate()));
    st.ringAt = 0; st.ringFull = false;

    if (st.ctx.audioWorklet) {
      try {
        await st.ctx.audioWorklet.addModule("worklet/tap.js?v=" + VERSION);
        st.tap = new AudioWorkletNode(st.ctx, "tap", { processorOptions: { size: TAP } });
        st.tap.port.onmessage = e => onBlock(e.data);
        st.kind = "worklet";
      } catch (e) { st.tap = null; }
    }
    // Deprecated, and the only fallback that needs no module URL at all.
    if (!st.tap && st.ctx.createScriptProcessor) {
      st.tap = st.ctx.createScriptProcessor(TAP, 1, 1);
      st.tap.onaudioprocess = e => onBlock(e.inputBuffer.getChannelData(0));
      st.kind = "scriptprocessor";
    }
    if (!st.tap) { st.ring = null; st.kind = null; return; }

    // A tap is pulled by nothing unless it reaches a destination, and the
    // microphone must never reach the speakers. Zero gain does both.
    st.sink = st.ctx.createGain();
    st.sink.gain.value = 0;
    st.tap.connect(st.sink);
    st.sink.connect(st.ctx.destination);
  };

  // --- microphone ---------------------------------------------------------
  st.startMic = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(t("err.noMic"));
    }
    st.stream = await navigator.mediaDevices.getUserMedia({
      // All three are built to make speech survive a phone line, and all three
      // distort exactly what is being looked at here. Off, always.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    await st.ensureContext();
    st.stopPlayback();
    st.voiceHalt();
    st.mic = st.ctx.createMediaStreamSource(st.stream);
    st.mic.connect(st.analyser);
    // The rewind buffer starts empty and starts filling here. It runs whatever
    // the Record button is doing.
    await openTap();
    if (st.tap) st.mic.connect(st.tap);
  };

  st.stopMic = () => {
    if (st.stream) st.stream.getTracks().forEach(t => t.stop());
    try { if (st.mic) st.mic.disconnect(); } catch (e) {}
    st.stream = null; st.mic = null;
    if (st.rec) { try { st.rec.stop(); } catch (e) {} st.rec = null; }
    st.capture = null;
  };

  st.listening = () => !!st.stream;

  // --- reading a frame ----------------------------------------------------
  st.timeDomain = () => { st.analyser.getFloatTimeDomainData(st.buf); return st.buf; };
  st.frequency = () => { st.analyser.getFloatFrequencyData(st.freq); return st.freq; };

  // --- recording ----------------------------------------------------------
  st.canRecord = () => !!window.MediaRecorder;

  // Each recording owns its chunks and PCM. They used to live on the engine,
  // so a recorder still closing wrote into, and built its take from, the
  // arrays a newer recording had just reset.
  st.startRecording = () => {
    const cap = { chunks: [], pcm: [], pcmN: 0, capped: false };
    st.capture = st.tap ? cap : null;
    // WebM with Opus on desktop and Android. iOS offers mp4 with AAC and
    // nothing else, so the container is whatever the recorder agrees to.
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus",
                  "audio/mp4;codecs=mp4a.40.2", "audio/mp4"]
      .find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
    st.rec = new MediaRecorder(st.stream, mime ? { mimeType: mime } : undefined);
    st.rec.ondataavailable = e => { if (e.data.size) cap.chunks.push(e.data); };
    st.rec.capture = cap;
    st.rec.start();
    st.recAt = Date.now();
  };

  // Both formats come off one take: the compressed one is what the recorder
  // produced, the WAV is the PCM that was captured beside it. A WebM is lossy,
  // and the perturbation measures the offline tool computes refuse a lossy
  // file, so a take that can only be had compressed is worth less later.
  st.stopRecording = () => new Promise(resolve => {
    if (!st.rec) return resolve(null);
    const rec = st.rec, cap = rec.capture;
    st.rec = null;
    // The PCM ends where the button was pressed, not where the recorder
    // finishes closing.
    if (st.capture === cap) st.capture = null;
    rec.onstop = () => {
      const take = { at: new Date(), rate: rate(), capped: cap.capped };
      if (cap.chunks.length) {
        take.compressed = new Blob(cap.chunks, { type: cap.chunks[0].type || "audio/webm" });
      }
      if (cap.pcmN) take.wav = new Blob([encodeWavChunks(cap.pcm, rate())], { type: "audio/wav" });
      cap.pcm = [];
      // A recorder that produced nothing leaves an earlier take downloadable
      // rather than taking Download away from it.
      if (take.compressed || take.wav) st.take = take;
      resolve(st.take);
    };
    try { rec.stop(); } catch (e) { resolve(st.take); }
  });

  st.recordingFor = () => (st.rec ? Math.floor((Date.now() - st.recAt) / 1000) : null);

  // --- the rewind buffer --------------------------------------------------
  // The ring is unwrapped oldest first, and a buffer not yet full yields only
  // what it holds, so the first seconds after Start give a short take rather
  // than one padded with silence.
  st.keepLast = () => {
    if (!st.ring || (!st.ringFull && !st.ringAt)) return null;
    const n = st.ringFull ? st.ring.length : st.ringAt;
    const out = new Float32Array(n);
    if (st.ringFull) {
      out.set(st.ring.subarray(st.ringAt), 0);
      out.set(st.ring.subarray(0, st.ringAt), n - st.ringAt);
    } else {
      out.set(st.ring.subarray(0, n));
    }
    // WAV only, and deliberately: the compressed recorder was not running, so
    // there is no second version of this take and the greyed-out option says so.
    st.take = {
      at: new Date(), rate: rate(), seconds: n / rate(),
      wav: new Blob([encodeWav(out, rate())], { type: "audio/wav" })
    };
    return st.take;
  };

  st.hasTap = () => !!st.tap;

  // --- clips and playback -------------------------------------------------
  st.loadClip = (name, buf) => { st.clip = { name, buf }; return st.clip; };

  st.playClip = async onEnded => {
    await st.ensureContext();
    // decodeAudioData takes the buffer over and detaches it, so it gets a copy
    // and the clip stays playable a second time.
    const audio = await st.ctx.decodeAudioData(st.clip.buf.slice(0));
    return startSource(audio, onEnded);
  };

  // Samples already in hand, played the same way without being a clip. The
  // test vowel uses it where the live voice cannot run.
  st.playSamples = async (samples, onEnded) => {
    await st.ensureContext();
    const audio = st.ctx.createBuffer(1, samples.length, st.ctx.sampleRate);
    audio.copyToChannel(samples, 0);
    return startSource(audio, onEnded);
  };

  const startSource = (audio, onEnded) => {
    // One source at a time. Overwriting st.play left the earlier one sounding
    // with nothing holding it, so no Stop could reach it.
    st.stopPlayback();
    st.voiceHalt();
    // The microphone comes off the analyser first, or the room would be mixed
    // into the take and measured with it.
    if (st.mic) { try { st.mic.disconnect(); } catch (e) {} }
    st.play = st.ctx.createBufferSource();
    st.play.buffer = audio;
    st.play.connect(st.analyser);
    // Straight to the speakers as well, and never through the analyser, which
    // would put a live microphone into a feedback loop.
    st.play.connect(st.ctx.destination);
    st.play.onended = () => { st.stopPlayback(); onEnded(); };
    st.play.start();
    return audio.duration;
  };

  st.stopPlayback = () => {
    if (!st.play) return;
    try { st.play.onended = null; st.play.stop(); } catch (e) {}
    try { st.play.disconnect(); } catch (e) {}
    st.play = null;
    // The microphone goes back on the analyser only if it is still open.
    if (st.mic) { try { st.mic.connect(st.analyser); } catch (e) {} }
  };

  st.playing = () => !!st.play;

  // --- the test voice -----------------------------------------------------
  // A synthesiser on the audio thread, worklet/voice.js, fed where the pointer
  // is on the vowel plane. Like a take played back it goes to the analyser and
  // the speakers, with the microphone off the analyser while it sounds.
  const openVoice = async () => {
    if (st.voice || st.voiceFailed) return st.voice;
    try {
      if (!st.ctx.audioWorklet) throw new Error("no AudioWorklet");
      await st.ctx.audioWorklet.addModule("worklet/voice.js?v=" + VERSION);
      st.voice = new AudioWorkletNode(st.ctx, "voice", { numberOfInputs: 0, outputChannelCount: [1] });
    } catch (e) {
      st.voiceFailed = true;
      st.voice = null;
    }
    return st.voice;
  };

  // Resolves true once sounding, or false where this browser cannot run it.
  st.voiceStart = async params => {
    await st.ensureContext();
    if (st.ctx.state === "suspended") { try { await st.ctx.resume(); } catch (e) {} }
    if (!(await openVoice())) return false;
    st.voiceGen++;
    st.stopPlayback();
    if (st.mic) { try { st.mic.disconnect(); } catch (e) {} }
    if (!st.voiceOn) {
      st.voice.connect(st.analyser);
      st.voice.connect(st.ctx.destination);
      st.voiceOn = true;
    }
    st.voice.port.postMessage({ ...params, gate: true });
    return true;
  };

  st.voiceSet = params => { if (st.voiceOn) st.voice.port.postMessage(params); };

  // Closed with its release, then taken off the analyser. A start that comes
  // in during the release keeps the voice connected: the generation count
  // tells this stop it is no longer the latest word.
  st.voiceStop = () => new Promise(resolve => {
    if (!st.voiceOn) return resolve();
    st.voice.port.postMessage({ gate: false });
    const gen = st.voiceGen;
    setTimeout(() => { if (gen === st.voiceGen) st.voiceHalt(); resolve(); }, 60);
  });

  // At once, for when something else needs the analyser now.
  st.voiceHalt = () => {
    if (!st.voiceOn) return;
    st.voice.port.postMessage({ gate: false });
    try { st.voice.disconnect(); } catch (e) {}
    st.voiceOn = false;
    if (st.mic && !st.play) { try { st.mic.connect(st.analyser); } catch (e) {} }
  };

  st.voicing = () => st.voiceOn;

  // --- downloads ----------------------------------------------------------
  // The extension follows what was actually produced, never what was asked
  // for: iOS hands back mp4 with AAC where everything else gives WebM.
  const extOf = blob => {
    const t = blob.type || "";
    return /wav/.test(t) ? "wav" : /ogg/.test(t) ? "ogg"
         : /mp4|aac|m4a/.test(t) ? "m4a" : "webm";
  };

  st.download = format => {
    const take = st.take;
    if (!take) return null;
    const blob = format === "wav" ? take.wav : take.compressed;
    if (!blob) return null;
    const d = take.at, p = n => String(n).padStart(2, "0");
    const name = "voice-" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
      + "-" + p(d.getHours()) + p(d.getMinutes()) + "." + extOf(blob);
    saveBlob(blob, name);
    return name;
  };

  // --- teardown -----------------------------------------------------------
  // Without this the microphone outlives the page on a soft navigation, and
  // the recording indicator stays lit with nothing on screen to say why.
  st.teardown = () => {
    st.stopPlayback();
    st.voiceHalt();
    try { if (st.rec && st.rec.state !== "inactive") st.rec.stop(); } catch (e) {}
    st.stopMic();
    try {
      if (st.tap) {
        if (st.tap.port) st.tap.port.onmessage = null;
        st.tap.onaudioprocess = null;
        st.tap.disconnect();
      }
    } catch (e) {}
    try { if (st.sink) st.sink.disconnect(); } catch (e) {}
    try { if (st.ctx) st.ctx.close(); } catch (e) {}
    st.ctx = null; st.analyser = null; st.tap = null; st.sink = null; st.ring = null;
  };

  return st;
};
