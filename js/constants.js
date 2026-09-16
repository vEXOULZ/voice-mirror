// Every constant the monitor runs on, and why it is what it is.
//
// These are the port's contract. Most carry a date and a measurement behind
// them, and several were arrived at by being wrong first. Read the comment
// before changing a number.

// --- pitch ---------------------------------------------------------------

// The pitch search range. The offline tool searches the same range, so neither
// can find a pitch the other would rule out.
export const F0_FLOOR = 60, F0_CEILING = 500;

// Analysis runs on a decimated copy. 48 kHz is far more than a voice needs and
// the correlation cost grows with the lag in samples. The anti-alias corner is
// the formant ceiling, so the same filtered signal feeds the formant stage
// without being filtered twice at two different edges.
export const WORK_RATE = 12000, AA_CUTOFF = 5500, AA_TAPS = 33;

export const FFT = 4096;        // 85 ms at 48 kHz: about 2.5 periods at the floor
export const FPS = 30;          // analysis frames per second
export const WINDOW_S = 10;     // seconds of trace on screen
export const READ_EVERY = 8;    // frames between readout updates, so text stays legible

// Below this it is a quiet room, not a quiet voice. 0.008 was calibrated on a
// take recorded at close range, and it threw away 226 of 380 voiced frames on
// a recording made at a normal distance. Located on both, 2026-09-08: recall
// saturates at 0.002 and going lower only admits room noise.
export const RMS_GATE = 0.002;

// Calibrate replaces it for the session by listening to the room. The bounds
// stop a calibration done by mistake, mid-sentence or with the microphone
// muted, from setting something unusable.
export const CAL_SECONDS = 4, CAL_OVER = 2.0, CAL_MIN = 0.0004, CAL_MAX = 0.02;

export const CLARITY = 0.55;    // an NSDF peak under this is not a periodic sound
export const OCTAVE_TOL = 0.9;  // accept the first peak within this share of the best

// --- formants ------------------------------------------------------------
// Order 12 is 2 x 5 formants + 2, mirroring five formants at a 5500 Hz
// ceiling offline, so the live estimate and the measured one look for the same
// thing. The decimated signal is already band-limited to that ceiling, so no
// second filter is needed.
export const LPC_ORDER = 12, LPC_WIN = 384;   // 32 ms at the working rate
export const PRE_EMPH = 0.97;
export const F_MIN = 90, F_MAX = 5500;

// It used to be 400, and on real speech the true F1 pole's estimated bandwidth
// wanders either side of that, so it dropped out on about a third of frames.
// Measured 2026-09-08 on a real take: the pole was present in every frame and
// thrown away in five of nine consecutive ones. Widening alone was not the fix
// - 500 through 900 all score identically on vowels whose formants are known,
// and 1200 is worse, because a wide spurious pole then sits between F1 and F2
// and the selection below takes it. What fixed the jumping was the ranges.
export const BW_MAX = 500;

// What actually picks the pair. A formant has to be somewhere plausible, the
// two have to be apart, and between what is left the pair nearest the previous
// frame wins: formants move, but never by a whole formant in a thirtieth of a
// second. This replaced "take the two lowest poles", which had nothing to say
// when a pole went missing.
export const F1_RANGE = [200, 1200], F2_RANGE = [700, 3200], MIN_GAP = 200;
export const CONT_W = 2;

// F3 rides along for the vocal tract length only. It is noisier than F1 and
// F2, so it never takes part in choosing them and a frame without a plausible
// one simply reports no length.
export const F3_RANGE = [1800, 4500], F3_GAP = 150;

// Speed of sound in warm, moist air, cm/s, and the same constant the offline
// tool uses. A uniform tube of length L resonates every c/2L, so
// L = c / (F3 - F1). An index, not an anatomy measurement.
export const SOUND_SPEED = 35000;

// Semitones are measured from this reference, so a figure here reads the same
// as one on a record.
export const SEMITONE_REF = 100;

