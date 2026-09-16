# Voice mirror

A browser page that shows you your pitch and your vowel while you are making them. Open it, press Start, allow the microphone, and speak. It is for voice practice, where seeing what you are doing as you do it is the whole point.

**Everything stays in the browser.** No upload, no server, no account, no analytics, no cookies. The microphone is released when you press Stop or close the tab, and every figure on screen dies with it. A recording exists only until you download it or leave the page. The page is static files; there is nothing behind it to send anything to.

**The one thing kept is your settings**: theme, which panels are on, your pitch bands, and a reference file if you loaded one. They sit in this browser's own storage, on this machine, and nowhere else. Nothing about your voice is ever in them.

> **Two things share the name `voice-analysis`.** This repository is the **live** half: a mirror, in a browser, in real time. The other is a Python tool that measures a finished recording with Praat and writes the numbers into a note. This one shows you a direction; that one produces a measurement. They share their constants on purpose, so the two look for the same things.

## What it shows

- **Pitch**, as a trace over the last ten seconds, against reference bands you can set yourself, with the share of voiced time spent inside each band. Bands can overlap, so the shares can add up to more than 100%.
- **Formants**, F1, F2 and F3 over the same ten seconds, per frame, in the colours the offline tool's own charts use. Gaps are unvoiced.
- **Brightness**, the spectral centroid: one number for how far forward the sound is placed. It is what the resonance drills move and what a pitch trace says nothing about.
- **Intonation variability**, the standard deviation of f0 in semitones. A flat delivery reads as masculine whatever its height.
- **Vocal tract length**, from the spacing of F1 to F3. It shortens when the larynx rises. An index, not an anatomy measurement.
- **The vowel plane**, F1 and F2 on the phonetic axes, with published reference vowels as diamonds and their convex hulls. Pick a target vowel and it gives the distance in Bark to both reference sets and the lever to move.

Every panel can be switched off in **Settings**. All of them at once is more than anyone reads while also trying to speak, and the choice is remembered in this browser.

**No target is drawn, and none is implied.** Where a reference band sits is a fact. Which of them is a goal is between you and your clinician, so both reference sets are always shown and neither is preferred.

## What it is not

**It is not a measurement of you.** The analysis runs on 85 milliseconds of sound at a time, in a browser, through different algorithms from the ones a clinic uses, and its numbers are not comparable with a clinical report or with the Python tool's. Read it as a direction, never as a value, and never against a threshold.

**Running speech sits inside the diamonds** even when nothing about a voice differs, because vowels reduce toward the centre when they are not said in isolation. Read position and spread, not distance to a diamond.

**It cannot tell you how you sound to other people.** Pitch, resonance and intonation are three of the things that matter and they are the three it can measure. Nothing here judges a voice.

## Running it

It is static files, so any web server will do:

```bash
python -m http.server 8731
```

Then open `http://localhost:8731`. **A microphone needs a secure origin**, which means `https://` or `localhost`; opening `index.html` as a `file://` URL will not work, because ES modules and `fetch` both refuse it.

To publish it: push the repository, turn on GitHub Pages for the default branch, and that is the whole deployment. `.nojekyll` keeps Pages from touching the folder. Nothing needs building.

## Recording

**Record** captures the take twice at once: compressed through `MediaRecorder`, and lossless 16-bit PCM off the same stream. **Download** then gives you either. The WAV matters because perturbation measures cannot be computed from a lossy file, so a take you can only have as WebM is worth less later.

The lossless capture is capped at ten minutes, about 58 MB. Past the cap it stops and the compressed recorder keeps going, and the page says so.

**Keep last 30s** turns the last thirty seconds the microphone heard into a take, whether or not Record was on, because the take worth keeping is the one you were not recording. It is WAV only: the compressed recorder was not running, and the greyed-out option says so rather than pretending. The buffer runs from the moment you press Start and survives pressing Stop.

**Play back** runs a take, or any audio file from disk, through the same analysis, so everything moves as it did live without the room adding to it. Dropping a file anywhere on the page loads it. Loading a file writes nothing and sends nothing.

## Reference data

The page ships with the reference below, and **Settings** is where you replace any of it:

- **Pitch bands** are edited directly: name, low, high and colour per band, add or remove rows. Bands may overlap, and a band can be kept off the trace while still counted. The trace and the share meters follow as you type, and the whole session is recounted against the new edges rather than half of it being counted against the old ones.
- **Reference vowels**, the diamonds and the Target list, come from a JSON file. Write one in the format in [`data/reference.md`](data/reference.md) and press **Load reference**, or drop the file anywhere on the page. It is read in the browser, saved there so it is still loaded next time, and never uploaded. A file can carry its own pitch bands and practice sentences too.
- **Export settings** writes all of it, a loaded reference included, to one JSON file. **Import settings** on another machine or another browser puts it back. That file is also your backup: clearing site data clears settings, and nothing else holds a copy.

