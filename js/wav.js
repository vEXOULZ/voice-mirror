// 16-bit PCM in a RIFF container, the one format every decoder in this chain
// reads with no codec at all: the browser's own for playback, and ffmpeg's
// inside the offline tool if the take gets filed.
//
// Returns an ArrayBuffer rather than a Blob, so the encoder is testable
// outside a browser and the caller decides what to wrap it in.

// The 44-byte header for n mono samples, with the samples still to write.
const withHeader = (n, rate) => {
  const out = new ArrayBuffer(44 + n * 2);
  const v = new DataView(out);
  const str = (at, s) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  return { out, v };
};

export const encodeWav = (samples, rate) => {
  const n = samples.length;
  const { out, v } = withHeader(n, rate);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
};

// Int16 is what the capture keeps, to halve the memory a long take costs, and
// it goes into the file as it is. Widening it back to float first cost a
// second copy twice the size of the file, 115 MB for a ten-minute take, and
// took a least significant bit off every positive sample on the way.
export const encodeWavChunks = (chunks, rate) => {
  let n = 0;
  for (const c of chunks) n += c.length;
  const { out, v } = withHeader(n, rate);
  let at = 44;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++, at += 2) v.setInt16(at, c[i], true);
  }
  return out;
};

export const floatToInt16 = x => {
  const out = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};