// --- what counts as a vowel ----------------------------------------------
// A formant estimate jitters frame to frame. The dot paints solidly only once
// F1 and F2 have held inside these over 60 ms, which are the offline drift
// limits, so the live tool and the offline one agree on what counts as a vowel
// instead of each having a private opinion.
//
// The offline span cannot come across with them: it is 3 frames at 10 ms
// there, which is seven frames per 60 ms, and 30 frames a second gives under
// two. So the span is measured in milliseconds and the limits are scaled to
// whatever span the frames actually landed on.
export const NUC_DF1 = 40, NUC_DF2 = 120, NUC_REF_MS = 60;
export const NUC_WINDOW_MS = 90, NUC_MIN_MS = 45;

// The live estimate is noisier per frame than Praat's, so demanding the same
// absolute drift rejects vowels the offline tool accepts. Measured 2026-09-08
// against the nuclei the offline tool wrote for the same recording: at 1.0 the
// live pass found 0.74 nuclei a second against the offline 2.3, and at 1.5 it
// finds 1.63 with the share landing on an offline nucleus barely moved, 74% to
// 71%. At 2.0 it overshoots and that share falls to 62%.
export const NUC_TOL = 1.5;

// A nucleus has to be corroborated by the next one, within this distance,
// before it moves the dot. One frame that is internally steady but sitting on
// the wrong formant track cannot be corroborated; a real vowel always is. This
// is what let the tolerance above be loosened without the jumping coming back.
export const CONFIRM_BARK = 0.5;
export const SMOOTH_N = 5;

// 0.7 settles in about three frames. Measured on 2026-09-08: below 0.55 the
// dot never arrives before the next vowel starts, so it is permanently in
// transit and reads as drift. Above 0.7 buys nothing.
export const GLIDE = 0.70;
export const TRAIL_N = 24;      // nuclei kept on the path
export const TRAIL_MIN = 0.20;  // Bark a nucleus must differ by to earn its own point

// --- brightness ----------------------------------------------------------
// Spectral centroid: the centre of mass of the spectrum, and the cheapest
// honest proxy for brightness. It is the thing the resonance drills move and
// the thing no single formant captures on its own.
export const BRIGHT_LO = 300, BRIGHT_HI = 5000;   // the band it is measured over
export const BRIGHT_SCALE = [600, 2600];          // the ends of the bar, in Hz

// --- what is drawn -------------------------------------------------------
export const GRID = [80, 100, 125, 150, 175, 200, 250, 300, 400, 500];

// The formant track, on the same axis and in the same colours the offline
// tool's per-recording charts use, so the live picture and the measured one
// are recognisably the same picture.
export const TRACK_MAX = 3800;
export const TRACK_GRID = [1000, 2000, 3000];
export const TRACK_TONE = [["F1", "#6A9FB5"], ["F2", "#B85450"], ["F3", "#82B366"]];

// The vowel plane, on the axes the phonetic convention uses.
export const PLANE_F2 = [200, 4000], PLANE_F1 = [200, 1250];

// The test vowel: how long one click sounds, and the pitch range it accepts,
// which is the range the pitch tracker can report.
export const TONE_SECONDS = 1.5, TONE_PITCH = 180;
export const REF_TONE = { m: "rgb(74,144,194)", w: "rgb(232,111,166)" };
export const REF_NAME = { m: "men", w: "women" };

// Bark, per axis, before an axis is called off in the advice.
export const TOL = 0.3;

// --- recording -----------------------------------------------------------
// Thirty seconds of the microphone, kept whether or not Record was pressed.
// The take worth keeping is the one you were not recording, and by the time
// you know it was good it has gone.
export const REWIND_S = 30;

// The tap block, the same size as the analysis window so neither stage waits
// on the other. Larger is safer against dropouts and no worse here.
export const TAP = 4096;

// The cap on the PCM captured alongside a recording, so a take left running
// cannot eat the tab. Ten minutes is about 58 MB at 48 kHz mono Int16. Past
// it the PCM stops and the compressed recorder keeps going.
export const PCM_CAP_S = 600;