| What | Where it comes from |
|---|---|
| Pitch bands | Very low 60-80, male 80-140, androgynous 140-175, female 175-275 and very high 275-500 Hz. The male and female ranges are the typical speaking ranges the voice-training apps in common clinical use draw; the other three name what lies between and beyond them. **Not from a paper**, and not a norm: a practical reference for placing a reading at a glance. Set your own in Settings. |
| American English vowels | Hillenbrand, Getty, Clark and Wheeler (1995), *JASA* 97, 3099-3111. Means over that study's published steady-state measurements, 45 men and 48 women, h-V-d words read in isolation. |
| Brazilian Portuguese vowels | Escudero, Boersma, Rauber and Bion (2009), *JASA* 126, 1379-1393, Table I. Geometric averages over ten women and ten men, one stressed vowel in a carrier sentence. |

Both vowel studies recorded people reading **isolated words**, which is why connected speech sits inside them. Neither was collected from trans speakers, and neither is a norm for anyone.

## How it works

**The browser's own speech processing is switched off.** `echoCancellation`, `noiseSuppression` and `autoGainControl` are all requested as false. Each exists to make a voice survive a phone line, and each one alters the thing being looked at. Automatic gain in particular destroys any reading of how loud you were.

**Analysis runs on a decimated copy at about 12 kHz.** The correlation cost grows with the lag in samples, and at 48 kHz the lag for a 60 Hz voice is 800 samples. Decimating by four makes it 200, which is the difference between a loop that fits in a frame and one that does not. The anti-alias filter corners at 5500 Hz, the formant ceiling, so the same filtered signal feeds the formant stage without being filtered twice at two different edges.

**Pitch is normalised square difference**, the McLeod method: the autocorrelation at each lag divided by the energy of the two windows compared, which stops a fading note from reading as a falling one. The first peak within 90% of the best is taken rather than the best itself, because the best is frequently an octave below what you produced. Two gates decide voiced or unvoiced, and an unvoiced frame draws a gap, never a guess.

**Formants are LPC at order 12**, rooted by Durand-Kerner so every pole comes with a bandwidth, which peak-picking a spectrum cannot give. Which two poles are F1 and F2 is the decision that matters, and three rules make it: plausible ranges, F2 is the next resonance above F1 rather than the narrowest pole above it, and among what survives the pair nearest the previous frame wins.

**The dot moves only on held vowels.** A five-frame median smooths the jitter, the dot paints faint until F1 and F2 have held still for 60 ms, and a nucleus has to be corroborated by the next one before it moves anything. Between vowels the dot eases rather than jumping, so it rests instead of scribbling, and the path behind it breaks where voicing broke rather than drawing a movement that never happened.

Every constant carries the measurement that set it, in [`js/constants.js`](js/constants.js). Several were arrived at by being wrong first, and the comments say so. Read the comment before changing a number.

**The formant track draws per-frame estimates, and the dot does not.** The dot answers which vowel you are on, and a median helps it; the track answers what the formants are doing, and smoothing would hide the answer. So the two can disagree for a frame or two, and that is correct.

**Drawing is a raw canvas, not a charting library.** One of these is redrawn thirty times a second, which is the worst case there is for a chart instance that watches the document for changes.

**The microphone tap is an `AudioWorklet`**, so the rewind buffer is filled on the audio thread, with a `ScriptProcessorNode` fallback for browsers without one.

## Tests

```bash
node --test test/dsp.test.js
```

The pure half is in [`js/dsp.js`](js/dsp.js) and needs no browser, no microphone and no recording. The signals are synthesised from stated pitch and formant values, so a failure says which stage broke. Covered: pitch across the search range and the octave trap, unvoiced rejection for a quiet room and for loud noise, formants recovered from known poles, the wide-F1 case, F2 selection against a narrow high pole, Bark, hull area, vocal tract length, the nucleus and glide rules, and the WAV header byte by byte. On the settings side: a bad field falls back on its own without taking the rest with it, export and import round-trip, band colours survive the colour input, a reference file handed to Import is named as one, and each band counts a pitch on its own, overlapping or not.

## Browsers

Desktop and Android give WebM with Opus; iOS gives mp4 with AAC, and the download follows what was actually produced. iOS also hands back a suspended `AudioContext`, which is why Start has to be a tap. Where `MediaRecorder` is missing entirely, Start still works and Record is disabled rather than the page dying.

## Licence

[GNU Affero General Public License](LICENSE), version 3 or, at your option, any later version.

You can use, change and share this, commercially or not. If you distribute a modified version, or let people use one over a network, you have to offer them its source under the same licence. That second half is the point: a fork that sends anything to a server has to show its code to the people using it.

The reference values in `data/reference.json` are figures from the published studies cited there. The licence covers this repository's code and writing, not those studies.
